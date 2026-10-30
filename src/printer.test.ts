import xterm from "@xterm/headless";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  createJsonPrinter,
  createPrettyPrinter,
  resolveOutputMode,
  type AutocompletePromptState,
  type PrintEvent,
  type WaitPromptState,
} from "./printer-api.ts";

function memoryWriters() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    writers: {
      stdout: { write: (value: string) => void stdout.push(value) },
      stderr: { write: (value: string) => void stderr.push(value) },
    },
  };
}

async function terminalLines(chunks: readonly string[], columns = 80): Promise<string[]> {
  const screen = new xterm.Terminal({
    cols: columns,
    rows: 30,
    convertEol: true,
    allowProposedApi: true,
  });
  try {
    await new Promise<void>((resolve) => screen.write(chunks.join(""), resolve));
    const buffer = screen.buffer.active;
    const lines = Array.from(
      { length: buffer.length },
      (_, row) => buffer.getLine(row)?.translateToString(true) ?? "",
    );
    while (lines.at(-1) === "") lines.pop();
    return lines;
  } finally {
    screen.dispose();
  }
}

function effectiveTerminalLines(chunks: readonly string[]): string[] {
  const lines = [""];
  let row = 0;
  const input = chunks.join("");
  for (let index = 0; index < input.length;) {
    if (input.startsWith("\u001b[1A", index)) {
      row = Math.max(0, row - 1);
      index += 4;
    } else if (input.startsWith("\u001b[2K", index)) {
      lines[row] = "";
      index += 4;
    } else if (input[index] === "\n") {
      row += 1;
      lines[row] ??= "";
      index += 1;
    } else {
      lines[row] = `${lines[row]}${input[index]}`;
      index += 1;
    }
  }
  while (lines.length > 1 && lines.at(-1) === "") lines.pop();
  return lines;
}

function sharedTerminal() {
  const chunks: string[] = [];
  const write = (value: string) => void chunks.push(value);
  return { chunks, writers: { stdout: { write }, stderr: { write } } };
}

const noColor = { stdout: false, stderr: false };
const allColor = { stdout: true, stderr: true };

describe("output mode", () => {
  it.each([
    ["auto outside CI on terminals", {}, "auto", [true, true, true], ["pretty", true, allColor]],
    ["auto in CI", { CI: "1" }, "auto", [true, true, true], ["json", false, noColor]],
    [
      "auto with non-empty false CI",
      { CI: "false" },
      "auto",
      [true, true, true],
      ["json", false, noColor],
    ],
    [
      "auto with stdout through a pipe",
      {},
      "auto",
      [true, false, true],
      ["pretty", false, { stdout: false, stderr: true }],
    ],
    [
      "auto with stderr redirected",
      {},
      "auto",
      [true, true, false],
      ["pretty", true, { stdout: true, stderr: false }],
    ],
    ["explicit JSON", {}, "json", [true, true, true], ["json", false, noColor]],
    [
      "explicit pretty in CI",
      { CI: "1" },
      "pretty",
      [true, true, true],
      ["pretty", false, allColor],
    ],
    ["empty NO_COLOR", { NO_COLOR: "" }, "pretty", [true, true, true], ["pretty", true, allColor]],
    [
      "non-empty NO_COLOR",
      { NO_COLOR: "1" },
      "pretty",
      [true, true, true],
      ["pretty", true, noColor],
    ],
    ["input is not a TTY", {}, "pretty", [false, true, true], ["pretty", false, allColor]],
  ] as const)("resolves %s", (_name, env, output, ttys, expected) => {
    const [inputIsTTY, outputIsTTY, errorOutputIsTTY] = ttys;
    expect(resolveOutputMode({ env, output, inputIsTTY, outputIsTTY, errorOutputIsTTY })).toEqual({
      format: expected[0],
      interactive: expected[1],
      color: expected[2],
    });
  });

  it("gives HACKSH_OUTPUT precedence over the configured preference", () => {
    expect(
      resolveOutputMode({
        output: "pretty",
        env: { CI: "1", HACKSH_OUTPUT: "json" },
        inputIsTTY: true,
        outputIsTTY: true,
        errorOutputIsTTY: true,
      }),
    ).toEqual({ format: "json", interactive: false, color: noColor });
  });

  it("rejects explicit invalid configuration", () => {
    expect(() => resolveOutputMode({ output: "yaml" as "json", env: {} })).toThrowError(
      "Invalid output value yaml; expected auto, pretty, or json",
    );
    expect(() => resolveOutputMode({ env: { HACKSH_OUTPUT: "" } })).toThrowError(
      "Invalid HACKSH_OUTPUT value ; expected auto, pretty, or json",
    );
  });

  it("treats environment access denied by a host runtime as unavailable", () => {
    const env = new Proxy(
      {},
      {
        get() {
          throw new Error("permission denied");
        },
      },
    );

    expect(
      resolveOutputMode({
        env,
        output: "pretty",
        inputIsTTY: true,
        outputIsTTY: true,
        errorOutputIsTTY: true,
      }),
    ).toEqual({ format: "pretty", interactive: true, color: allColor });
  });
});

