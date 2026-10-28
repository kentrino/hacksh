import type { HackshErrorSummary } from "./errors.ts";
import type { ExecCommand } from "./exec.ts";
import type { LogRecord } from "./logger.ts";
import { normalizeJson } from "./serialization.ts";
import type { UsageSummary } from "./usage.ts";

export type PrintStream = "stdout" | "stderr";
export type OutputPreference = "auto" | "pretty" | "json";
export type OutputFormat = Exclude<OutputPreference, "auto">;

export interface OutputMode {
  format: OutputFormat;
  interactive: boolean;
  color: boolean;
}

export interface ResolveOutputModeOptions {
  output?: OutputPreference;
  env?: Readonly<Record<string, string | undefined>>;
  inputIsTTY?: boolean;
  outputIsTTY?: boolean;
}

function fallbackValue(value: unknown): string {
  try {
    return String(value);
  } catch {
    return "[Unserializable]";
  }
}

function validatePreference(value: unknown, source: string): OutputPreference | undefined {
  if (value === undefined) return undefined;
  if (value === "auto" || value === "pretty" || value === "json") return value;
  throw new TypeError(
    `Invalid ${source} value ${fallbackValue(value)}; expected auto, pretty, or json`,
  );
}

function readEnvironment(
  env: Readonly<Record<string, string | undefined>>,
  key: string,
): string | undefined {
  try {
    return env[key];
  } catch {
    return undefined;
  }
}

/** Resolve output behavior once, before command routing or argument parsing. */
export function resolveOutputMode(options: ResolveOutputModeOptions = {}): OutputMode {
  const env = options.env ?? process.env;
  const configured = validatePreference(options.output, "output");
  const overridden = validatePreference(readEnvironment(env, "HACKSH_OUTPUT"), "HACKSH_OUTPUT");
  const requested = overridden ?? configured ?? "auto";
  const ci = Boolean(readEnvironment(env, "CI"));
  const format = requested === "auto" ? (ci ? "json" : "pretty") : requested;
  const inputIsTTY = options.inputIsTTY ?? process.stdin.isTTY === true;
  const outputIsTTY = options.outputIsTTY ?? process.stdout.isTTY === true;
  return {
    format,
    interactive: format === "pretty" && !ci && inputIsTTY && outputIsTTY,
    color: format === "pretty" && outputIsTTY && !readEnvironment(env, "NO_COLOR"),
  };
}

export interface UsagePrintEvent {
  type: "usage";
  usage: UsageSummary;
  text: string;
  stream: PrintStream;
}

export interface VersionPrintEvent {
  type: "version";
  version: string;
}

export interface ErrorPrintEvent {
  type: "error";
  error: HackshErrorSummary;
}

export interface LogPrintEvent {
  type: "log";
  record: LogRecord;
}

export interface PromptChoiceState {
  value: string;
  label: string;
  hint?: string;
  selected: boolean;
}

export type PromptStatus = "active" | "error" | "submitted" | "closed";

interface PromptStateBase {
  message: string;
  status: PromptStatus;
  error?: string;
}

export interface SelectPromptState extends PromptStateBase {
  kind: "select";
  choices: readonly PromptChoiceState[];
  value: string;
}

export interface ConfirmPromptState extends PromptStateBase {
  kind: "confirm";
  value: boolean;
  defaultValue?: boolean;
}

export interface TextPromptState extends PromptStateBase {
  kind: "text";
  value: string;
  placeholder?: string;
}

export type PromptState = SelectPromptState | ConfirmPromptState | TextPromptState;

export interface PromptPrintEvent {
  type: "prompt";
  prompt: PromptState;
}

export interface ExecPrintEvent {
  type: "exec";
  phase: "start" | "skip";
  command: Omit<ExecCommand, "cwd"> & { cwd?: string };
  stdio: {
    stdin: "ignore" | "input" | "inherit";
    stdout: "pipe" | "inherit";
    stderr: "pipe" | "inherit";
  };
  interactive: boolean;
}

/** A semantic, command- and schema-free output value emitted by hacksh. */
export type PrintEvent =
  | UsagePrintEvent
  | VersionPrintEvent
  | ErrorPrintEvent
  | LogPrintEvent
  | PromptPrintEvent
  | ExecPrintEvent;

/** Receives every output event produced by one command invocation. */
export interface Printer {
  print(event: PrintEvent): void | Promise<void>;
}

function isErrorLevel(level: LogRecord["level"]): boolean {
  return level === "warning" || level === "error" || level === "fatal";
}

export function eventStream(event: PrintEvent): PrintStream {
  if (event.type === "error" || event.type === "exec") return "stderr";
  if (event.type === "usage") return event.stream;
  if (event.type === "log" && isErrorLevel(event.record.level)) return "stderr";
  return "stdout";
}

export interface OutputWriter {
  write(text: string): unknown;
}

export interface TerminalInput {
  readonly isTTY?: boolean;
  readonly isRaw?: boolean;
  readonly readableFlowing?: boolean | null;
  setRawMode?(mode: boolean): unknown;
  resume(): unknown;
  pause(): unknown;
  on(event: string, listener: (...args: never[]) => void): unknown;
  removeListener(event: string, listener: (...args: never[]) => void): unknown;
}

export interface TerminalOutput extends OutputWriter {
  readonly isTTY?: boolean;
  readonly columns?: number;
}

export interface JsonPrinterOptions {
  stdout?: OutputWriter;
  stderr?: OutputWriter;
}

/** Create a one-semantic-event-per-line JSON printer. */
export function createJsonPrinter(options: JsonPrinterOptions = {}): Printer {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  return {
    print(event) {
      let serialized: string;
      try {
        serialized = JSON.stringify(normalizeJson(event));
      } catch {
        serialized = JSON.stringify({
          type: event.type,
          serializationError: "Event data could not be serialized",
        });
      }
      const line = `${serialized}\n`;
      (eventStream(event) === "stdout" ? stdout : stderr).write(line);
    },
  };
}

export interface PrintQueue {
  printer: Printer;
  printChecked(event: PrintEvent): Promise<void>;
  drain(): Promise<void>;
}

/** Serialize printer calls and retain failures until the invocation drains its output. */
export function createPrintQueue(target: Printer): PrintQueue {
  let pending: Promise<void> | undefined;
  let failure: unknown;
  let failed = false;

  function recordFailure(error: unknown): void {
    if (!failed) failure = error;
    failed = true;
  }

  function track(execution: Promise<void>, retainFailure: boolean): Promise<void> {
    const barrier = execution.catch((error: unknown) => {
      if (retainFailure) recordFailure(error);
    });
    pending = barrier;
    void barrier.then(() => {
      if (pending === barrier) pending = undefined;
    });
    return retainFailure ? barrier : execution;
  }

  function enqueue(event: PrintEvent, retainFailure: boolean): void | Promise<void> {
    if (pending)
      return track(
        pending.then(() => target.print(event)),
        retainFailure,
      );
    try {
      const result = target.print(event);
      if (result) return track(Promise.resolve(result), retainFailure);
    } catch (error) {
      if (retainFailure) recordFailure(error);
      else return Promise.reject(error);
    }
  }

  const printer: Printer = {
    print(event) {
      return enqueue(event, true);
    },
  };

  return {
    printer,
    async printChecked(event) {
      await enqueue(event, false);
    },
    async drain() {
      await pending;
      if (failed) throw failure;
    },
  };
}
