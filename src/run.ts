import type { ArgsSchema } from "./schema.ts";
import type { AnyCommandDef, CommandDef } from "./command.ts";
import { assertUniqueEnvNames, commandEnvPath, registerCommandPath } from "./environment.ts";
import { HackshExitError, HackshPromptError, summarizeError, HackshUsageError } from "./errors.ts";
import { createExec, type ExecContext } from "./exec.ts";
import { createLogger } from "./logger.ts";
import { findPackageVersion } from "./package-version.ts";
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
  type OutputFormat,
  type Printer,
  type PrintQueue,
  type TerminalInput,
} from "./printer.ts";
import { PromptController } from "./prompts.ts";
import { TerminalLock } from "./terminal.ts";
import { selectOutputPrinter, type OutputOptions } from "./output.ts";
import { showUsage } from "./usage.ts";

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
      assertUniqueEnvNames(
        segments.map(({ command }) => ({ command, path: commandEnvPath(command) })),
      );
      return { ...segment, parents, segments };
    }
    const key = remaining[index]!;
    const child = command.subCommands?.[key];
    if (!child) throw new HackshUsageError(`Unknown command \`${key}\``, command);
    const prefix = remaining.slice(0, index);
    const segment = { command, rawArgs: prefix, tokenized: tokenizedBefore(tokenized, index) };
    parents.push(segment);
    segments.push(segment);
    const parentPath = commandEnvPath(command);
    command = {
      ...child,
      name: child.name ?? key,
      allowUnknownArgs: child.allowUnknownArgs ?? command.allowUnknownArgs,
    };
    registerCommandPath(command, parentPath === undefined ? undefined : [...parentPath, key]);
    remaining = remaining.slice(index + 1);
  }
}

async function executeCommand<S extends ArgsSchema>(
  root: CommandDef<S>,
  argv: string[],
  output: PreparedOutput,
  env: ExecContext["env"],
  signal: AbortSignal,
  fallbackVersion: () => Promise<string | undefined> = async () => undefined,
): Promise<unknown> {
  const { printer } = output;
  const argEnv = env ?? process.env;
  const resolved = resolveCommand(root, argv);
  if (resolved.segments[0]?.tokenized.version) {
    const version = root.version ?? (await fallbackVersion()) ?? "";
    await printer.print({ type: "version", version });
    return undefined;
  }
  if (resolved.segments.some(({ tokenized }) => tokenized.help)) {
    await showUsage(resolved.command, { printer });
    return undefined;
  }

  for (const parent of resolved.parents) {
    await parseCommandArgs(
      parent.command,
      parent.rawArgs,
      parent.tokenized,
      argEnv,
      commandEnvPath(parent.command),
    );
  }
  const parsed = await parseCommandArgs(
    resolved.command,
    resolved.rawArgs,
    resolved.tokenized,
    argEnv,
    commandEnvPath(resolved.command),
  );
  if (!resolved.command.run) {
    throw new HackshUsageError("No command specified", resolved.command);
  }
  signal.throwIfAborted();
  const category = resolved.segments.flatMap(({ command }) =>
    command.name === undefined ? [] : [command.name],
  );
  return resolved.command.run({
    command: resolved.command,
    args: parsed.args,
    input: {
      argv: resolved.rawArgs,
      unknown: parsed.extraArgs,
      passthrough: parsed.passthrough,
    },
    logger: createLogger(printer, category),
    prompt: new PromptController({
      interactive: output.interactive,
      input: output.input,
      print: (event) => output.printChecked(event),
      terminal: output.terminal,
      signal,
    }),
    exec: createExec({
      env,
      mode: { format: output.format, interactive: output.interactive },
      print: (event) => printer.print(event),
      terminal: output.terminal,
      signal,
    }),
    signal,
  });
}

export interface RunCommandOptions extends OutputOptions {
  printer?: Printer;
  signal?: AbortSignal;
}

interface PreparedOutput extends PrintQueue {
  format: OutputFormat;
  interactive: boolean;
  input: TerminalInput;
  terminal: TerminalLock;
}

