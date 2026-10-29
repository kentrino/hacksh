import { inspect, stripVTControlCharacters, styleText } from "node:util";
import type { HackshErrorSummary } from "./errors.ts";
import { formatExecCommand } from "./exec.ts";
import type { LogLevel, LogRecord } from "./logger.ts";
import {
  eventStream,
  type AutocompletePromptState,
  type OutputPrintEvent,
  type OutputWriter,
  type Printer,
  type PrintEvent,
  type StreamColors,
  type TerminalOutput,
} from "./printer.ts";
import { normalizeJson } from "./serialization.ts";

type DecoratedEvent = Exclude<PrintEvent, OutputPrintEvent>;

type PrettyMark =
  | LogLevel
  | "step"
  | "success"
  | "usage"
  | "version"
  | "errorEvent"
  | "prompt"
  | "exec"
  | "execSkip";
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
    exec: "$",
    execSkip: "#",
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
    exec: "$",
    execSkip: "#",
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
  exec: "gray",
  execSkip: "gray",
};

export interface PrettyPrinterOptions {
  /** One flag for both streams, or a flag per stream. */
  color: boolean | StreamColors;
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

function outputText(event: OutputPrintEvent): string {
  if (event.kind === "text") return event.text;
  return `${JSON.stringify(normalizeJson(event.data), null, 2)}\n`;
}

function eventMark(event: DecoratedEvent): PrettyMark {
  if (event.type === "usage") return "usage";
  if (event.type === "version") return "version";
  if (event.type === "error") return "errorEvent";
  if (event.type === "prompt") return event.prompt.status === "submitted" ? "success" : "prompt";
  if (event.type === "exec") return event.phase === "skip" ? "execSkip" : "exec";
  return event.record.kind === "message" ? event.record.level : event.record.kind;
}

function eventLines(event: DecoratedEvent): string[] {
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
          prompt.kind === "select" || prompt.kind === "autocomplete"
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
    case "exec": {
      const lines = [formatExecCommand(event.command)];
      if (event.command.cwd !== undefined) lines.push(...propertyLines({ cwd: event.command.cwd }));
      return lines;
    }
  }
}

function colorize(enabled: boolean, style: TextStyle, text: string): string {
  return enabled ? styleText(style, text, { validateStream: false }) : text;
}

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const invisibleGrapheme = /^[\p{Mark}\p{Cf}]+$/u;
const combiningMark = /[\p{Mark}\p{Cf}]/u;
const emoji = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u;

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

interface TerminalPosition {
  row: number;
  column: number;
}

function terminalPosition(text: string, columns: number | undefined): TerminalPosition {
  const width =
    Number.isInteger(columns) && columns !== undefined && columns > 0 ? columns : undefined;
  let row = 0;
  let column = 0;
  for (const { segment } of graphemeSegmenter.segment(stripVTControlCharacters(text))) {
    if (segment === "\n" || segment === "\r\n") {
      row += 1;
      column = 0;
      continue;
    }
    if (segment === "\r") {
      column = 0;
      continue;
    }
    if (invisibleGrapheme.test(segment)) continue;
    let cells = 0;
    if (segment === "\t") {
      cells = 8 - (column % 8);
    } else if (emoji.test(segment) || isWideCodePoint(segment.codePointAt(0)!)) {
      cells = 2;
    } else {
      for (const value of segment) {
        const point = value.codePointAt(0)!;
        if (point < 0x20 || (point >= 0x7f && point < 0xa0)) continue;
        if (!combiningMark.test(value)) cells += 1;
      }
    }
    if (cells === 0) continue;
    if (width && column + cells > width) {
      row += 1;
      column = 0;
    }
    column += width ? Math.min(cells, width) : cells;
  }
  return { row, column };
}

function renderedRows(rendered: string, columns: number | undefined): number {
  return terminalPosition(rendered, columns).row + 1;
}

interface ActivePrompt {
  rendered: string;
  lines: number;
  cursor?: TerminalPosition & { visible: boolean };
}

