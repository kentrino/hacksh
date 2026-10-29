import { describe, expect, it } from "vite-plus/test";
import { key, openAutocomplete } from "./test-support/terminal.ts";

const emptyInput = `
  │  > Type to filter…
  │
  │    TypeScript — Typed JavaScript
  │    JavaScript — Web and Node.js
  │    Rust — Systems programming
  │    Go — Services and tooling
  │    Python — Scripting and data
  │    Ruby — Expressive scripting
`;

describe("prompt.autocomplete (real PTY)", () => {
  it("shows the placeholder only for empty input and anchors the cursor after committed Japanese text", async () => {
    const terminal = openAutocomplete();
    try {
      await terminal.expectChoices(emptyInput);
      await expect.poll(() => terminal.cursor()).toEqual({ row: 1, column: 5 });
      terminal.send("日本");
      await terminal.expectChoices(`
        │  > 日本
        │
        │    No matches. Keep typing or backspace.
      `);
      await expect.poll(() => terminal.cursor()).toEqual({ row: 1, column: 9 });
      terminal.send(key.down + key.enter);
      terminal.send(key.backspace + key.backspace);
      await terminal.expectChoices(emptyInput);
      await expect.poll(() => terminal.cursor()).toEqual({ row: 1, column: 5 });
    } finally {
      await terminal.close();
    }
  });

  it("filters case-insensitively in definition order and requires selection before submission", async () => {
    const terminal = openAutocomplete();
    try {
      await terminal.expectChoices(emptyInput);
      terminal.send("SCRIPT" + key.enter + key.down);
      await terminal.expectChoices(`
        │    SCRIPT
        │
        │  > TypeScript — Typed JavaScript
        │    JavaScript — Web and Node.js
      `);
      terminal.send(key.down + key.enter);
      await terminal.expectExit(
        0,
        `
        ✔  Choose a language: JavaScript
        value: "javascript"
      `,
      );
    } finally {
      await terminal.close();
    }
  });

  it("returns to editing with Up at the first choice or Escape, and typing refines the query", async () => {
    const terminal = openAutocomplete();
    const editing = `
      │  > ru
      │
      │    Rust — Systems programming
      │    Ruby — Expressive scripting
    `;
    const selecting = `
      │    ru
      │
      │  > Rust — Systems programming
      │    Ruby — Expressive scripting
    `;
    try {
      await terminal.expectChoices(emptyInput);
      terminal.send("ru" + key.down);
      await terminal.expectChoices(selecting);
      terminal.send(key.up);
      await terminal.expectChoices(editing);
      terminal.send(key.down);
      await terminal.expectChoices(selecting);
      terminal.send(key.escape);
      await terminal.expectChoices(editing);
      terminal.send(key.down);
      await terminal.expectChoices(selecting);
      terminal.send("b");
      await terminal.expectChoices(`
        │  > rub
        │
        │    Ruby — Expressive scripting
      `);
      terminal.send(key.escape);
      await terminal.expectExit(
        130,
        `
        ×  Cancelled
      `,
      );
    } finally {
      await terminal.close();
    }
  });

  it("positions the cursor on the next row when full-width input wraps", async () => {
    const terminal = openAutocomplete(20);
    try {
      await expect.poll(() => terminal.cursor()).toEqual({ row: 1, column: 5 });
      terminal.send("日".repeat(8));
      await expect.poll(() => terminal.cursor()).toEqual({ row: 2, column: 2 });
      terminal.send(key.cancel);
      await terminal.expectExit(130, "×  Cancelled");
    } finally {
      await terminal.close();
    }
  });
});
