import { getEventListeners } from "node:events";
import { PassThrough } from "node:stream";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import { HackshPromptError } from "./errors.ts";
import { PromptController } from "./prompts.ts";
import { createPrintQueue } from "./printer.ts";
import type { PrintEvent } from "./printer-api.ts";
import { TerminalLock } from "./terminal.ts";
import { defineCommand } from "./command.ts";
import { runCommand } from "./run.ts";

class TestInput extends PassThrough {
  readonly isTTY = true;
  isRaw = false;
  readonly rawModes: boolean[] = [];

  setRawMode(mode: boolean): this {
    this.isRaw = mode;
    this.rawModes.push(mode);
    return this;
  }
}

const terminalOutput = { isTTY: true, write: () => undefined };

async function turn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("interactive prompts", () => {
  it("selects typed values and renders selection states through the invocation printer", async () => {
    const input = new TestInput();
    const events: PrintEvent[] = [];
    const command = defineCommand({
      async run({ prompt }) {
        const value = await prompt.select({
          message: "Environment",
          options: [
            { value: "staging", hint: "safe" },
            { value: "production", label: "Production" },
          ] as const,
          initialValue: "staging",
        });
        expectTypeOf(value).toEqualTypeOf<"staging" | "production">();
        expect(value).toBe("production");
      },
    });

    const result = runCommand(command, [], {
      stdin: input,
      stdout: terminalOutput,
      printer: { print: (event) => void events.push(event) },
      env: {},
    });
    await turn();
    input.write("\u001b[B\r");

    await result;
    const prompts = events.filter((event) => event.type === "prompt");
    expect(prompts.map(({ prompt }) => prompt.status)).toEqual(["active", "active", "submitted"]);
    expect(prompts[1]).toMatchObject({
      prompt: { choices: [{ selected: false }, { selected: true }] },
    });
    expect(input.rawModes).toEqual([true, false]);
    expect(input.isRaw).toBe(false);
    expect(input.listenerCount("keypress")).toBe(0);
  });

  it("confirms, edits text, displays placeholders, and retries validation", async () => {
    const input = new TestInput();
    const events: PrintEvent[] = [];
    const command = defineCommand({
      async run({ prompt }) {
        const confirmed = await prompt.confirm({ message: "Continue?", initialValue: true });
        const text = await prompt.text({
          message: "Name",
          placeholder: "three letters",
          validate: (value) => (value.length < 3 ? "Too short" : undefined),
        });
        expect({ confirmed, text }).toEqual({ confirmed: true, text: "xhi" });
      },
    });

    const result = runCommand(command, [], {
      stdin: input,
      stdout: terminalOutput,
      printer: { print: (event) => void events.push(event) },
      env: {},
    });
    await turn();
    input.write("\r");
    await turn();
    input.write("x\rhi\r");

    await result;
    expect(events).toContainEqual({
      type: "prompt",
      prompt: expect.objectContaining({
        kind: "text",
        status: "active",
        placeholder: "three letters",
      }),
    });
    expect(events).toContainEqual({
      type: "prompt",
      prompt: expect.objectContaining({ kind: "text", status: "error", error: "Too short" }),
    });
    expect(input.rawModes).toEqual([true, false, true, false]);
    expect(input.listenerCount("keypress")).toBe(0);
  });

  it("accepts f/F, ignores function keys, and removes a full Unicode code point", async () => {
    const input = new TestInput();
    const command = defineCommand({
      async run({ prompt }) {
        const letters = await prompt.text({ message: "Letters" });
        const unicode = await prompt.text({ message: "Unicode" });
        expect({ letters, unicode }).toEqual({ letters: "fF", unicode: "A" });
      },
    });
    const result = runCommand(command, [], {
      stdin: input,
      stdout: terminalOutput,
      printer: { print: () => undefined },
      env: {},
    });
    await turn();
    input.write("fF\u001bOP\rA😀\u007f\r");

    await result;
  });

  it("preserves pasted type-ahead for the next prompt", async () => {
    const input = new TestInput();
    const command = defineCommand({
      async run({ prompt }) {
        const confirmed = await prompt.confirm({ message: "Continue?" });
        const name = await prompt.text({ message: "Name" });
        expect({ confirmed, name }).toEqual({ confirmed: true, name: "name" });
      },
    });
    const result = runCommand(command, [], {
      stdin: input,
      stdout: terminalOutput,
      printer: { print: () => undefined },
      env: {},
    });
    await turn();
    input.write("yname\r");

    await result;
  });

  it("treats an empty validation message as valid", async () => {
    const input = new TestInput();
    const result = runCommand(
      defineCommand({
        run: async ({ prompt }) => {
          const value = await prompt.text({ message: "Value", validate: () => "" });
          expect(value).toBe("accepted");
        },
      }),
      [],
      {
        stdin: input,
        stdout: terminalOutput,
        printer: { print: () => undefined },
        env: {},
      },
    );
    await turn();
    input.write("accepted\r");

    await result;
  });

  it("always rejects noninteractive prompts, including prompts with defaults", async () => {
    const input = new TestInput();
    const command = defineCommand({
      async run({ prompt }) {
        await prompt.confirm({ message: "Continue?", initialValue: true });
      },
    });

    const result = runCommand(command, [], {
      stdin: input,
      stdout: terminalOutput,
      output: "json",
      env: {},
    });
    await expect(result).rejects.toMatchObject({
      name: "HackshPromptError",
      reason: "non-interactive",
      prompt: { kind: "confirm", message: "Continue?" },
    });
    expect(input.rawModes).toEqual([]);
  });

  it("distinguishes cancellation and EOF and restores input state", async () => {
    for (const [sequence, reason] of [
      ["\u0003", "cancelled"],
      ["\u0004", "eof"],
    ] as const) {
      const input = new TestInput();
      const events: PrintEvent[] = [];
      const command = defineCommand({
        run: async ({ prompt }) => {
          await prompt.text({ message: "Value" });
        },
      });
      const result = runCommand(command, [], {
        stdin: input,
        stdout: terminalOutput,
        printer: { print: (event) => void events.push(event) },
        env: {},
      });
      await turn();
      input.write(sequence);
      await expect(result).rejects.toMatchObject({ reason });
      expect(input.isRaw).toBe(false);
      expect(input.listenerCount("keypress")).toBe(0);
      expect(events.at(-1)).toMatchObject({ type: "prompt", prompt: { status: "closed" } });
    }
  });

  it("fails a waiting prompt as aborted when the invocation signal aborts", async () => {
    const input = new TestInput();
    const events: PrintEvent[] = [];
    const controller = new AbortController();
    const reason = new Error("stop");
    const result = runCommand(
      defineCommand({
        run: async ({ prompt }) => {
          await prompt.text({ message: "Value" });
        },
      }),
      [],
      {
        stdin: input,
        stdout: terminalOutput,
        printer: { print: (event) => void events.push(event) },
        env: {},
        signal: controller.signal,
      },
    );
    await turn();
    controller.abort(reason);

    await expect(result).rejects.toMatchObject({
      name: "HackshPromptError",
      reason: "aborted",
      cause: reason,
    });
    expect(input.rawModes).toEqual([true, false]);
    expect(input.listenerCount("data")).toBe(0);
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    expect(events.at(-1)).toMatchObject({ type: "prompt", prompt: { status: "closed" } });
  });

  it("fails a prompt started after the invocation signal aborted without touching the terminal", async () => {
    const input = new TestInput();
    const events: PrintEvent[] = [];
    const controller = new AbortController();
    const reason = new Error("stop");
    const result = runCommand(
      defineCommand({
        run: async ({ prompt }) => {
          controller.abort(reason);
          await prompt.confirm({ message: "Continue?" });
        },
      }),
      [],
      {
        stdin: input,
        stdout: terminalOutput,
        printer: { print: (event) => void events.push(event) },
        env: {},
        signal: controller.signal,
      },
    );

    await expect(result).rejects.toMatchObject({ reason: "aborted", cause: reason });
    expect(input.rawModes).toEqual([]);
    expect(events).toEqual([]);
  });

  it("closes a cancelled prompt before caught-error logs", async () => {
    const input = new TestInput();
    const events: PrintEvent[] = [];
    const command = defineCommand({
      async run({ logger, prompt }) {
        await prompt.text({ message: "Cancel me" }).catch((error: unknown) => {
          expect(error).toMatchObject({ reason: "cancelled" });
        });
        logger.info("first log");
        logger.info("second log");
        return;
      },
    });
    const result = runCommand(command, [], {
      stdin: input,
      stdout: terminalOutput,
      printer: { print: (event) => void events.push(event) },
      env: {},
    });
    await turn();
    input.write("\u0003");
    await result;

    expect(events.map((event) => event.type)).toEqual(["prompt", "prompt", "log", "log"]);
    expect(events[1]).toMatchObject({ type: "prompt", prompt: { status: "closed" } });
  });

  it("rejects overlapping prompts on the invocation prompter", async () => {
    const input = new TestInput();
    const queue = createPrintQueue({ print: () => undefined });
    const prompt = new PromptController({
      interactive: true,
      input,
      print: (event) => queue.printChecked(event),
      terminal: new TerminalLock(),
      signal: new AbortController().signal,
    });
    const first = prompt.text({ message: "First" });
    await expect(prompt.confirm({ message: "Second" })).rejects.toMatchObject({
      reason: "overlapping",
      prompt: { kind: "confirm", message: "Second" },
    });
    input.write("ok\r");
    await expect(first).resolves.toBe("ok");
    await queue.drain();
  });

  it("defines invalid options, input errors, and printer errors", async () => {
    const input = new TestInput();
    const states: string[] = [];
    const prompt = new PromptController({
      interactive: true,
      input,
      print: async (event) => {
        if (event.type === "prompt") states.push(event.prompt.status);
      },
      terminal: new TerminalLock(),
      signal: new AbortController().signal,
    });
    await expect(prompt.select({ message: "Empty", options: [] })).rejects.toMatchObject({
      reason: "invalid-options",
    });
    await expect(
      prompt.select({
        message: "Duplicate",
        options: [{ value: "same" }, { value: "same" }],
      }),
    ).rejects.toMatchObject({ reason: "invalid-options" });

    const brokenPrinter = new PromptController({
      interactive: true,
      input,
      print: async () => Promise.reject(new Error("write failed")),
      terminal: new TerminalLock(),
      signal: new AbortController().signal,
    });
    await expect(brokenPrinter.text({ message: "Value" })).rejects.toMatchObject({
      reason: "printer-error",
      cause: expect.objectContaining({ message: "write failed" }),
    });
    expect(input.rawModes).toEqual([true, false]);

    const inputFailure = prompt.text({ message: "Value" });
    await turn();
    input.emit("error", new Error("read failed"));
    await expect(inputFailure).rejects.toMatchObject({
      reason: "input-error",
      cause: expect.objectContaining({ message: "read failed" }),
    });
    expect(input.isRaw).toBe(false);
    expect(states).toEqual(["active", "closed"]);
  });

  it("rejects a stdin value without readable-stream operations", async () => {
    const prompt = new PromptController({
      interactive: true,
      input: { isTTY: true } as TestInput,
      print: async () => undefined,
      terminal: new TerminalLock(),
      signal: new AbortController().signal,
    });
    await expect(prompt.text({ message: "Value" })).rejects.toMatchObject({
      reason: "input-error",
      message: "Interactive input is not a readable stream",
    });
  });

  it("propagates a submitted-state printer failure after cleaning up", async () => {
    const input = new TestInput();
    let calls = 0;
    const prompt = new PromptController({
      interactive: true,
      input,
      print: async () => {
        calls += 1;
        if (calls === 2) throw new Error("final write failed");
      },
      terminal: new TerminalLock(),
      signal: new AbortController().signal,
    });
    const result = prompt.confirm({ message: "Continue?" });
    await turn();
    input.write("y");
    await expect(result).rejects.toMatchObject({ reason: "printer-error" });
    expect(input.isRaw).toBe(false);
    expect(input.listenerCount("keypress")).toBe(0);
  });

  it("preserves a structured printer error through runCommand draining", async () => {
    const input = new TestInput();
    const failure = new Error("printer failed");
    const result = runCommand(
      defineCommand({
        run: async ({ prompt }) => {
          await prompt.text({ message: "Value" });
        },
      }),
      [],
      {
        stdin: input,
        stdout: terminalOutput,
        env: {},
        printer: { print: async () => Promise.reject(failure) },
      },
    );
    await expect(result).rejects.toMatchObject({ reason: "printer-error", cause: failure });
    expect(input.isRaw).toBe(false);
  });

  it("attempts a closing render after a printer failure and preserves the first error", async () => {
    const input = new TestInput();
    const states: string[] = [];
    const failure = new Error("redraw failed");
    const prompt = new PromptController({
      interactive: true,
      input,
      print: async (event) => {
        if (event.type !== "prompt") return;
        states.push(event.prompt.status);
        if (states.length === 2) throw failure;
      },
      terminal: new TerminalLock(),
      signal: new AbortController().signal,
    });
    const result = prompt.text({ message: "Value" });
    await turn();
    input.write("a");

    await expect(result).rejects.toMatchObject({ reason: "printer-error", cause: failure });
    expect(states).toEqual(["active", "active", "closed"]);
    expect(input.isRaw).toBe(false);
  });
});

