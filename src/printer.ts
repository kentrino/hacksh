import type { HackshErrorSummary } from "./errors.ts";
import type { LogRecord } from "./logger.ts";
import type { UsageSummary } from "./usage.ts";
import { stripVTControlCharacters } from "node:util";

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
    color: format === "pretty" && outputIsTTY && readEnvironment(env, "NO_COLOR") === undefined,
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

/** The undecorated text printer used for pretty output until presentation is customized. */
export const consolePrinter: Printer = {
  print(event) {
    switch (event.type) {
      case "usage":
        return event.stream === "stdout" ? console.log(event.text) : console.error(event.text);
      case "version":
        return console.log(event.version);
      case "error":
        return console.error(
          event.error.name.startsWith("Zitty")
            ? event.error.message
            : `Error: ${event.error.message}`,
        );
      case "log":
        return ["warning", "error", "fatal"].includes(event.record.level)
          ? console.error(event.record.message)
          : console.log(event.record.message);
    }
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
      switch (event.type) {
        case "usage": {
          (event.stream === "stdout" ? options.stdout : options.stderr).write(`${event.text}\n`);
          return;
        }
        case "version": {
          options.stdout.write(`${event.version}\n`);
          return;
        }
        case "error": {
          options.stderr.write(
            `${event.error.name.startsWith("Zitty") ? event.error.message : `Error: ${event.error.message}`}\n`,
          );
          return;
        }
        case "log": {
          (["warning", "error", "fatal"].includes(event.record.level)
            ? options.stderr
            : options.stdout
          ).write(`${event.record.message}\n`);
          return;
        }
      }
    },
  };
}

function jsonStream(event: PrintEvent): PrintStream {
  if (event.type === "error") return "stderr";
  if (event.type === "usage") return event.stream;
  if (event.type === "log" && ["warning", "error", "fatal"].includes(event.record.level)) {
    return "stderr";
  }
  return "stdout";
}

function fallbackValue(value: unknown): string {
  try {
    return String(value);
  } catch {
    return "[Unserializable]";
  }
}

function normalizeJson(value: unknown, ancestors = new Set<object>()): unknown {
  switch (typeof value) {
    case "string":
      return stripVTControlCharacters(value);
    case "boolean":
      return value;
    case "number":
      return Number.isFinite(value) ? value : null;
    case "bigint":
      return value.toString();
    case "undefined":
      return "[undefined]";
    case "symbol":
      return `[symbol:${value.description ?? ""}]`;
    case "function":
      return `[function:${value.name || "anonymous"}]`;
    case "object":
      break;
  }
  if (value === null) return null;
  if (ancestors.has(value)) return "[Circular]";

  const nextAncestors = new Set(ancestors).add(value);
  if (value instanceof Date) {
    try {
      return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
    } catch {
      return "Invalid Date";
    }
  }
  if (value instanceof Error) {
    const properties: Record<string, unknown> = {};
    const errorRecord = value as unknown as Record<string, unknown>;
    try {
      for (const key of Object.keys(value))
        properties[key] = normalizeJson(errorRecord[key], nextAncestors);
    } catch {
      properties.value = "[Unserializable]";
    }
    return {
      name: value.name,
      message: value.message,
      ...(value.stack === undefined ? {} : { stack: value.stack }),
      ...(value.cause === undefined ? {} : { cause: normalizeJson(value.cause, nextAncestors) }),
      ...properties,
    };
  }
  if (Array.isArray(value)) {
    try {
      return value.map((item) => normalizeJson(item, nextAncestors));
    } catch {
      return ["[Unserializable]"];
    }
  }
  if (value instanceof Map) {
    try {
      return [...value].map(([key, item]) => [
        normalizeJson(key, nextAncestors),
        normalizeJson(item, nextAncestors),
      ]);
    } catch {
      return "[Unserializable]";
    }
  }
  if (value instanceof Set) {
    try {
      return [...value].map((item) => normalizeJson(item, nextAncestors));
    } catch {
      return "[Unserializable]";
    }
  }

  const result: Record<string, unknown> = {};
  const record = value as Record<string, unknown>;
  try {
    for (const key of Object.keys(value)) {
      try {
        result[key] = normalizeJson(record[key], nextAncestors);
      } catch {
        result[key] = "[Unserializable]";
      }
    }
    return result;
  } catch {
    return fallbackValue(value);
  }
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
      (jsonStream(event) === "stdout" ? stdout : stderr).write(line);
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
