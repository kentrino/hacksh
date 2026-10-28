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
        return value;
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

    await expect(result).resolves.toEqual("production");
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
        return { confirmed, text };
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

    await expect(result).resolves.toEqual({ confirmed: true, text: "xhi" });
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
        return { letters, unicode };
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

    await expect(result).resolves.toEqual({ letters: "fF", unicode: "A" });
  });

  it("preserves pasted type-ahead for the next prompt", async () => {
    const input = new TestInput();
    const command = defineCommand({
      async run({ prompt }) {
        const confirmed = await prompt.confirm({ message: "Continue?" });
        const name = await prompt.text({ message: "Name" });
        return { confirmed, name };
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

    await expect(result).resolves.toEqual({ confirmed: true, name: "name" });
  });

  it("treats an empty validation message as valid", async () => {
    const input = new TestInput();
    const result = runCommand(
      defineCommand({
        run: async ({ prompt }) => await prompt.text({ message: "Value", validate: () => "" }),
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

    await expect(result).resolves.toEqual("accepted");
  });

  it("always rejects noninteractive prompts, including prompts with defaults", async () => {
    const input = new TestInput();
    const command = defineCommand({
      async run({ prompt }) {
        return await prompt.confirm({ message: "Continue?", initialValue: true });
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
        run: async ({ prompt }) => await prompt.text({ message: "Value" }),
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
        run: async ({ prompt }) => await prompt.text({ message: "Value" }),
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
          return await prompt.confirm({ message: "Continue?" });
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
        run: async ({ prompt }) => await prompt.text({ message: "Value" }),
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