describe("autocomplete prompts", () => {
  it("filters labels case-insensitively in definition order and infers literal values", async () => {
    const input = new TestInput();
    const events: PrintEvent[] = [];
    const result = runCommand(
      defineCommand({
        async run({ prompt }) {
          const value = await prompt.autocomplete({
            message: "Language",
            placeholder: "Search languages",
            options: [
              { value: "ts", label: "TypeScript", hint: "typed" },
              { value: "js", label: "JavaScript" },
              { value: "script" },
              { value: "script-value", label: "Other" },
            ],
          });
          expectTypeOf(value).toEqualTypeOf<"ts" | "js" | "script" | "script-value">();
          expect(value).toBe("js");
        },
      }),
      [],
      {
        stdin: input,
        stdout: terminalOutput,
        printer: { print: (event) => void events.push(event) },
        env: {},
      },
    );
    await turn();
    input.write("ScRiPt\u001b[B\u001b[B\r");
    await result;
    const states = events.flatMap((event) =>
      event.type === "prompt" && event.prompt.kind === "autocomplete" ? [event.prompt] : [],
    );
    expect(states[0]).toMatchObject({
      query: "",
      phase: "input",
      placeholder: "Search languages",
      choices: [
        { value: "ts", selected: false, hint: "typed" },
        { value: "js", selected: false },
        { value: "script", selected: false },
        { value: "script-value", selected: false },
      ],
    });
    expect(states[0]).not.toHaveProperty("value");
    expect(states.find((state) => state.query === "ScRiPt")).toMatchObject({
      phase: "input",
      choices: [{ value: "ts" }, { value: "js" }, { value: "script" }],
    });
    expect(states.at(-1)).toMatchObject({
      status: "submitted",
      phase: "select",
      value: "js",
      query: "ScRiPt",
    });
    expect(input.rawModes).toEqual([true, false]);
    expect(input.listenerCount("data")).toBe(0);
  });

  it("requires selection, clamps navigation, and edits the query from either phase", async () => {
    const input = new TestInput();
    const events: PrintEvent[] = [];
    let onInput: (() => void) | undefined;
    const prompt = new PromptController({
      interactive: true,
      input,
      print: async (event) => {
        events.push(event);
        if (
          event.type === "prompt" &&
          event.prompt.kind === "autocomplete" &&
          event.prompt.phase === "input"
        ) {
          onInput?.();
        }
      },
      terminal: new TerminalLock(),
      signal: new AbortController().signal,
    });
    const result = prompt.autocomplete({
      message: "Language",
      options: [{ value: "alpha" }, { value: "beta" }],
    });
    const latest = () => {
      const event = events.at(-1);
      if (event?.type !== "prompt" || event.prompt.kind !== "autocomplete") {
        throw new Error("Expected autocomplete state");
      }
      return event.prompt;
    };
    await turn();
    input.write("\r\u001b[A\u001bOP\t");
    await turn();
    expect(events).toHaveLength(1);
    input.write("\u001b[B\u001b[B\u001b[B");
    await turn();
    expect(latest()).toMatchObject({ phase: "select", value: "beta", status: "active" });
    input.write("\u001b[A\u001b[A\u001b[A");
    await turn();
    expect(latest()).toMatchObject({ phase: "input", query: "" });
    expect(latest()).not.toHaveProperty("value");
    input.write("\u001b[Bz\r\u001b[B");
    await turn();
    expect(latest()).toMatchObject({ phase: "input", query: "z", choices: [], status: "active" });
    input.write("\u007f\u001b[B\u007f");
    await turn();
    expect(latest()).toMatchObject({
      phase: "input",
      query: "",
      choices: [{ selected: false }, { selected: false }],
    });
    let escaped = false;
    onInput = () => {
      escaped = true;
    };
    input.write("\u001b[B\u001b");
    await expect.poll(() => escaped).toBe(true);
    expect(latest()).toMatchObject({ phase: "input", query: "", status: "active" });
    expect(latest()).not.toHaveProperty("value");
    input.write("bet\u001b[B\r");
    await expect(result).resolves.toBe("beta");
  });

  it.each(["e\u0301", "👨‍👩‍👧‍👦", "🇯🇵"])("removes the complete final grapheme %s", async (grapheme) => {
    const input = new TestInput();
    const events: PrintEvent[] = [];
    const prompt = new PromptController({
      interactive: true,
      input,
      print: async (event) => void events.push(event),
      terminal: new TerminalLock(),
      signal: new AbortController().signal,
    });
    const result = prompt.autocomplete({
      message: "Value",
      options: [{ value: "A" }],
    });
    await turn();
    input.write(`A${grapheme}\u007f\u001b[B\r`);
    await expect(result).resolves.toBe("A");
    expect(events.at(-1)).toMatchObject({
      prompt: { query: "A", status: "submitted", value: "A" },
    });
  });

  it.each([
    ["escape", "\u001b", "cancelled"],
    ["Ctrl-C in selection", "\u001b[B\u0003", "cancelled"],
    ["Ctrl-D in selection", "\u001b[B\u0004", "eof"],
  ])("handles %s through the shared lifecycle", async (_name, sequence, reason) => {
    const input = new TestInput();
    const events: PrintEvent[] = [];
    const terminal = new TerminalLock();
    const prompt = new PromptController({
      interactive: true,
      input,
      print: async (event) => void events.push(event),
      terminal,
      signal: new AbortController().signal,
    });
    const result = prompt.autocomplete({ message: "Value", options: [{ value: "one" }] });
    await turn();
    input.write(sequence);
    await expect(result).rejects.toMatchObject({
      reason,
      prompt: { kind: "autocomplete", message: "Value", choices: ["one"] },
    });
    expect(input.rawModes).toEqual([true, false]);
    expect(input.listenerCount("data")).toBe(0);
    expect(events.at(-1)).toMatchObject({ prompt: { kind: "autocomplete", status: "closed" } });
    expect(terminal.owner).toBeUndefined();
  });

  it.each(["non-interactive", "pre-aborted", "aborted", "input-error", "printer-error"] as const)(
    "handles %s without leaking input listeners or the terminal",
    async (failure) => {
      const input = new TestInput();
      const events: PrintEvent[] = [];
      const abort = new AbortController();
      const terminal = new TerminalLock();
      const cause = new Error("failed");
      if (failure === "pre-aborted") abort.abort(cause);
      const prompt = new PromptController({
        interactive: failure !== "non-interactive",
        input,
        print: async (event) => {
          events.push(event);
          if (failure === "printer-error") throw cause;
        },
        terminal,
        signal: abort.signal,
      });
      const result = prompt.autocomplete({ message: "Value", options: [{ value: "one" }] });
      const rejection = expect(result).rejects.toMatchObject({
        reason: failure === "pre-aborted" ? "aborted" : failure,
        prompt: { kind: "autocomplete", message: "Value", choices: ["one"] },
        ...(failure === "non-interactive" ? {} : { cause }),
      });
      if (failure === "aborted" || failure === "input-error") {
        await turn();
        if (failure === "aborted") abort.abort(cause);
        else input.emit("error", cause);
      }
      await rejection;
      expect(input.isRaw).toBe(false);
      expect(input.listenerCount("data")).toBe(0);
      expect(getEventListeners(abort.signal, "abort")).toHaveLength(0);
      expect(terminal.owner).toBeUndefined();
      if (failure === "non-interactive" || failure === "pre-aborted") {
        expect(events).toEqual([]);
        expect(input.rawModes).toEqual([]);
      } else {
        expect(events.at(-1)).toMatchObject({ prompt: { status: "closed" } });
        expect(input.rawModes).toEqual([true, false]);
      }
    },
  );

  it.each(["redraw", "submitted"] as const)(
    "closes after a %s printer failure and preserves the original cause",
    async (stage) => {
      const input = new TestInput();
      const events: PrintEvent[] = [];
      const terminal = new TerminalLock();
      const cause = new Error("write failed");
      const prompt = new PromptController({
        interactive: true,
        input,
        print: async (event) => {
          events.push(event);
          if (
            event.type === "prompt" &&
            (stage === "redraw" ? events.length === 2 : event.prompt.status === "submitted")
          ) {
            throw cause;
          }
          if (event.type === "prompt" && event.prompt.status === "closed") {
            throw new Error("closing write also failed");
          }
        },
        terminal,
        signal: new AbortController().signal,
      });
      const result = prompt.autocomplete({ message: "Value", options: [{ value: "one" }] });
      await turn();
      input.write(stage === "redraw" ? "o" : "\u001b[B\r");
      await expect(result).rejects.toMatchObject({ reason: "printer-error", cause });
      expect(events.at(-1)).toMatchObject({ prompt: { status: "closed" } });
      expect(input.rawModes).toEqual([true, false]);
      expect(input.listenerCount("data")).toBe(0);
      expect(terminal.owner).toBeUndefined();
    },
  );

  it("shares the terminal lock and preserves type-ahead for the next prompt", async () => {
    const input = new TestInput();
    const prompt = new PromptController({
      interactive: true,
      input,
      print: async () => undefined,
      terminal: new TerminalLock(),
      signal: new AbortController().signal,
    });
    const result = prompt.autocomplete({ message: "Value", options: [{ value: "one" }] });
    await expect(prompt.text({ message: "Overlap" })).rejects.toMatchObject({
      reason: "overlapping",
    });
    input.write("\u001b[B\rnext\r");
    await expect(result).resolves.toBe("one");
    await expect(prompt.text({ message: "Next" })).resolves.toBe("next");
    expect(input.rawModes).toEqual([true, false, true, false]);
  });

  it.each([
    { message: "", options: [{ value: "one" }] },
    { message: "Value", options: [] },
    { message: "Value", options: [{ value: "same" }, { value: "same" }] },
    { message: "Value", options: [{ value: "" }] },
    { message: "Value", options: [{ value: "one", label: 1 }] },
    { message: "Value", options: [{ value: "one", hint: false }] },
    { message: "Value", options: [null] },
    { message: "Value", options: "invalid" },
    { message: "Value", options: [{ value: "one" }], placeholder: 1 },
  ])("validates options before acquiring input: %j", async (options) => {
    const input = new TestInput();
    const events: PrintEvent[] = [];
    const prompt = new PromptController({
      interactive: true,
      input,
      print: async (event) => void events.push(event),
      terminal: new TerminalLock(),
      signal: new AbortController().signal,
    });
    await expect(
      prompt.autocomplete(options as Parameters<typeof prompt.autocomplete>[0]),
    ).rejects.toMatchObject({ reason: "invalid-options", prompt: { kind: "autocomplete" } });
    expect(input.rawModes).toEqual([]);
    expect(events).toEqual([]);
  });
});