describe("pretty printer", () => {
  it.each([
    [true, "│", "⠋", "⠙"],
    [false, "|", "|", "/"],
  ] as const)(
    "animates wait at the rail and clears interrupt echo with unicode=%s",
    async (unicode, rail, first, second) => {
      const output = memoryWriters();
      const printer = createPrettyPrinter({ color: false, unicode, ...output.writers });
      const prompt: WaitPromptState = {
        kind: "wait",
        message: "待機中",
        status: "active",
        frame: 0,
      };
      void printer.print({ type: "prompt", prompt });
      expect(await terminalLines(output.stdout)).toEqual([`${first}  待機中`]);
      void printer.print({ type: "prompt", prompt: { ...prompt, frame: 1 } });
      expect(await terminalLines(output.stdout)).toEqual([`${second}  待機中`]);
      output.stdout.push("^C");
      void printer.print({ type: "prompt", prompt: { ...prompt, status: "closed" } });
      void printer.print({ type: "output", kind: "text", text: "after\n" });
      expect(await terminalLines(output.stdout)).toEqual([rail, "after"]);
    },
  );

  it("preserves logs and complete, partial, and JSON output between wait frames", () => {
    const output = sharedTerminal();
    const printer = createPrettyPrinter({ color: false, unicode: true, ...output.writers });
    const prompt: WaitPromptState = {
      kind: "wait",
      message: "Loading",
      status: "active",
      frame: 0,
    };
    void printer.print({ type: "prompt", prompt });
    void printer.print({
      type: "log",
      record: {
        kind: "message",
        level: "info",
        category: [],
        message: "background update",
        rawMessage: "background update",
        timestamp: 1,
        properties: {},
      },
    });
    expect(effectiveTerminalLines(output.chunks)).toEqual(["●  background update", "⠋  Loading"]);
    void printer.print({ type: "output", kind: "text", text: "complete\n" });
    void printer.print({ type: "output", kind: "text", text: "partial" });
    void printer.print({ type: "prompt", prompt: { ...prompt, frame: 1 } });
    void printer.print({ type: "output", kind: "json", data: { ready: true } });
    void printer.print({ type: "prompt", prompt: { ...prompt, status: "closed" } });
    expect(effectiveTerminalLines(output.chunks)).toEqual([
      "●  background update",
      "complete",
      "partial",
      "{",
      '  "ready": true',
      "}",
      "│",
    ]);
  });

  it.each([
    ["wrapped", "abcdefghijklm", 8],
    ["multiline wide", "abcdefghijklm\n界界界界界", 10],
    ["combining", "a\u0301".repeat(10), 8],
  ] as const)(
    "clears every %s wait row before drawing a shorter frame",
    async (_name, message, columns) => {
      const output = memoryWriters();
      const printer = createPrettyPrinter({
        color: false,
        unicode: true,
        stdout: { ...output.writers.stdout, columns },
        stderr: output.writers.stderr,
      });
      const prompt: WaitPromptState = {
        kind: "wait",
        message,
        status: "active",
        frame: 0,
      };
      void printer.print({ type: "prompt", prompt });
      void printer.print({ type: "prompt", prompt: { ...prompt, message: "ok", frame: 1 } });
      expect(await terminalLines(output.stdout, columns)).toEqual(["⠙  ok"]);
      void printer.print({ type: "prompt", prompt: { ...prompt, status: "closed" } });
      expect(await terminalLines(output.stdout, columns)).toEqual(["│"]);
    },
  );

  it("restores the rail once when an error removes an animated wait", async () => {
    const output = sharedTerminal();
    const printer = createPrettyPrinter({ color: false, unicode: true, ...output.writers });
    const prompt: WaitPromptState = {
      kind: "wait",
      message: "Loading",
      status: "active",
      frame: 0,
    };
    void printer.print({ type: "prompt", prompt });
    void printer.print({
      type: "error",
      error: { kind: "error", name: "Error", message: "failed" },
    });
    expect(await terminalLines(output.chunks)).toEqual(["│", "■  failed"]);
    void printer.print({ type: "prompt", prompt: { ...prompt, status: "closed" } });
    void printer.print({ type: "output", kind: "text", text: "after\n" });
    expect(await terminalLines(output.chunks)).toEqual(["│", "■  failed", "after"]);
  });

  it.each([
    [true, "│", "●"],
    [false, "|", "i"],
  ] as const)(
    "prints static waits without retaining a frame or emitting ANSI with unicode=%s",
    (unicode, rail, mark) => {
      const output = sharedTerminal();
      const printer = createPrettyPrinter({ color: false, unicode, ...output.writers });
      const prompt: WaitPromptState = {
        kind: "wait",
        message: "待機中\nReceiving data",
        status: "active",
      };
      void printer.print({ type: "prompt", prompt });
      void printer.print({
        type: "log",
        record: {
          kind: "message",
          level: "info",
          category: [],
          message: "working",
          rawMessage: "working",
          timestamp: 1,
          properties: {},
        },
      });
      void printer.print({ type: "output", kind: "text", text: "partial" });
      void printer.print({ type: "prompt", prompt: { ...prompt, status: "closed" } });
      void printer.print({ type: "output", kind: "text", text: " tail\n" });
      expect(output.chunks).toEqual([
        `${rail}  待機中\n${rail}  Receiving data\n`,
        `${mark}  working\n`,
        "partial",
        " tail\n",
      ]);
      expect(output.chunks.join("")).not.toContain("\u001b");
    },
  );

  it("renders autocomplete phases and restores its query cursor after interleaved output", () => {
    const output = sharedTerminal();
    const printer = createPrettyPrinter({ color: false, unicode: true, ...output.writers });
    const prompt: AutocompletePromptState = {
      kind: "autocomplete",
      message: "Language",
      status: "active",
      query: "",
      placeholder: "Type to filter…",
      phase: "input",
      choices: [{ value: "rust", label: "Rust", hint: "Systems", selected: false }],
    };
    void printer.print({ type: "prompt", prompt });
    const inputFrame = output.chunks[0]!;
    expect(inputFrame).toBe(
      "?  Language\n│  > Type to filter… \n│\n│    Rust — Systems\n│\n" +
        "│  INPUT · type to filter · ↓ select · Esc cancel\n\u001b[5A\u001b[6G\u001b[?25h",
    );
    const erase = "\u001b[?25l\u001b[1A\r\u001b[0J";
    void printer.print({
      type: "log",
      record: {
        kind: "message",
        level: "info",
        category: [],
        message: "still working",
        rawMessage: "still working",
        timestamp: 1,
        properties: {},
      },
    });
    expect(output.chunks.slice(1)).toEqual([erase, "●  still working\n", inputFrame]);
    void printer.print({ type: "output", kind: "text", text: "result\n" });
    expect(output.chunks.slice(-2)).toEqual([`${erase}result\n`, inputFrame]);
    void printer.print({ type: "output", kind: "text", text: "partial" });
    expect(output.chunks.slice(-2)).toEqual([`${erase}partial`, `\n${inputFrame}`]);

    const selected: AutocompletePromptState = {
      ...prompt,
      phase: "select",
      value: "rust",
      choices: [{ ...prompt.choices[0]!, selected: true }],
    };
    void printer.print({ type: "prompt", prompt: selected });
    const selectedFrame = output.chunks.at(-1)!.slice(erase.length);
    expect(selectedFrame).toContain("│    Type to filter… \n│\n│  > Rust — Systems");
    expect(selectedFrame).toContain("SELECT · ↑/↓ move · Enter choose · Esc edit");
    expect(selectedFrame.endsWith("\u001b[6G\u001b[?25l")).toBe(true);
    void printer.print({ type: "output", kind: "text", text: "selected\n" });
    expect(output.chunks.slice(-2)).toEqual([`${erase}selected\n`, selectedFrame]);
    void printer.print({ type: "prompt", prompt: { ...selected, status: "submitted" } });
    expect(output.chunks.at(-1)).toBe(`${erase}\u001b[?25h✔  Language: Rust\n`);
    void printer.print({ type: "output", kind: "text", text: "done" });
    expect(output.chunks.at(-1)).toBe("done");
  });

  it.each([
    ["fullwidth before the margin", 10, "abcd界", 2, 3],
    ["pending wrap at the margin", 10, "abcde", 2, 1],
    ["combining and emoji graphemes", 80, "a\u0301👨‍👩‍👧‍👦🇯🇵1️⃣", 1, 13],
    ["multiline wrapped header", 10, "x", 4, 7],
  ] as const)("anchors autocomplete for %s", (name, columns, query, row, column) => {
    const output = memoryWriters();
    const printer = createPrettyPrinter({
      color: true,
      unicode: true,
      stdout: { ...output.writers.stdout, columns },
      stderr: output.writers.stderr,
    });
    const prompt: AutocompletePromptState = {
      kind: "autocomplete",
      message: name === "multiline wrapped header" ? "Long title here\nAnother long title" : "Pick",
      status: "active",
      phase: "input",
      query,
      choices: [],
    };
    void printer.print({ type: "prompt", prompt });
    expect(output.stdout[0]).toContain("No matches. Keep typing or backspace.");
    expect(output.stdout[0]!.endsWith(`\u001b[${column}G\u001b[?25h`)).toBe(true);
    void printer.print({ type: "prompt", prompt: { ...prompt, status: "closed" } });
    expect(output.stdout[1]).toBe(`\u001b[?25l\u001b[${row}A\r\u001b[0J\u001b[?25h`);
  });

  it("restores a hidden autocomplete cursor when an error removes its frame", () => {
    const output = sharedTerminal();
    const printer = createPrettyPrinter({ color: false, unicode: false, ...output.writers });
    void printer.print({
      type: "prompt",
      prompt: {
        kind: "autocomplete",
        message: "Language",
        status: "active",
        phase: "select",
        query: "r",
        value: "rust",
        choices: [{ value: "rust", label: "Rust", selected: true }],
      },
    });
    expect(output.chunks[0]).toContain("|    r \n|\n|  > Rust");
    expect(output.chunks[0]!.endsWith("\u001b[?25l")).toBe(true);
    void printer.print({
      type: "error",
      error: { kind: "error", name: "Error", message: "failed" },
    });
    expect(output.chunks.slice(-2)).toEqual([
      "\u001b[?25l\u001b[1A\r\u001b[0J\u001b[?25h",
      "x  failed\n",
    ]);
    void printer.print({ type: "output", kind: "text", text: "after\n" });
    expect(output.chunks.at(-1)).toBe("after\n");
  });

  it("redraws select, confirm, and text states in place and collapses submitted results", () => {
    const output = memoryWriters();
    const printer = createPrettyPrinter({ color: false, unicode: true, ...output.writers });
    const events: PrintEvent[] = [
      {
        type: "prompt",
        prompt: {
          kind: "select",
          message: "Environment",
          status: "active",
          value: "staging",
          choices: [
            { value: "staging", label: "Staging", selected: true },
            { value: "production", label: "Production", selected: false },
          ],
        },
      },
      {
        type: "prompt",
        prompt: {
          kind: "select",
          message: "Environment",
          status: "submitted",
          value: "production",
          choices: [
            { value: "staging", label: "Staging", selected: false },
            { value: "production", label: "Production", selected: true },
          ],
        },
      },
      {
        type: "prompt",
        prompt: {
          kind: "confirm",
          message: "Continue?",
          status: "active",
          value: false,
          defaultValue: false,
        },
      },
      {
        type: "prompt",
        prompt: { kind: "confirm", message: "Continue?", status: "submitted", value: true },
      },
      {
        type: "prompt",
        prompt: {
          kind: "text",
          message: "Name",
          status: "active",
          value: "",
          placeholder: "release",
        },
      },
      {
        type: "prompt",
        prompt: {
          kind: "text",
          message: "Name",
          status: "error",
          value: "x",
          placeholder: "release",
          error: "Too short",
        },
      },
      {
        type: "prompt",
        prompt: { kind: "text", message: "Name", status: "submitted", value: "fox" },
      },
    ];
    for (const event of events) void printer.print(event);

    expect(output.stdout.join("")).toContain("\u001b[1A\u001b[2K");
    expect(effectiveTerminalLines(output.stdout)).toEqual([
      "✔  Environment: Production",
      "✔  Continue?: Yes",
      "✔  Name: fox",
    ]);
  });

  it("removes and redraws an active prompt around interleaved logs", () => {
    const output = sharedTerminal();
    const printer = createPrettyPrinter({ color: false, unicode: true, ...output.writers });
    void printer.print({
      type: "prompt",
      prompt: { kind: "confirm", message: "Continue?", status: "active", value: false },
    });
    void printer.print({
      type: "log",
      record: {
        level: "info",
        kind: "message",
        category: [],
        message: "background update",
        rawMessage: "background update",
        properties: {},
        timestamp: 1,
      },
    });
    void printer.print({
      type: "prompt",
      prompt: { kind: "confirm", message: "Continue?", status: "submitted", value: true },
    });

    expect(effectiveTerminalLines(output.chunks)).toEqual([
      "●  background update",
      "✔  Continue?: Yes",
    ]);
  });

  it("removes and redraws an active prompt around command output", () => {
    const output = memoryWriters();
    const printer = createPrettyPrinter({ color: false, unicode: true, ...output.writers });
    void printer.print({
      type: "prompt",
      prompt: { kind: "confirm", message: "Continue?", status: "active", value: false },
    });
    void printer.print({ type: "output", kind: "text", text: "result\n" });
    void printer.print({
      type: "prompt",
      prompt: { kind: "confirm", message: "Continue?", status: "submitted", value: true },
    });

    expect(effectiveTerminalLines(output.stdout)).toEqual(["result", "✔  Continue?: Yes"]);
  });

  it("writes command output undecorated: text as given and JSON indented", () => {
    const output = memoryWriters();
    const printer = createPrettyPrinter({ color: true, unicode: true, ...output.writers });
    void printer.print({ type: "output", kind: "text", text: "a\tb" });
    void printer.print({ type: "output", kind: "text", text: "\n" });
    void printer.print({ type: "output", kind: "json", data: { n: 1n, list: [1] } });

    expect(output.stdout).toEqual(["a\tb", "\n", '{\n  "n": "1",\n  "list": [\n    1\n  ]\n}\n']);
    expect(output.stderr).toEqual([]);
  });

  it("colors each stream by its own flag", () => {
    const output = memoryWriters();
    const printer = createPrettyPrinter({
      color: { stdout: false, stderr: true },
      unicode: true,
      ...output.writers,
    });
    void printer.print({ type: "version", version: "1.2.3" });
    void printer.print({
      type: "log",
      record: {
        level: "info",
        kind: "message",
        category: [],
        message: "hi",
        rawMessage: "hi",
        properties: {},
        timestamp: 1,
      },
    });

    expect(output.stdout).toEqual(["●  1.2.3\n"]);
    expect(output.stderr[0]).toContain("\u001b[");
  });

  it("closes an unsuccessful prompt before later logs", () => {
    const output = sharedTerminal();
    const printer = createPrettyPrinter({ color: false, unicode: true, ...output.writers });
    void printer.print({
      type: "prompt",
      prompt: { kind: "text", message: "Cancelled", status: "active", value: "partial" },
    });
    void printer.print({
      type: "prompt",
      prompt: { kind: "text", message: "Cancelled", status: "closed", value: "partial" },
    });
    for (const message of ["first log", "second log"]) {
      void printer.print({
        type: "log",
        record: {
          level: "info",
          kind: "message",
          category: [],
          message,
          rawMessage: message,
          properties: {},
          timestamp: 1,
        },
      });
    }

    expect(effectiveTerminalLines(output.chunks)).toEqual(["●  first log", "●  second log"]);
  });

  it("counts wrapped, multiline, ANSI, and wide-character terminal rows", () => {
    const stdout: string[] = [];
    const printer = createPrettyPrinter({
      color: true,
      unicode: true,
      stdout: { columns: 20, write: (value) => void stdout.push(value) },
      stderr: { write: () => undefined },
    });
    void printer.print({
      type: "prompt",
      prompt: {
        kind: "select",
        message: "Choose a target\nSecond line",
        status: "active",
        value: "wide",
        choices: [{ value: "wide", label: "界".repeat(10), selected: true }],
      },
    });
    void printer.print({
      type: "prompt",
      prompt: {
        kind: "select",
        message: "Choose a target\nSecond line",
        status: "submitted",
        value: "wide",
        choices: [{ value: "wide", label: "界".repeat(10), selected: true }],
      },
    });

    expect(stdout[1]!.startsWith("\u001b[1A\u001b[2K".repeat(4))).toBe(true);
  });

  it("uses explicit newlines only when output columns are unknown", () => {
    const output = memoryWriters();
    const printer = createPrettyPrinter({ color: false, unicode: true, ...output.writers });
    void printer.print({
      type: "prompt",
      prompt: { kind: "text", message: "Long", status: "active", value: "x".repeat(36) },
    });
    void printer.print({
      type: "prompt",
      prompt: { kind: "text", message: "Long", status: "submitted", value: "x".repeat(36) },
    });

    expect(output.stdout[1]!.startsWith("\u001b[1A\u001b[2K".repeat(2))).toBe(true);
  });
  it("distinguishes every level, step, and success without color", () => {
    const output = memoryWriters();
    const printer = createPrettyPrinter({
      color: false,
      unicode: true,
      ...output.writers,
    });
    const records = [
      ["trace", "message"],
      ["debug", "message"],
      ["info", "message"],
      ["warning", "message"],
      ["error", "message"],
      ["fatal", "message"],
      ["info", "step"],
      ["info", "success"],
    ] as const;

    records.forEach(
      ([level, kind]) =>
        void printer.print({
          type: "log",
          record: {
            level,
            kind,
            category: [],
            message: `${level}:${kind}`,
            rawMessage: `${level}:${kind}`,
            properties: {},
            timestamp: 1,
          },
        }),
    );

    expect(output.stdout).toEqual([]);
    expect(output.stderr).toEqual([
      "·  trace:message\n",
      "◆  debug:message\n",
      "●  info:message\n",
      "▲  warning:message\n",
      "■  error:message\n",
      "✖  fatal:message\n",
      "◇  info:step\n",
      "✔  info:success\n",
    ]);
  });

  it("uses ASCII marks, category labels, bars, and multiline property values", () => {
    const output = memoryWriters();
    const printer = createPrettyPrinter({
      color: false,
      unicode: false,
      ...output.writers,
    });

    void printer.print({
      type: "log",
      record: {
        level: "info",
        kind: "success",
        category: ["deploy", "upload"],
        message: "Uploaded files\nWaiting for confirmation",
        rawMessage: "Uploaded files\nWaiting for confirmation",
        properties: { "multi\nkey": "first line\nsecond line", stats: { files: 2 } },
        timestamp: 1,
      },
    });

    expect(output.stderr).toEqual([
      "+  [deploy:upload] Uploaded files\n" +
        "|  Waiting for confirmation\n" +
        "|    multi\n" +
        "|      key: first line\n" +
        "|      second line\n" +
        "|    stats: {\n" +
        "|        files: 2\n" +
        "|      }\n",
    ]);
  });

  it("renders multiline help and error details with consistent bars and stream routing", () => {
    const output = memoryWriters();
    const printer = createPrettyPrinter({
      color: false,
      unicode: true,
      ...output.writers,
    });

    void printer.print({
      type: "usage",
      usage: { name: "tool", synopsis: "tool", arguments: [], options: [], commands: [] },
      text: "USAGE tool\n\nOPTIONS\n  --help",
      stream: "stdout",
    });
    void printer.print({
      type: "error",
      error: {
        kind: "error",
        name: "Error",
        message: "Could not deploy\nTry again",
        cause: { message: "network down" },
      },
    });

    expect(output.stdout).toEqual(["◆  USAGE tool\n│\n│  OPTIONS\n│    --help\n"]);
    expect(output.stderr).toEqual([
      "■  Could not deploy\n" +
        "│  Try again\n" +
        "│    cause: {\n" +
        "│        message: 'network down'\n" +
        "│      }\n",
    ]);
  });

  it("adds ANSI styles only when color is enabled", () => {
    const colored = memoryWriters();
    const plain = memoryWriters();
    const event: PrintEvent = { type: "version", version: "1.2.3" };

    void createPrettyPrinter({ color: true, unicode: true, ...colored.writers }).print(event);
    void createPrettyPrinter({ color: false, unicode: true, ...plain.writers }).print(event);

    expect(colored.stdout[0]).toContain("\u001b[");
    const ansiStyle = new RegExp(`${String.fromCodePoint(27)}\\[[0-9;]*m`, "g");
    expect(colored.stdout[0]!.replaceAll(ansiStyle, "")).toBe("●  1.2.3\n");
    expect(plain.stdout).toEqual(["●  1.2.3\n"]);
  });
});

