import type { Printer } from "./printer.ts";
import { summarizeErrors } from "./errors.ts";

export const LOG_LEVELS = ["trace", "debug", "info", "warning", "error", "fatal"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

const LOG_LEVEL_RANK: Readonly<Record<LogLevel, number>> = {
  trace: 0,
  debug: 1,
  info: 2,
  warning: 3,
  error: 4,
  fatal: 5,
};

export function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === "string" && Object.hasOwn(LOG_LEVEL_RANK, value);
}

export function meetsLogLevel(level: LogLevel, threshold: LogLevel): boolean {
  return LOG_LEVEL_RANK[level] >= LOG_LEVEL_RANK[threshold];
}

function formatInvalidValue(value: unknown): string {
  try {
    return String(value);
  } catch {
    return "[Unserializable]";
  }
}

export function validateLogLevel(value: unknown, source: string): LogLevel | undefined {
  if (value === undefined) return undefined;
  if (isLogLevel(value)) return value;
  throw new TypeError(
    `Invalid ${source} value ${formatInvalidValue(value)}; expected ${LOG_LEVELS.join(", ")}`,
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

/** Resolve the primary output log level threshold from options and HACKSH_LOG_LEVEL. */
export function resolveLogLevel(
  configured: LogLevel | undefined,
  env: Readonly<Record<string, string | undefined>>,
): LogLevel {
  const validatedConfigured = validateLogLevel(configured, "logLevel");
  const validatedOverridden = validateLogLevel(
    readEnvironment(env, "HACKSH_LOG_LEVEL"),
    "HACKSH_LOG_LEVEL",
  );
  return validatedOverridden ?? validatedConfigured ?? "trace";
}

/** Wrap a printer so only log events at or above `minLevel` are forwarded; non-log events always pass through. */
export function filterLogPrinter(printer: Printer, minLevel: LogLevel): Printer {
  if (minLevel === "trace") return printer;
  return {
    print(event) {
      if (event.type === "log" && !meetsLogLevel(event.record.level, minLevel)) return;
      return printer.print(event);
    },
  };
}

export type LogKind = "message" | "step" | "success";

export type LogProperties = Record<string, unknown>;

/** A structured message emitted by a command's logger. */
export interface LogRecord {
  level: LogLevel;
  kind: LogKind;
  category: readonly string[];
  message: string;
  rawMessage: string;
  properties: LogProperties;
  timestamp: number;
}

export interface Logger {
  readonly category: readonly string[];
  trace(message: string, properties?: LogProperties): void;
  debug(message: string, properties?: LogProperties): void;
  info(message: string, properties?: LogProperties): void;
  warn(message: string, properties?: LogProperties): void;
  error(message: string | Error, properties?: LogProperties): void;
  fatal(message: string | Error, properties?: LogProperties): void;
  step(message: string, properties?: LogProperties): void;
  success(message: string, properties?: LogProperties): void;
  with(properties: LogProperties): Logger;
  getChild(category: string): Logger;
}

function interpolate(message: string, properties: LogProperties): string {
  return message.replace(/\{([^{}]+)\}/g, (placeholder, key: string) => {
    if (!Object.hasOwn(properties, key)) return placeholder;
    try {
      return String(properties[key]);
    } catch {
      return placeholder;
    }
  });
}

function createBoundLogger(
  printer: Printer,
  category: readonly string[],
  boundProperties: LogProperties,
): Logger {
  function emit(
    level: LogLevel,
    kind: LogKind,
    input: string | Error,
    properties: LogProperties = {},
  ): void {
    const rawMessage = input instanceof Error ? input.message : input;
    const mergedProperties = { ...boundProperties, ...properties };
    if (input instanceof Error) mergedProperties.error = input;
    const summarizedProperties = summarizeErrors(mergedProperties) as LogProperties;

    void printer.print({
      type: "log",
      record: {
        level,
        kind,
        category,
        message: interpolate(rawMessage, mergedProperties),
        rawMessage,
        properties: summarizedProperties,
        timestamp: Date.now(),
      },
    });
  }

  return {
    category,
    trace: (message, properties) => emit("trace", "message", message, properties),
    debug: (message, properties) => emit("debug", "message", message, properties),
    info: (message, properties) => emit("info", "message", message, properties),
    warn: (message, properties) => emit("warning", "message", message, properties),
    error: (message, properties) => emit("error", "message", message, properties),
    fatal: (message, properties) => emit("fatal", "message", message, properties),
    step: (message, properties) => emit("info", "step", message, properties),
    success: (message, properties) => emit("info", "success", message, properties),
    with: (properties) =>
      createBoundLogger(printer, category, { ...boundProperties, ...properties }),
    getChild: (child) => createBoundLogger(printer, [...category, child], boundProperties),
  };
}

/** Create the logger for one command invocation. */
export function createLogger(printer: Printer, category: readonly string[]): Logger {
  return createBoundLogger(printer, [...category], {});
}