describe.each(["select", "autocomplete"] as const)("%s sorting", (kind) => {
  it("sorts numeric keys stably without mutating readonly options", async () => {
    const input = new TestInput();
    const events: PrintEvent[] = [];
    const options = Object.freeze([
      Object.freeze({ value: "last", priority: 10 }),
      Object.freeze({ value: "first-tie", priority: 2 }),
      Object.freeze({ value: "second-tie", priority: 2 }),
      Object.freeze({ value: "first", priority: -1 }),
    ]);
    const calls: (typeof options)[number][] = [];
    const prompt = new PromptController({
      interactive: true,
      input,
      print: async (event) => void events.push(event),
      terminal: new TerminalLock(),
      signal: new AbortController().signal,
    });
    const result = prompt[kind]({
      message: "Priority",
      options,
      sortBy: (item) => {
        calls.push(item);
        return item.priority;
      },
    });
    await turn();
    expect(events[0]).toMatchObject({
      prompt: {
        choices: [
          { value: "first" },
          { value: "first-tie" },
          { value: "second-tie" },
          { value: "last" },
        ],
      },
    });
    input.write(kind === "select" ? "\u001b[B\u001b[B\r" : "\u001b[B\u001b[B\u001b[B\r");
    await expect(result).resolves.toBe("second-tie");
    expect(calls).toHaveLength(options.length);
    for (const item of options) {
      expect(calls.filter((called) => called === item)).toHaveLength(1);
    }
    expect(options.map((item) => item.value)).toEqual(["last", "first-tie", "second-tie", "first"]);
  });

  it("orders string keys lexically rather than numerically or by locale", async () => {
    const input = new TestInput();
    const events: PrintEvent[] = [];
    const prompt = new PromptController({
      interactive: true,
      input,
      print: async (event) => void events.push(event),
      terminal: new TerminalLock(),
      signal: new AbortController().signal,
    });
    const result = prompt[kind]({
      message: "Lexical",
      options: [
        { value: "ä" },
        { value: "a" },
        { value: "Z" },
        { value: "2" },
        { value: "10" },
        { value: "empty-key" },
      ],
      sortBy: (item) => (item.value === "empty-key" ? "" : item.value),
    });
    await turn();
    expect(events[0]).toMatchObject({
      prompt: {
        choices: [
          { value: "empty-key" },
          { value: "10" },
          { value: "2" },
          { value: "Z" },
          { value: "a" },
          { value: "ä" },
        ],
      },
    });
    input.write(kind === "select" ? "\r" : "\u001b[B\r");
    await expect(result).resolves.toBe("empty-key");
  });

  it.each([
    ["undefined key", () => undefined],
    ["null key", () => null],
    ["boolean key", () => true],
    ["object key", () => ({})],
    ["bigint key", () => 1n],
    ["symbol key", () => Symbol("key")],
    ["NaN key", () => Number.NaN],
    ["mixed key types", (item: { value: string }) => (item.value === "one" ? 1 : "2")],
    ["nonfunction callback", "value"],
    ["null callback", null],
  ])("rejects %s without acquiring input", async (_name, sortBy) => {
    const input = new TestInput();
    const events: PrintEvent[] = [];
    const terminal = new TerminalLock();
    const signal = new AbortController().signal;
    const prompt = new PromptController({
      interactive: true,
      input,
      print: async (event) => void events.push(event),
      terminal,
      signal,
    });
    const options = {
      message: "Invalid sorting",
      options: [{ value: "one" }, { value: "two" }],
      sortBy,
    } as unknown as Parameters<typeof prompt.select>[0];
    await expect(prompt[kind](options)).rejects.toMatchObject({
      name: "HackshPromptError",
      reason: "invalid-options",
      prompt: { kind, message: "Invalid sorting" },
    });
    expect(events).toEqual([]);
    expect(input.rawModes).toEqual([]);
    expect(input.listenerCount("data")).toBe(0);
    expect(input.listenerCount("keypress")).toBe(0);
    expect(getEventListeners(signal, "abort")).toHaveLength(0);
    expect(terminal.owner).toBeUndefined();
  });

  it("preserves a callback failure and leaves the controller usable", async () => {
    const input = new TestInput();
    const events: PrintEvent[] = [];
    const terminal = new TerminalLock();
    const signal = new AbortController().signal;
    const cause = new Error("Cannot rank item");
    const prompt = new PromptController({
      interactive: true,
      input,
      print: async (event) => void events.push(event),
      terminal,
      signal,
    });
    await expect(
      prompt[kind]({
        message: "Broken sorting",
        options: [{ value: "one" }, { value: "two" }],
        sortBy: (item) => {
          if (item.value === "two") throw cause;
          return 1;
        },
      }),
    ).rejects.toMatchObject({
      name: "HackshPromptError",
      reason: "input-error",
      cause,
      prompt: { kind, message: "Broken sorting" },
    });
    expect(events).toEqual([]);
    expect(input.rawModes).toEqual([]);
    expect(input.listenerCount("data")).toBe(0);
    expect(input.listenerCount("keypress")).toBe(0);
    expect(getEventListeners(signal, "abort")).toHaveLength(0);
    expect(terminal.owner).toBeUndefined();
    const recovery = prompt[kind]({ message: "Recovery", options: [{ value: "ok" }] });
    await turn();
    input.write(kind === "select" ? "\r" : "\u001b[B\r");
    await expect(recovery).resolves.toBe("ok");
    expect(input.rawModes).toEqual([true, false]);
    expect(terminal.owner).toBeUndefined();
  });
});

