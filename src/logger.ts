import type { Printer } from "./printer.ts";

export type LogLevel = "trace" | "debug" | "info" | "warning" | "error" | "fatal";

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
  return message.replace(/\{([^{}]+)\}/g, (placeholder, key: string) =>
    Object.hasOwn(properties, key) ? String(properties[key]) : placeholder,
  );
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

    void printer.print({
      type: "log",
      record: {
        level,
        kind,
        category,
        message: interpolate(rawMessage, mergedProperties),
        rawMessage,
        properties: mergedProperties,
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
