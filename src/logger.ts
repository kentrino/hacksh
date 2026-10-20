import type { Printer, TerminalInput } from "./printer.ts";
import { summarizeErrors } from "./errors.ts";
import type { Prompter } from "./prompts.ts";
import { PromptController } from "./prompts.ts";
import type { TerminalLock } from "./terminal.ts";

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

export interface Logger extends Prompter {
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
  prompts: PromptController,
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
    select: (options) => prompts.select(options),
    confirm: (options) => prompts.confirm(options),
    text: (options) => prompts.text(options),
    with: (properties) =>
      createBoundLogger(printer, category, { ...boundProperties, ...properties }, prompts),
    getChild: (child) => createBoundLogger(printer, [...category, child], boundProperties, prompts),
  };
}

export interface CreateLoggerOptions {
  interactive: boolean;
  input: TerminalInput;
  printPrompt(event: Parameters<Printer["print"]>[0]): Promise<void>;
  terminal: TerminalLock;
  signal: AbortSignal;
}

/** Create the logger for one command invocation. */
export function createLogger(
  printer: Printer,
  category: readonly string[],
  options: CreateLoggerOptions,
): Logger {
  const prompts = new PromptController({
    interactive: options.interactive,
    input: options.input,
    print: (event) => options.printPrompt(event),
    terminal: options.terminal,
    signal: options.signal,
  });
  return createBoundLogger(printer, [...category], {}, prompts);
}