it("locates select initialValue in sorted order before navigating", async () => {
  const input = new TestInput();
  const events: PrintEvent[] = [];
  const prompt = new PromptController({
    interactive: true,
    input,
    print: async (event) => void events.push(event),
    terminal: new TerminalLock(),
    signal: new AbortController().signal,
  });
  const result = prompt.select({
    message: "Priority",
    options: [
      { value: "middle", priority: 2 },
      { value: "last", priority: 3 },
      { value: "first", priority: 1 },
    ],
    initialValue: "middle",
    sortBy: (item) => item.priority,
  });
  await turn();
  expect(events[0]).toMatchObject({
    prompt: {
      value: "middle",
      choices: [
        { value: "first", selected: false },
        { value: "middle", selected: true },
        { value: "last", selected: false },
      ],
    },
  });
  input.write("\u001b[A\r");
  await expect(result).resolves.toBe("first");
});

it("filters sorted autocomplete choices without reevaluating keys as the query changes", async () => {
  const input = new TestInput();
  const events: PrintEvent[] = [];
  const calls: string[] = [];
  const prompt = new PromptController({
    interactive: true,
    input,
    print: async (event) => void events.push(event),
    terminal: new TerminalLock(),
    signal: new AbortController().signal,
  });
  const result = prompt.autocomplete({
    message: "Priority",
    options: [
      { value: "late", label: "Match late", priority: 10 },
      { value: "other", label: "Other", priority: 0 },
      { value: "early", label: "Match early", priority: 2 },
    ],
    sortBy: (item) => {
      calls.push(item.value);
      return item.priority;
    },
  });
  await turn();
  expect(events[0]).toMatchObject({
    prompt: { choices: [{ value: "other" }, { value: "early" }, { value: "late" }] },
  });
  input.write("mat\u001b[B");
  await turn();
  expect(events.at(-1)).toMatchObject({
    prompt: {
      phase: "select",
      query: "mat",
      value: "early",
      choices: [
        { value: "early", selected: true },
        { value: "late", selected: false },
      ],
    },
  });
  input.write("\u007f\u007f\u007f");
  await turn();
  expect(events.at(-1)).toMatchObject({
    prompt: {
      phase: "input",
      query: "",
      choices: [{ value: "other" }, { value: "early" }, { value: "late" }],
    },
  });
  input.write("match\u001b[B\u001b[B\r");
  await expect(result).resolves.toBe("late");
  expect(calls).toHaveLength(3);
  expect([...calls].sort()).toEqual(["early", "late", "other"]);
});