describe("JSON printer", () => {
  it("writes one parseable, undecorated line per semantic event to its documented stream", () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const printer = createJsonPrinter({
      stdout: { write: (value) => void stdout.push(value) },
      stderr: { write: (value) => void stderr.push(value) },
    });
    const events: PrintEvent[] = [
      {
        type: "usage",
        usage: {
          name: "tool",
          synopsis: "tool [OPTIONS]",
          arguments: [],
          options: [],
          commands: [],
        },
        text: "\u001b[31mUSAGE\u001b[0m tool",
        stream: "stdout",
      },
      { type: "version", version: "1.2.3" },
      {
        type: "log",
        record: {
          level: "info",
          kind: "success",
          category: ["tool"],
          message: "done",
          rawMessage: "done",
          properties: { count: 2 },
          timestamp: 1,
        },
      },
      {
        type: "log",
        record: {
          level: "warning",
          kind: "message",
          category: ["tool"],
          message: "careful",
          rawMessage: "careful",
          properties: {},
          timestamp: 2,
        },
      },
      { type: "error", error: { kind: "error", name: "Error", message: "failed" } },
      {
        type: "usage",
        usage: {
          name: "tool",
          synopsis: "tool [OPTIONS]",
          arguments: [],
          options: [],
          commands: [],
        },
        text: "USAGE tool",
        stream: "stderr",
      },
      { type: "output", kind: "text", text: "line\n" },
      { type: "output", kind: "json", data: { count: 2n } },
    ];

    for (const event of events) void printer.print(event);

    expect(stdout).toHaveLength(4);
    expect(stderr).toHaveLength(4);
    for (const line of [...stdout, ...stderr]) {
      expect(line.endsWith("\n")).toBe(true);
      expect(line.trim().split("\n")).toHaveLength(1);
      expect(line).not.toContain("\u001b");
      expect(() => JSON.parse(line)).not.toThrow();
    }
    expect(JSON.parse(stdout[0]!)).toMatchObject({ type: "usage", text: "USAGE tool" });
    expect(JSON.parse(stdout[2]!)).toEqual({ type: "output", kind: "text", text: "line\n" });
    expect(JSON.parse(stdout[3]!)).toEqual({ type: "output", kind: "json", data: { count: "2" } });
    expect(JSON.parse(stderr[0]!)).toMatchObject({
      type: "log",
      record: { level: "info", kind: "success", properties: { count: 2 } },
    });
  });

  it("normalizes cycles, BigInt, Error causes, unsupported values, and hostile properties", () => {
    const lines: string[] = [];
    const printer = createJsonPrinter({
      stderr: { write: (value) => void lines.push(value) },
    });
    const cycle: Record<string, unknown> = { big: 12n, missing: undefined };
    cycle.self = cycle;
    Object.defineProperty(cycle, "hostile", {
      enumerable: true,
      get() {
        throw new Error("no access");
      },
    });
    const cause = new Error("root");
    const failure = new Error("outer", { cause });
    (cause as Error & { cause?: unknown }).cause = failure;

    void printer.print({
      type: "log",
      record: {
        level: "info",
        kind: "message",
        category: [],
        message: "values",
        rawMessage: "values",
        properties: { cycle, failure, fn: vi.fn(), symbol: Symbol("value") },
        timestamp: Number.NaN,
      },
    });

    const parsed = JSON.parse(lines[0]!);
    expect(parsed.record).toMatchObject({
      timestamp: null,
      properties: {
        cycle: {
          big: "12",
          missing: "[undefined]",
          self: "[Circular]",
          hostile: "[Unserializable]",
        },
        failure: { name: "Error", message: "outer", cause: { message: "root" } },
        fn: "[function:Mock]",
        symbol: "[symbol:value]",
      },
    });
    expect(parsed.record.properties.failure.cause.cause).toBe("[Circular]");
  });

  it("normalizes URL, Buffer, typed arrays, toJSON, ANSI keys, and properties independently", () => {
    const lines: string[] = [];
    const printer = createJsonPrinter({ stderr: { write: (value) => void lines.push(value) } });
    const failure = Object.assign(new Error("partial"), { safe: "kept" });
    Object.defineProperty(failure, "hostile", {
      enumerable: true,
      get() {
        throw new Error("no access");
      },
    });
    const throwingToJSON = {
      safe: "still here",
      toJSON() {
        throw new Error("no JSON");
      },
    };

    void printer.print({
      type: "log",
      record: {
        level: "info",
        kind: "message",
        category: [],
        message: "values",
        rawMessage: "values",
        properties: {
          url: new URL("https://example.com/path?q=1"),
          buffer: Buffer.from([1, 2, 255]),
          typed: new Uint16Array([3, 65_535]),
          custom: { toJSON: () => ({ answer: 42, error: new Error("from toJSON") }) },
          throwingToJSON,
          "\u001b[31mcolored\u001b[0m": "\u001b[32mgreen\u001b[0m",
          failure,
        },
        timestamp: 1,
      },
    });

    const properties = JSON.parse(lines[0]!).record.properties;
    expect(properties).toMatchObject({
      url: "https://example.com/path?q=1",
      buffer: { type: "Buffer", data: [1, 2, 255] },
      typed: [3, 65_535],
      custom: {
        answer: 42,
        error: { kind: "error", name: "Error", message: "from toJSON" },
      },
      throwingToJSON: { safe: "still here", toJSON: "[function:toJSON]" },
      colored: "green",
      failure: {
        kind: "error",
        name: "Error",
        message: "partial",
        properties: { safe: "kept", hostile: "[Unserializable]" },
      },
    });
    expect(Object.keys(properties)).not.toContain("\u001b[31mcolored\u001b[0m");
  });

  it("keeps a parseable event line when an exotic value resists inspection", () => {
    const lines: string[] = [];
    const printer = createJsonPrinter({ stderr: { write: (value) => void lines.push(value) } });
    const hostile = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("no prototype");
        },
      },
    );

    void printer.print({
      type: "log",
      record: {
        level: "info",
        kind: "message",
        category: [],
        message: "hostile",
        rawMessage: "hostile",
        properties: { hostile },
        timestamp: 1,
      },
    });

    expect(JSON.parse(lines[0]!)).toMatchObject({
      type: "log",
      record: { properties: { hostile: "[Unserializable]" } },
    });
  });
});

