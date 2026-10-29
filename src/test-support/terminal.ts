import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { spawn } from "node-pty";
import xterm from "@xterm/headless";
import { expect } from "vite-plus/test";

export function trimIndent(text: string): string {
  const lines = text.replace(/^\n|\n\s*$/g, "").split("\n");
  const indent = Math.min(
    ...lines.filter((line) => line.trim()).map((line) => line.match(/^ */)![0].length),
  );
  return lines.map((line) => line.slice(indent).trimEnd()).join("\n");
}

export const key = {
  down: "\x1b[B",
  up: "\x1b[A",
  enter: "\r",
  escape: "\x1b",
  backspace: "\x7f",
  cancel: "\x03",
};

export function openAutocomplete(columns = 80) {
  const screen = new xterm.Terminal({ cols: columns, rows: 40, allowProposedApi: true });
  const writeScreen = promisify(screen.write.bind(screen));
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL("../fixtures/autocomplete-pty-cli.ts", import.meta.url))],
    {
      cols: columns,
      rows: 40,
      env: { ...process.env, NO_COLOR: "1" },
    },
  );
  let output = Promise.resolve();
  const data = child.onData((chunk) => {
    output = output.then(async () => {
      await writeScreen(chunk);
    });
  });
  let exitCode: number | undefined;
  const exit = child.onExit((event) => {
    exitCode = event.exitCode;
  });
  function lines() {
    const buffer = screen.buffer.active;
    return Array.from({ length: buffer.length }, (_, row) =>
      (buffer.getLine(row)?.translateToString(true) ?? "").trimEnd(),
    );
  }
  return {
    send: (text: string) => child.write(text),
    // Only the query and candidates: help wording and decorations are not a contract.
    choices: () => {
      const rows = lines();
      const start = rows.findIndex((line) => line.startsWith("│  "));
      const end = rows.findIndex((line, index) => index > start + 1 && line === "│");
      return rows.slice(start, end).join("\n");
    },
    cursor: () => ({ row: screen.buffer.active.cursorY, column: screen.buffer.active.cursorX }),
    async expectChoices(expected: string) {
      await expect.poll(() => this.choices(), { timeout: 3000 }).toBe(trimIndent(expected));
    },
    async expectExit(code: number, result: string) {
      await expect.poll(() => exitCode, { timeout: 3000 }).toBe(code);
      await output;
      expect(lines().filter(Boolean).join("\n")).toBe(trimIndent(result));
    },
    async close() {
      if (exitCode === undefined) {
        child.kill();
        await expect.poll(() => exitCode, { timeout: 3000 }).toBeDefined();
      }
      await output;
      data.dispose();
      exit.dispose();
      screen.dispose();
    },
  };
}