it("HackshPromptError exposes stable prompt details", () => {
  const error = new HackshPromptError(
    "non-interactive",
    { kind: "select", message: "Environment", choices: ["staging", "production"] },
    "Input required",
  );
  expect(error).toMatchObject({
    name: "HackshPromptError",
    reason: "non-interactive",
    prompt: { kind: "select", message: "Environment", choices: ["staging", "production"] },
  });
});

describe("noninteractive prompt subprocess", () => {
  it.each([
    ["JSON", { HACKSH_OUTPUT: "json" }],
    ["CI", { HACKSH_OUTPUT: "pretty", CI: "1" }],
    ["non-TTY", { HACKSH_OUTPUT: "pretty" }],
  ])("fails immediately in %s mode and identifies required input", async (_name, environment) => {
    const fixture = fileURLToPath(
      new URL("fixtures/prompt-noninteractive-cli.ts", import.meta.url),
    );
    const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>(
      (resolve, reject) => {
        const child = spawn(process.execPath, ["--experimental-strip-types", fixture], {
          env: { ...process.env, ...environment, NODE_NO_WARNINGS: "1" },
          stdio: ["pipe", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
        child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
        const timeout = setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error("noninteractive prompt subprocess timed out"));
        }, 2_000);
        child.once("error", reject);
        child.once("exit", (code) => {
          clearTimeout(timeout);
          resolve({ code, stdout, stderr });
        });
      },
    );

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("non-interactive");
    expect(result.stderr).toContain("Environment");
    expect(result.stderr).toContain("staging");
    expect(result.stderr).toContain("production");
    if (_name === "JSON") {
      expect(JSON.parse(result.stderr)).toMatchObject({
        type: "error",
        error: {
          kind: "prompt",
          name: "HackshPromptError",
          properties: {
            reason: "non-interactive",
            prompt: {
              kind: "select",
              message: "Environment",
              choices: ["staging", "production"],
            },
          },
        },
      });
    }
  });
});