/** Create the fixed human-readable renderer used for pretty output. */
export function createPrettyPrinter(options: PrettyPrinterOptions): Printer {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const symbols = options.unicode ? unicodeSymbols : asciiSymbols;
  const colors =
    typeof options.color === "boolean"
      ? { stdout: options.color, stderr: options.color }
      : options.color;
  let activePrompt: ActivePrompt | undefined;

  function renderAutocomplete(prompt: AutocompletePromptState, color: boolean): string {
    const bar = colorize(color, "gray", symbols.bar);
    const accent = (text: string): string => colorize(color, "cyan", text);
    const muted = (text: string): string => colorize(color, "gray", text);
    const input = prompt.phase === "input";
    const lines = [
      `${accent(symbols.marks.prompt)}  ${prompt.message}`,
      `${bar}  ${input ? accent(">") : " "} ${prompt.query || muted(prompt.placeholder ?? "")} `,
      bar,
    ];
    for (const choice of prompt.choices) {
      lines.push(
        `${bar}  ${choice.selected ? accent(">") : " "} ${choice.selected ? accent(choice.label) : choice.label}${choice.hint ? ` ${muted(`— ${choice.hint}`)}` : ""}`,
      );
    }
    if (prompt.choices.length === 0) {
      lines.push(`${bar}    ${muted("No matches. Keep typing or backspace.")}`);
    }
    lines.push(bar);
    lines.push(
      `${bar}  ${muted(input ? "INPUT · type to filter · ↓ select · Esc cancel" : "SELECT · ↑/↓ move · Enter choose · Esc edit")}`,
    );
    if (prompt.error) lines.push(`${bar}  ${prompt.error}`);
    return lines.join("\n");
  }

  function render(event: DecoratedEvent): string {
    const color = colors[eventStream(event)];
    if (
      event.type === "prompt" &&
      event.prompt.kind === "autocomplete" &&
      event.prompt.status !== "submitted"
    ) {
      return renderAutocomplete(event.prompt, color);
    }
    const mark = eventMark(event);
    const lines = eventLines(event);
    const firstPrefix = colorize(color, markStyles[mark], symbols.marks[mark]);
    const barPrefix = colorize(color, "gray", symbols.bar);
    return lines
      .map((line, index) => `${index === 0 ? firstPrefix : barPrefix}${line ? `  ${line}` : ""}`)
      .join("\n");
  }

  function eraseActivePrompt(): string {
    if (!activePrompt) return "";
    if (activePrompt.cursor) {
      const up = activePrompt.cursor.row > 0 ? `\u001b[${activePrompt.cursor.row}A` : "";
      return `\u001b[?25l${up}\r\u001b[0J`;
    }
    return "\u001b[1A\u001b[2K".repeat(activePrompt.lines);
  }

  function drawActivePrompt(): string {
    if (!activePrompt) return "";
    const { rendered, lines, cursor } = activePrompt;
    if (!cursor) return `${rendered}\n`;
    const up = lines - cursor.row;
    return `${rendered}\n${up > 0 ? `\u001b[${up}A` : ""}\u001b[${cursor.column + 1}G\u001b[?25${cursor.visible ? "h" : "l"}`;
  }

  function finishActivePrompt(): string {
    const restore = activePrompt?.cursor ? "\u001b[?25h" : "";
    activePrompt = undefined;
    return restore;
  }

  return {
    print(event) {
      if (event.type === "output") {
        const erase = eraseActivePrompt();
        const text = outputText(event);
        stdout.write(`${erase}${text}`);
        if (activePrompt) {
          // Keep a partial output line outside the frame that the next redraw erases.
          const separator = activePrompt.cursor && text && !text.endsWith("\n") ? "\n" : "";
          stdout.write(`${separator}${drawActivePrompt()}`);
        }
        return;
      }
      const rendered = render(event);
      if (event.type === "prompt") {
        const erase = eraseActivePrompt();
        if (event.prompt.status === "closed") {
          const restore = finishActivePrompt();
          if (erase || restore) stdout.write(`${erase}${restore}`);
          return;
        }
        if (event.prompt.status === "submitted") {
          const restore = finishActivePrompt();
          stdout.write(`${erase}${restore}${rendered}\n`);
          return;
        }
        const restore =
          activePrompt?.cursor && event.prompt.kind !== "autocomplete" ? "\u001b[?25h" : "";
        activePrompt = { rendered, lines: renderedRows(rendered, stdout.columns) };
        if (event.prompt.kind === "autocomplete") {
          const { prompt } = event;
          const cursor = terminalPosition(
            `${symbols.marks.prompt}  ${prompt.message}\n${symbols.bar}  > ${prompt.query}`,
            stdout.columns,
          );
          // The input's trailing space resolves pending wrap at an exact right edge.
          if (cursor.column === stdout.columns) {
            cursor.row += 1;
            cursor.column = 0;
          }
          activePrompt.cursor = { ...cursor, visible: prompt.phase === "input" };
        }
        stdout.write(`${erase}${restore}${drawActivePrompt()}`);
        return;
      }

      const erase = eraseActivePrompt();
      if (!activePrompt) {
        (eventStream(event) === "stdout" ? stdout : stderr).write(`${rendered}\n`);
        return;
      }

      const restore = event.type === "error" ? finishActivePrompt() : "";
      stdout.write(`${erase}${restore}`);
      (eventStream(event) === "stdout" ? stdout : stderr).write(`${rendered}\n`);
      if (activePrompt) stdout.write(drawActivePrompt());
    },
  };
}