describe("exec events", () => {
  const event: PrintEvent = {
    type: "exec",
    phase: "start",
    command: { file: "git", args: ["commit", "-m", "hello world"], cwd: "/repo" },
    stdio: { stdin: "ignore", stdout: "pipe", stderr: "pipe" },
    interactive: false,
  };

  it("renders the command and cwd on stderr", () => {
    const output = memoryWriters();
    void createPrettyPrinter({ color: false, unicode: true, ...output.writers }).print(event);

    expect(output.stdout).toEqual([]);
    expect(output.stderr).toEqual(['$  git commit -m "hello world"\n│    cwd: /repo\n']);

    const colored = memoryWriters();
    void createPrettyPrinter({ color: true, unicode: true, ...colored.writers }).print({
      ...event,
      command: { file: "git", args: ["status"] },
    });
    expect(colored.stderr).toEqual(["\u001b[90m$\u001b[39m  git status\n"]);
  });

  it("uses a dollar mark without a cwd line in ascii", () => {
    const output = memoryWriters();
    void createPrettyPrinter({ color: false, unicode: false, ...output.writers }).print({
      ...event,
      command: { file: "git", args: ["status"] },
    });

    expect(output.stderr).toEqual(["$  git status\n"]);
  });

  it("marks a planned command with a hash and a started command with a dollar", () => {
    const output = memoryWriters();
    const skip = { ...event, phase: "skip" as const };
    void createPrettyPrinter({ color: false, unicode: true, ...output.writers }).print(skip);
    expect(output.stderr).toEqual(['#  git commit -m "hello world"\n│    cwd: /repo\n']);

    const ascii = memoryWriters();
    void createPrettyPrinter({ color: false, unicode: false, ...ascii.writers }).print(skip);
    expect(ascii.stderr).toEqual(['#  git commit -m "hello world"\n|    cwd: /repo\n']);

    const json = memoryWriters();
    void createJsonPrinter(json.writers).print(skip);
    expect(JSON.parse(json.stderr[0]!)).toEqual(skip);
    expect(JSON.parse(json.stderr[0]!).phase).not.toBe("start");
  });

  it("writes one JSON event line to stderr", () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    void createJsonPrinter({
      stdout: { write: (value) => void stdout.push(value) },
      stderr: { write: (value) => void stderr.push(value) },
    }).print(event);

    expect(stdout).toEqual([]);
    expect(stderr).toHaveLength(1);
    expect(JSON.parse(stderr[0]!)).toEqual(event);
  });
});
