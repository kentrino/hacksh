import type { ArgsSchema } from "./schema.ts";
import type { AnyCommandDef, CommandDef } from "./command.ts";
import { assertUniqueEnvNames, commandEnvPath, registerCommandPath } from "./environment.ts";
import {
  HackshError,
  HackshExitError,
  HackshPromptError,
  summarizeError,
  HackshUsageError,
} from "./errors.ts";
import { createOutput } from "./command-output.ts";
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
): Promise<number> {
  const { printer } = output;
  const argEnv = env ?? process.env;
  const resolved = resolveCommand(root, argv);
  if (resolved.segments[0]?.tokenized.version) {
    const version = root.version ?? (await fallbackVersion()) ?? "";
    await printer.print({ type: "version", version });
    return 0;
  }
  if (resolved.segments.some(({ tokenized }) => tokenized.help)) {
    await showUsage(resolved.command, { printer });
    return 0;
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
  const result = await resolved.command.run({
    command: resolved.command,
    args: parsed.args,
    input: {
      argv: resolved.rawArgs,
      unknown: parsed.extraArgs,
      passthrough: parsed.passthrough,
    },
    output: createOutput(printer),
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
  if (result === undefined) return 0;
  if (typeof result !== "number" || !Number.isInteger(result) || result < 0 || result > 255) {
    throw new TypeError("Exit code must be an integer from 0 to 255");
  }
  return result;
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
    errorOutputIsTTY: (options.stderr ?? process.stderr).isTTY,
  });
  return {
    ...createPrintQueue(selectOutputPrinter(options, options.printer, mode)),
    format: mode.format,
    interactive: mode.interactive,
    input,
    terminal: new TerminalLock(),
  };
}

export async function runCommand(
  root: AnyCommandDef,
  argv: string[],
  options: RunCommandOptions = {},
): Promise<number> {
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
  onError?: (error: HackshError) => void | Promise<void>;
  argv?: string[];
  printer?: Printer;
}

function commandErrorExitCode(error: HackshError): number {
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

async function reportCommandError(error: HackshError, output: PrintQueue): Promise<void> {
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
  const output = prepareOutput(options, options.env ?? process.env);
  const signals = listenForExitSignals();
  let exitCode: number | undefined;
  try {
    try {
      const result = await executeCommand(
        command,
        options.argv ?? process.argv.slice(2),
        output,
        options.env,
        signals.signal,
        () => findPackageVersion(process.argv[1]),
      );
      if (result !== 0) exitCode = result;
    } catch (error) {
      const signalExitCode = signals.exitCode();
      if (signalExitCode !== undefined && error === signals.signal.reason) {
        exitCode = signalExitCode;
      } else {
        if (!(error instanceof HackshError)) throw error;
        if (options.onError) await options.onError(error);
        else await reportCommandError(error, output);
        exitCode = commandErrorExitCode(error);
      }
    }
  } finally {
    try {
      await output.drain();
    } finally {
      signals.release();
    }
  }
  const code = signals.exitCode() ?? exitCode;
  if (code !== undefined) process.exit(code);
  else process.exitCode = 0;
}
