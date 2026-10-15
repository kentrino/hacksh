import type { HackshErrorSummary } from "./errors.ts";
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

/** A semantic, command- and schema-free output value emitted by hacksh. */
export type PrintEvent = UsagePrintEvent | VersionPrintEvent | ErrorPrintEvent | LogPrintEvent;

/** Receives every output event produced by one command invocation. */
export interface Printer {
  print(event: PrintEvent): void | Promise<void>;
}

function isErrorLevel(level: LogRecord["level"]): boolean {
  return level === "warning" || level === "error" || level === "fatal";
}

export function eventStream(event: PrintEvent): PrintStream {
  if (event.type === "error") return "stderr";
  if (event.type === "usage") return event.stream;
  if (event.type === "log" && isErrorLevel(event.record.level)) return "stderr";
  return "stdout";
}

function formatTextEvent(event: PrintEvent): string {
  switch (event.type) {
    case "usage":
      return event.text;
    case "version":
      return event.version;
    case "error":
      return event.error.kind === "usage" || event.error.kind === "validation"
        ? event.error.message
        : `Error: ${event.error.message}`;
    case "log":
      return event.record.message;
  }
}

/** The undecorated text printer used for pretty output until presentation is customized. */
export const consolePrinter: Printer = {
  print(event) {
    const text = formatTextEvent(event);
    return eventStream(event) === "stdout" ? console.log(text) : console.error(text);
  },
};

export interface OutputWriter {
  write(text: string): unknown;
}

export interface TerminalInput {
  readonly isTTY?: boolean;
}

export interface TerminalOutput extends OutputWriter {
  readonly isTTY?: boolean;
}

export interface JsonPrinterOptions {
  stdout?: OutputWriter;
  stderr?: OutputWriter;
}

export interface StreamPrinterOptions {
  stdout: OutputWriter;
  stderr: OutputWriter;
}

/** Create the undecorated stream-backed printer used by embedded pretty invocations. */
export function createStreamPrinter(options: StreamPrinterOptions): Printer {
  return {
    print(event) {
      const writer = eventStream(event) === "stdout" ? options.stdout : options.stderr;
      writer.write(`${formatTextEvent(event)}\n`);
    },
  };
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

  function track(result: void | Promise<void>): void | Promise<void> {
    if (!result) return undefined;

    const current = Promise.resolve(result).catch(recordFailure);
    pending = current;
    void current.then(() => {
      if (pending === current) pending = undefined;
    });
    return current;
  }

  const printer: Printer = {
    print(event) {
      if (pending) return track(pending.then(() => target.print(event)));
      try {
        return track(target.print(event));
      } catch (error) {
        recordFailure(error);
      }
    },
  };

  return {
    printer,
    async drain() {
      await pending;
      if (failed) throw failure;
    },
  };
}
