import type { ArgsSchema } from "./schema.ts";
import type { AnyCommandDef, CommandDef } from "./command.ts";
import { ZittyUsageError } from "./errors.ts";
import {
  parseCommandArgs,
  tokenizedBefore,
  tokenizeCommandArgs,
  type TokenizedCommandArgs,
} from "./parser.ts";
import { consolePrinter, createPrintQueue, type Printer, type PrintStream } from "./printer.ts";
import { showUsage, type ShowUsageCallback } from "./usage.ts";

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
  return resolved.command.run({ ...parsed, cmd: resolved.command, rawArgs: resolved.rawArgs });
}

function printUsage(
  displayUsage: ShowUsageCallback,
  command: AnyCommandDef,
  printer: Printer,
  stream: PrintStream,
): void | Promise<void> {
  return displayUsage(command, {
    write: (text) => printer.print({ type: "usage", command, text, stream }),
  });
}

export interface RunCommandOptions {
  printer?: Printer;
  showUsage?: ShowUsageCallback;
}

export async function runCommand<S extends ArgsSchema>(
  root: CommandDef<S>,
  argv: string[],
  options: RunCommandOptions = {},
): Promise<unknown> {
  const output = createPrintQueue(options.printer ?? consolePrinter);
  try {
    return await executeCommand(root, argv, options.showUsage ?? showUsage, output.printer);
  } finally {
    await output.drain();
  }
}

export interface RunMainOptions {
  onError?: (error: unknown) => void | Promise<void>;
  argv?: string[];
  printer?: Printer;
  showUsage?: ShowUsageCallback;
}

export async function runMain<S extends ArgsSchema>(
  command: CommandDef<S>,
  options: RunMainOptions = {},
): Promise<void> {
  const displayUsage = options.showUsage ?? showUsage;
  const output = createPrintQueue(options.printer ?? consolePrinter);
  try {
    await executeCommand(
      command,
      options.argv ?? process.argv.slice(2),
      displayUsage,
      output.printer,
    );
  } catch (error) {
    if (options.onError) {
      await options.onError(error);
      await output.drain();
      process.exit(1);
    }
    try {
      if (error instanceof ZittyUsageError) {
        await output.printer.print({ type: "error", error, message: error.message });
        await printUsage(displayUsage, error.command, output.printer, "stderr");
      } else {
        await output.printer.print({
          type: "error",
          error,
          message: `Error: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    } finally {
      try {
        await output.drain();
      } finally {
        process.exit(1);
      }
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
