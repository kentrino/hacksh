import type { ArgsSchema } from "./schema.ts";
import type { AnyCommandDef, CommandDef } from "./command.ts";
import { HackshPromptError, summarizeError, ZittyUsageError } from "./errors.ts";
import { createLogger } from "./logger.ts";
import {
  parseCommandArgs,
  tokenizedBefore,
  tokenizeCommandArgs,
  type TokenizedCommandArgs,
} from "./parser.ts";
import {
  createJsonPrinter,
  createPrintQueue,
  resolveOutputMode,
  type Printer,
  type PrintQueue,
  type PrintStream,
  type TerminalInput,
} from "./printer.ts";
import { selectOutputPrinter, type OutputOptions } from "./output.ts";
import { showUsage, summarizeUsage, type ShowUsageCallback } from "./usage.ts";

export type { OutputOptions } from "./output.ts";

interface CommandSegment {
  command: AnyCommandDef;
  rawArgs: string[];
  tokenized: TokenizedCommandArgs;
}

interface ResolvedCommand extends CommandSegment {
  parents: CommandSegment[];
  segments: CommandSegment[];
}

function namedChild(child: AnyCommandDef, name: string): AnyCommandDef {
  return child.name ? child : { ...child, name };
}

function resolveCommand(root: AnyCommandDef, rawArgs: string[]): ResolvedCommand {
  let command = root;
  let remaining = rawArgs;
  const parents: ResolvedCommand["parents"] = [];
  const segments: ResolvedCommand["segments"] = [];

  for (;;) {
    const tokenized = tokenizeCommandArgs(command, remaining);
    const index = command.subCommands
      ? tokenized.tokens.find((token) => token.kind === "positional")?.index
      : undefined;
    if (index === undefined) {
      const segment = { command, rawArgs: remaining, tokenized };
      segments.push(segment);
      return { ...segment, parents, segments };
    }
    const name = remaining[index]!;
    const child = command.subCommands?.[name];
    if (!child) throw new ZittyUsageError(`Unknown command \`${name}\``, command);
    const prefix = remaining.slice(0, index);
    const segment = { command, rawArgs: prefix, tokenized: tokenizedBefore(tokenized, index) };
    parents.push(segment);
    segments.push(segment);
    command = namedChild(child, name);
    remaining = remaining.slice(index + 1);
  }
}

async function executeCommand<S extends ArgsSchema>(
  root: CommandDef<S>,
  argv: string[],
  displayUsage: ShowUsageCallback,
  printer: Printer,
  loggerOptions: Parameters<typeof createLogger>[2],
): Promise<unknown> {
  const resolved = resolveCommand(root, argv);
  if (resolved.segments[0]?.tokenized.version) {
    await printer.print({ type: "version", version: root.version ?? "" });
    return undefined;
  }
  if (resolved.segments.some(({ tokenized }) => tokenized.help)) {
    await printUsage(displayUsage, resolved.command, printer, "stdout");
    return undefined;
  }

  for (const parent of resolved.parents) {
    await parseCommandArgs(parent.command, parent.rawArgs, parent.tokenized);
  }
  const parsed = await parseCommandArgs(resolved.command, resolved.rawArgs, resolved.tokenized);
  if (!resolved.command.run) {
    throw new ZittyUsageError("No command specified", resolved.command);
  }
  const category = resolved.segments.flatMap(({ command }) =>
    command.name === undefined ? [] : [command.name],
  );
  return resolved.command.run({
    ...parsed,
    cmd: resolved.command,
    rawArgs: resolved.rawArgs,
    logger: createLogger(printer, category, loggerOptions),
  });
}

function printUsage(
  displayUsage: ShowUsageCallback,
  command: AnyCommandDef,
  printer: Printer,
  stream: PrintStream,
): void | Promise<void> {
  return displayUsage(command, {
    write: (text) => printer.print({ type: "usage", usage: summarizeUsage(command), text, stream }),
  });
}

export interface RunCommandOptions extends OutputOptions {
  printer?: Printer;
  showUsage?: ShowUsageCallback;
}

interface PreparedOutput extends PrintQueue {
  interactive: boolean;
  input: TerminalInput;
}

function prepareOutput(options: RunCommandOptions): PreparedOutput {
  const input = options.stdin ?? process.stdin;
  const mode = resolveOutputMode({
    output: options.output,
    env: options.env,
    inputIsTTY: input.isTTY,
    outputIsTTY: (options.stdout ?? process.stdout).isTTY,
  });
  return {
    ...createPrintQueue(selectOutputPrinter(options, options.printer, mode)),
    interactive: mode.interactive,
    input,
  };
}

export async function runCommand<S extends ArgsSchema>(
  root: CommandDef<S>,
  argv: string[],
  options: RunCommandOptions = {},
): Promise<unknown> {
  const output = prepareOutput(options);
  try {
    return await executeCommand(root, argv, options.showUsage ?? showUsage, output.printer, {
      interactive: output.interactive,
      input: output.input,
      printPrompt: (event) => output.printChecked(event),
    });
  } finally {
    await output.drain();
  }
}

export interface RunMainOptions extends OutputOptions {
  onError?: (error: unknown) => void | Promise<void>;
  argv?: string[];
  printer?: Printer;
  showUsage?: ShowUsageCallback;
}

async function drainAndExit(output: PrintQueue, code = 1): Promise<never> {
  try {
    await output.drain();
  } finally {
    process.exit(code);
  }
}

function commandErrorExitCode(error: unknown): number {
  return error instanceof HackshPromptError && error.reason === "cancelled" ? 130 : 1;
}

async function reportOutputSetupError(error: unknown, options: RunMainOptions): Promise<never> {
  if (options.onError) {
    await options.onError(error);
    return drainAndExit(createPrintQueue(options.printer ?? { print: () => undefined }));
  }

  const output = createPrintQueue(
    options.printer ??
      createJsonPrinter({
        stdout: options.stdout ?? process.stdout,
        stderr: options.stderr ?? process.stderr,
      }),
  );
  await output.printer.print({ type: "error", error: summarizeError(error) });
  return drainAndExit(output);
}

export async function runMain<S extends ArgsSchema>(
  command: CommandDef<S>,
  options: RunMainOptions = {},
): Promise<void> {
  const displayUsage = options.showUsage ?? showUsage;
  let output: PreparedOutput;
  try {
    output = prepareOutput(options);
  } catch (error) {
    return reportOutputSetupError(error, options);
  }
  try {
    await executeCommand(
      command,
      options.argv ?? process.argv.slice(2),
      displayUsage,
      output.printer,
      {
        interactive: output.interactive,
        input: output.input,
        printPrompt: (event) => output.printChecked(event),
      },
    );
  } catch (error) {
    if (options.onError) {
      await options.onError(error);
      return drainAndExit(output, commandErrorExitCode(error));
    }
    try {
      if (error instanceof ZittyUsageError) {
        await output.printer.print({ type: "error", error: summarizeError(error) });
        await printUsage(displayUsage, error.command, output.printer, "stderr");
      } else {
        await output.printer.print({
          type: "error",
          error: summarizeError(error),
        });
      }
    } finally {
      await drainAndExit(output, commandErrorExitCode(error));
    }
  }
  await output.drain();
}

export function createMain<S extends ArgsSchema>(
  command: CommandDef<S>,
  options: RunMainOptions = {},
): (argv?: string[]) => Promise<void> {
  return (argv) => runMain(command, argv === undefined ? options : { ...options, argv });
}