function prepareOutput(
  options: RunCommandOptions,
  env: Readonly<Record<string, string | undefined>>,
): PreparedOutput {
  const input = options.stdin ?? process.stdin;
  const mode = resolveOutputMode({
    output: options.output,
    env,
    inputIsTTY: input.isTTY,
    outputIsTTY: (options.stdout ?? process.stdout).isTTY,
  });
  return {
    ...createPrintQueue(selectOutputPrinter(options, options.printer, mode)),
    format: mode.format,
    interactive: mode.interactive,
    input,
    terminal: new TerminalLock(),
  };
}

type HandlerResult<C> = C extends { run?: infer Handler }
  ? Handler extends (...args: never[]) => infer R
    ? Awaited<R>
    : never
  : never;

type CommandResult<C> =
  | HandlerResult<C>
  | (C extends { subCommands?: infer Children }
      ? Children extends Record<string, AnyCommandDef>
        ? string extends keyof Children
          ? unknown
          : CommandResult<Children[keyof Children]>
        : never
      : never);

export function runCommand<C extends AnyCommandDef>(
  root: C,
  argv: string[],
  options?: RunCommandOptions,
): Promise<CommandResult<C> | undefined>;
export async function runCommand(
  root: AnyCommandDef,
  argv: string[],
  options: RunCommandOptions = {},
): Promise<unknown> {
  const output = prepareOutput(options, options.env ?? process.env);
  try {
    return await executeCommand(
      root,
      argv,
      output,
      options.env,
      options.signal ?? new AbortController().signal,
    );
  } finally {
    await output.drain();
  }
}

export interface RunMainOptions extends OutputOptions {
  onError?: (error: unknown) => void | Promise<void>;
  argv?: string[];
  printer?: Printer;
}

async function drainAndExit(output: PrintQueue, code = 1): Promise<never> {
  try {
    await output.drain();
  } finally {
    process.exit(code);
  }
}

function commandErrorExitCode(error: unknown): number {
  if (error instanceof HackshExitError) return error.exitCode;
  return error instanceof HackshPromptError && error.reason === "cancelled" ? 130 : 1;
}

const SIGNAL_EXIT_CODES = { SIGINT: 130, SIGTERM: 143 } as const;

function listenForExitSignals() {
  const controller = new AbortController();
  let exitCode: number | undefined;
  const listeners = Object.entries(SIGNAL_EXIT_CODES).map(([signal, code]) => {
    const listener = (): void => {
      if (exitCode !== undefined) process.exit(code);
      exitCode = code;
      controller.abort(new DOMException(`Received ${signal}`, "AbortError"));
    };
    process.on(signal, listener);
    return [signal, listener] as const;
  });
  return {
    signal: controller.signal,
    exitCode: () => exitCode,
    release(): void {
      for (const [signal, listener] of listeners) process.removeListener(signal, listener);
    },
  };
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

async function reportCommandError(error: unknown, output: PrintQueue): Promise<void> {
  if (error instanceof HackshExitError && error.message === "") return;
  await output.printer.print({ type: "error", error: summarizeError(error) });
  if (error instanceof HackshUsageError) {
    await showUsage(error.command, { printer: output.printer, stream: "stderr" });
  }
}

export async function runMain<S extends ArgsSchema>(
  command: CommandDef<S>,
  options: RunMainOptions = {},
): Promise<void> {
  let output: PreparedOutput;
  try {
    output = prepareOutput(options, options.env ?? process.env);
  } catch (error) {
    return reportOutputSetupError(error, options);
  }
  const signals = listenForExitSignals();
  const exit = (code: number): Promise<never> => {
    signals.release();
    return drainAndExit(output, signals.exitCode() ?? code);
  };
  try {
    await executeCommand(
      command,
      options.argv ?? process.argv.slice(2),
      output,
      options.env,
      signals.signal,
      () => findPackageVersion(process.argv[1]),
    );
  } catch (error) {
    if (options.onError) {
      await options.onError(error);
      return exit(commandErrorExitCode(error));
    }
    try {
      await reportCommandError(error, output);
    } finally {
      await exit(commandErrorExitCode(error));
    }
  } finally {
    signals.release();
  }
  const signalExitCode = signals.exitCode();
  if (signalExitCode !== undefined) return drainAndExit(output, signalExitCode);
  await output.drain();
}
