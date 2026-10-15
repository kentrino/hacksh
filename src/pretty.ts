import { inspect, styleText } from "node:util";
import type { HackshErrorSummary } from "./errors.ts";
import type { LogLevel, LogRecord } from "./logger.ts";
import { eventStream, type OutputWriter, type Printer, type PrintEvent } from "./printer.ts";

type PrettyMark = LogLevel | "step" | "success" | "usage" | "version" | "errorEvent";
type TextStyle = Parameters<typeof styleText>[0];

interface PrettySymbols {
  bar: string;
  marks: Record<PrettyMark, string>;
}

const unicodeSymbols: PrettySymbols = {
  bar: "│",
  marks: {
    trace: "·",
    debug: "◆",
    info: "●",
    warning: "▲",
    error: "■",
    fatal: "✖",
    step: "◇",
    success: "✔",
    usage: "◆",
    version: "●",
    errorEvent: "■",
  },
};

const asciiSymbols: PrettySymbols = {
  bar: "|",
  marks: {
    trace: ".",
    debug: ":",
    info: "i",
    warning: "!",
    error: "x",
    fatal: "X",
    step: ">",
    success: "+",
    usage: "?",
    version: "i",
    errorEvent: "x",
  },
};

const markStyles: Record<PrettyMark, TextStyle> = {
  trace: "gray",
  debug: "magenta",
  info: "blue",
  warning: "yellow",
  error: "red",
  fatal: ["bgRed", "white", "bold"],
  step: "cyan",
  success: "green",
  usage: "cyan",
  version: "blue",
  errorEvent: "red",
};

export interface PrettyPrinterOptions {
  color: boolean;
  unicode: boolean;
  stdout?: OutputWriter;
  stderr?: OutputWriter;
}

function safelyInspect(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return inspect(value, {
      breakLength: 80,
      colors: false,
      compact: false,
      depth: null,
      sorted: true,
    });
  } catch {
    return "[Unserializable]";
  }
}

function propertyLines(properties: Readonly<Record<string, unknown>>): string[] {
  const lines: string[] = [];
  for (const key of Object.keys(properties).sort()) {
    const rendered = `  ${key}: ${safelyInspect(properties[key])}`.split("\n");
    lines.push(rendered[0] ?? "");
    for (const continuation of rendered.slice(1)) lines.push(`    ${continuation}`);
  }
  return lines;
}

function logLines(record: LogRecord): string[] {
  const category = record.category.length > 0 ? `[${record.category.join(":")}] ` : "";
  const message = record.message.split("\n");
  return [
    `${category}${message[0] ?? ""}`,
    ...message.slice(1),
    ...propertyLines(record.properties),
  ];
}

function errorLines(error: HackshErrorSummary): string[] {
  const lines = error.message.split("\n");
  const details: Record<string, unknown> = {};
  if (error.cause !== undefined) details.cause = error.cause;
  if (error.properties !== undefined) Object.assign(details, error.properties);
  if (error.value !== undefined) details.value = error.value;
  return [...lines, ...propertyLines(details)];
}

function eventMark(event: PrintEvent): PrettyMark {
  if (event.type === "usage") return "usage";
  if (event.type === "version") return "version";
  if (event.type === "error") return "errorEvent";
  return event.record.kind === "message" ? event.record.level : event.record.kind;
}

function eventLines(event: PrintEvent): string[] {
  switch (event.type) {
    case "usage":
      return event.text.split("\n");
    case "version":
      return event.version.split("\n");
    case "error":
      return errorLines(event.error);
    case "log":
      return logLines(event.record);
  }
}

function colorize(enabled: boolean, style: TextStyle, text: string): string {
  return enabled ? styleText(style, text, { validateStream: false }) : text;
}

/** Create the fixed human-readable renderer used for pretty output. */
export function createPrettyPrinter(options: PrettyPrinterOptions): Printer {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const symbols = options.unicode ? unicodeSymbols : asciiSymbols;

  return {
    print(event) {
      const mark = eventMark(event);
      const lines = eventLines(event);
      const firstPrefix = colorize(options.color, markStyles[mark], symbols.marks[mark]);
      const barPrefix = colorize(options.color, "gray", symbols.bar);
      const rendered = lines
        .map((line, index) => `${index === 0 ? firstPrefix : barPrefix}${line ? `  ${line}` : ""}`)
        .join("\n");
      (eventStream(event) === "stdout" ? stdout : stderr).write(`${rendered}\n`);
    },
  };
}
