import { inspect, stripVTControlCharacters, styleText } from "node:util";
import type { HackshErrorSummary } from "./errors.ts";
import type { LogLevel, LogRecord } from "./logger.ts";
import {
  eventStream,
  type OutputWriter,
  type Printer,
  type PrintEvent,
  type TerminalOutput,
} from "./printer.ts";

type PrettyMark = LogLevel | "step" | "success" | "usage" | "version" | "errorEvent" | "prompt";
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
    prompt: "?",
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
    prompt: "?",
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
  prompt: "cyan",
};

export interface PrettyPrinterOptions {
  color: boolean;
  unicode: boolean;
  stdout?: TerminalOutput;
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
  if (event.type === "prompt") return event.prompt.status === "submitted" ? "success" : "prompt";
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
    case "prompt": {
      const { prompt } = event;
      if (prompt.status === "submitted") {
        const result =
          prompt.kind === "select"
            ? (prompt.choices.find(({ value }) => value === prompt.value)?.label ?? prompt.value)
            : prompt.kind === "confirm"
              ? prompt.value
                ? "Yes"
                : "No"
              : prompt.value;
        return [`${prompt.message}: ${result}`];
      }
      const lines = [prompt.message];
      if (prompt.kind === "select") {
        for (const choice of prompt.choices) {
          lines.push(
            `${choice.selected ? ">" : " "} ${choice.label}${choice.hint ? ` — ${choice.hint}` : ""}`,
          );
        }
      } else if (prompt.kind === "confirm") {
        lines.push(
          `${prompt.value ? "Yes" : "No"}${prompt.defaultValue === undefined ? "" : ` (default: ${prompt.defaultValue ? "yes" : "no"})`}`,
        );
      } else {
        lines.push(prompt.value || (prompt.placeholder ? `(${prompt.placeholder})` : ""));
      }
      if (prompt.error) lines.push(prompt.error);
      return lines;
    }
  }
}

function colorize(enabled: boolean, style: TextStyle, text: string): string {
  return enabled ? styleText(style, text, { validateStream: false }) : text;
}

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const combiningMark = /\p{Mark}/u;
const pictograph = /\p{Extended_Pictographic}/u;

function isWideCodePoint(codePoint: number): boolean {
  return (
    codePoint >= 0x1100 &&
    (codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x20000 && codePoint <= 0x3fffd))
  );
}

function displayWidth(text: string): number {
  let width = 0;
  for (const { segment } of graphemeSegmenter.segment(stripVTControlCharacters(text))) {
    if (segment === "\t") {
      width += 8 - (width % 8);
      continue;
    }
    if (
      pictograph.test(segment) ||
      Array.from(segment).some((value) => isWideCodePoint(value.codePointAt(0)!))
    ) {
      width += 2;
      continue;
    }
    for (const value of segment) {
      const codePoint = value.codePointAt(0)!;
      if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint < 0xa0)) continue;
      if (codePoint === 0x200d || (codePoint >= 0xfe00 && codePoint <= 0xfe0f)) continue;
      if (!combiningMark.test(value)) width += 1;
    }
  }
  return width;
}

function renderedRows(rendered: string, columns: number | undefined): number {
  const width =
    Number.isInteger(columns) && columns !== undefined && columns > 0 ? columns : undefined;
  return rendered.split("\n").reduce((rows, line) => {
    if (!width) return rows + 1;
    return rows + Math.max(1, Math.ceil(displayWidth(line) / width));
  }, 0);
}

/** Create the fixed human-readable renderer used for pretty output. */
export function createPrettyPrinter(options: PrettyPrinterOptions): Printer {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const symbols = options.unicode ? unicodeSymbols : asciiSymbols;
  let activePrompt: { rendered: string; lines: number } | undefined;

  function render(event: PrintEvent): string {
    const mark = eventMark(event);
    const lines = eventLines(event);
    const firstPrefix = colorize(options.color, markStyles[mark], symbols.marks[mark]);
    const barPrefix = colorize(options.color, "gray", symbols.bar);
    return lines
      .map((line, index) => `${index === 0 ? firstPrefix : barPrefix}${line ? `  ${line}` : ""}`)
      .join("\n");
  }

  function eraseActivePrompt(): string {
    return activePrompt ? "\u001b[1A\u001b[2K".repeat(activePrompt.lines) : "";
  }

  return {
    print(event) {
      const rendered = render(event);
      if (event.type === "prompt") {
        const erase = eraseActivePrompt();
        if (event.prompt.status === "closed") {
          activePrompt = undefined;
          if (erase) stdout.write(erase);
          return;
        }
        if (event.prompt.status === "submitted") activePrompt = undefined;
        else activePrompt = { rendered, lines: renderedRows(rendered, stdout.columns) };
        stdout.write(`${erase}${rendered}\n`);
        return;
      }

      const erase = eraseActivePrompt();
      if (!activePrompt) {
        (eventStream(event) === "stdout" ? stdout : stderr).write(`${rendered}\n`);
        return;
      }

      stdout.write(erase);
      if (event.type === "error") activePrompt = undefined;
      (eventStream(event) === "stdout" ? stdout : stderr).write(`${rendered}\n`);
      if (activePrompt) stdout.write(`${activePrompt.rendered}\n`);
    },
  };
}
