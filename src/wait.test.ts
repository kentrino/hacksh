import { getEventListeners } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vite-plus/test";
import { defineCommand } from "./command.ts";
import type { PrintEvent, Printer } from "./printer-api.ts";
import { PromptController, type WaitOptions } from "./prompts.ts";
import { runCommand } from "./run.ts";
import { TerminalLock } from "./terminal.ts";

function createPrompt(
  options: { interactive?: boolean; print?: Printer["print"]; signal?: AbortSignal } = {},
) {
  const events: PrintEvent[] = [];
  const input = Object.assign(new PassThrough(), { isTTY: true, setRawMode: vi.fn() });
  const terminal = new TerminalLock();
  const signal = options.signal ?? new AbortController().signal;
  const prompt = new PromptController({
    interactive: options.interactive ?? true,
    input,
    terminal,
    signal,
    print: async (event) => {
      events.push(event);
      await options.print?.(event);
    },
  });
  return { prompt, events, input, terminal, signal };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function turn(): Promise<void> {
  const { promise, resolve } = deferred<void>();
  setImmediate(resolve);
  await promise;
}

describe("wait prompts", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each(["sync", "async"] as const)(
    "returns the exact %s result without touching input and restores the terminal",
    async (mode) => {
      const { prompt, events, input, terminal, signal } = createPrompt();
      const resume = vi.spyOn(input, "resume");
      const pause = vi.spyOn(input, "pause");
      const value = { answer: 42 };
      const work = vi.fn(() => (mode === "sync" ? value : Promise.resolve(value)));
      const result = prompt.wait(work);
      expectTypeOf(result).toEqualTypeOf<Promise<{ answer: number }>>();
      await expect(result).resolves.toBe(value);
      expect(work).toHaveBeenCalledOnce();
      expect(events).toEqual([
        { type: "prompt", prompt: { kind: "wait", message: "待機中", status: "active", frame: 0 } },
        { type: "prompt", prompt: { kind: "wait", message: "待機中", status: "closed", frame: 0 } },
      ]);
      expect(input.setRawMode).not.toHaveBeenCalled();
      expect(resume).not.toHaveBeenCalled();
      expect(pause).not.toHaveBeenCalled();
      expect(input.listenerCount("data")).toBe(0);
      expect(input.listenerCount("keypress")).toBe(0);
      expect(getEventListeners(signal, "abort")).toHaveLength(0);
      expect(terminal.owner).toBeUndefined();
      expect(vi.getTimerCount()).toBe(0);
      await expect(prompt.wait(() => value, { message: "Loading" })).resolves.toBe(value);
      expect(events.at(-1)).toMatchObject({ prompt: { message: "Loading", status: "closed" } });
    },
  );

  it.each([
    ["throw", new Error("callback failed")],
    ["reject", { failure: "callback" }],
    ["throw", undefined],
    ["reject", null],
  ] as const)("preserves a callback %s (%s) and permits reuse", async (mode, failure) => {
    const { prompt, events, terminal, signal } = createPrompt();
    await expect(
      prompt.wait(() => {
        if (mode === "throw") throw failure;
        return Promise.reject(failure);
      }),
    ).rejects.toBe(failure);
    expect(events.at(-1)).toMatchObject({ prompt: { status: "closed" } });
    expect(terminal.owner).toBeUndefined();
    expect(getEventListeners(signal, "abort")).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    await expect(prompt.wait(() => "reused")).resolves.toBe("reused");
  });

  it.each(["", null, 42])("rejects an invalid message %s before starting work", async (message) => {
    const { prompt, events, terminal } = createPrompt();
    const work = vi.fn();
    await expect(prompt.wait(work, { message } as unknown as WaitOptions)).rejects.toMatchObject({
      reason: "invalid-options",
      prompt: { kind: "wait" },
    });
    expect(work).not.toHaveBeenCalled();
    expect(events).toEqual([]);
    expect(terminal.owner).toBeUndefined();
  });

  it("rejects a nonfunction callback before acquiring the terminal", async () => {
    const { prompt, events, terminal } = createPrompt();
    await expect(prompt.wait(null as unknown as () => void)).rejects.toMatchObject({
      reason: "invalid-options",
      prompt: { kind: "wait", message: "待機中" },
    });
    expect(events).toEqual([]);
    expect(terminal.owner).toBeUndefined();
  });

  it("rejects overlapping waits, input prompts, and terminal execution until work settles", async () => {
    const { prompt, terminal } = createPrompt();
    const work = deferred<string>();
    const result = prompt.wait(() => work.promise);
    const second = vi.fn();
    await expect(prompt.wait(second)).rejects.toMatchObject({ reason: "overlapping" });
    await expect(prompt.text({ message: "Input" })).rejects.toMatchObject({
      reason: "overlapping",
    });
    expect(second).not.toHaveBeenCalled();
    expect(terminal.acquire("exec")).toBe(false);
    work.resolve("done");
    await expect(result).resolves.toBe("done");
    expect(terminal.acquire("exec")).toBe(true);
    await expect(prompt.wait(second)).rejects.toMatchObject({
      reason: "overlapping",
      message: "A command is using the terminal",
    });
    expect(second).not.toHaveBeenCalled();
    expect(terminal.owner).toBe("exec");
    terminal.release();
  });

  it("rejects nested waits without losing the outer callback failure", async () => {
    const { prompt, terminal, events } = createPrompt();
    const inner = vi.fn();
    await expect(prompt.wait(() => prompt.wait(inner))).rejects.toMatchObject({
      reason: "overlapping",
      prompt: { kind: "wait" },
    });
    expect(inner).not.toHaveBeenCalled();
    expect(events).toHaveLength(2);
    expect(terminal.owner).toBeUndefined();
    await expect(prompt.wait(() => "reused")).resolves.toBe("reused");
  });

  it("cannot start a wait while an input prompt owns the terminal", async () => {
    const { prompt, input, terminal } = createPrompt();
    const result = prompt.confirm({ message: "Continue?" });
    await turn();
    const work = vi.fn();
    await expect(prompt.wait(work)).rejects.toMatchObject({ reason: "overlapping" });
    expect(work).not.toHaveBeenCalled();
    expect(terminal.owner).toBe("prompt");
    input.write("y");
    await expect(result).resolves.toBe(true);
    await expect(prompt.wait(() => "reused")).resolves.toBe("reused");
  });

  it("executes noninteractive work with static lifecycle events and no timer", async () => {
    const { prompt, events, input, terminal } = createPrompt({ interactive: false });
    const work = deferred<object>();
    const value = {};
    const result = prompt.wait(() => work.promise);
    await turn();
    expect(events).toEqual([
      { type: "prompt", prompt: { kind: "wait", message: "待機中", status: "active" } },
    ]);
    expect(terminal.owner).toBe("prompt");
    await expect(prompt.wait(() => undefined)).rejects.toMatchObject({ reason: "overlapping" });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(events).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    work.resolve(value);
    await expect(result).resolves.toBe(value);
    expect(events.at(-1)).toEqual({
      type: "prompt",
      prompt: { kind: "wait", message: "待機中", status: "closed" },
    });
    expect(input.setRawMode).not.toHaveBeenCalled();
    expect(terminal.owner).toBeUndefined();
  });

  it("executes JSON-mode work without animation even when streams are terminals", async () => {
    const input = Object.assign(new PassThrough(), { isTTY: true, setRawMode: vi.fn() });
    const output: string[] = [];
    const work = deferred<object>();
    const value = {};
    let returned: object | undefined;
    const result = runCommand(
      defineCommand({
        async run({ prompt }) {
          returned = await prompt.wait(() => work.promise);
        },
      }),
      [],
      {
        stdin: input,
        stdout: { isTTY: true, write: (text) => void output.push(text) },
        stderr: { isTTY: true, write: (text) => void output.push(text) },
        env: { HACKSH_OUTPUT: "json" },
      },
    );
    await turn();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(output).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    work.resolve(value);
    await result;
    expect(returned).toBe(value);
    expect(output.map((line) => JSON.parse(line))).toEqual([
      { type: "prompt", prompt: { kind: "wait", message: "待機中", status: "active" } },
      { type: "prompt", prompt: { kind: "wait", message: "待機中", status: "closed" } },
    ]);
    expect(input.setRawMode).not.toHaveBeenCalled();
  });

  it("advances frames only after the preceding print settles, without accumulating ticks", async () => {
    const blockedPrint = deferred<void>();
    let printing = 0;
    let maximumPrinting = 0;
    const { prompt, events, terminal } = createPrompt({
      print: async (event) => {
        printing += 1;
        maximumPrinting = Math.max(maximumPrinting, printing);
        if (event.type === "prompt" && event.prompt.kind === "wait" && event.prompt.frame === 1) {
          await blockedPrint.promise;
        }
        printing -= 1;
      },
    });
    const work = deferred<string>();
    const result = prompt.wait(() => work.promise);
    await turn();
    await vi.advanceTimersByTimeAsync(80);
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ prompt: { status: "active", frame: 1 } });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(events).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
    work.resolve("done");
    await turn();
    expect(events).toHaveLength(2);
    expect(terminal.owner).toBe("prompt");
    blockedPrint.resolve();
    await expect(result).resolves.toBe("done");
    expect(maximumPrinting).toBe(1);
    expect(events.at(-1)).toMatchObject({ prompt: { status: "closed", frame: 1 } });
    expect(vi.getTimerCount()).toBe(0);
    expect(terminal.owner).toBeUndefined();
  });

  it("continues animating while work is pending and stops after completion", async () => {
    const { prompt, events } = createPrompt();
    const work = deferred<string>();
    const result = prompt.wait(() => work.promise);
    await turn();
    await vi.advanceTimersByTimeAsync(240);
    expect(events.map((event) => event.type === "prompt" && event.prompt)).toEqual([
      { kind: "wait", message: "待機中", status: "active", frame: 0 },
      { kind: "wait", message: "待機中", status: "active", frame: 1 },
      { kind: "wait", message: "待機中", status: "active", frame: 2 },
      { kind: "wait", message: "待機中", status: "active", frame: 3 },
    ]);
    work.resolve("done");
    await result;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(events).toHaveLength(5);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("closes after an initial printer failure, skips work, and releases the lock", async () => {
    const cause = new Error("initial print failed");
    let failed = false;
    const { prompt, events, terminal, signal } = createPrompt({
      print: () => {
        if (!failed) {
          failed = true;
          throw cause;
        }
      },
    });
    const work = vi.fn();
    await expect(prompt.wait(work)).rejects.toMatchObject({ reason: "printer-error", cause });
    expect(work).not.toHaveBeenCalled();
    expect(events.map((event) => event.type === "prompt" && event.prompt.status)).toEqual([
      "active",
      "closed",
    ]);
    expect(terminal.owner).toBeUndefined();
    expect(getEventListeners(signal, "abort")).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    await expect(prompt.wait(() => "reused")).resolves.toBe("reused");
  });

  it.each(["resolve", "reject"] as const)(
    "closes promptly after a tick failure but awaits callback %s before releasing its lock",
    async (outcome) => {
      const cause = new Error("tick print failed");
      const callbackFailure = new Error("callback failed");
      const { prompt, events, terminal, signal } = createPrompt({
        print: (event) => {
          if (event.type === "prompt" && event.prompt.kind === "wait" && event.prompt.frame === 1) {
            throw cause;
          }
        },
      });
      const work = deferred<string>();
      const result = prompt.wait(() => work.promise);
      let settled = false;
      void result.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );
      await turn();
      await vi.advanceTimersByTimeAsync(80);
      expect(events.map((event) => event.type === "prompt" && event.prompt.status)).toEqual([
        "active",
        "active",
        "closed",
      ]);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(events).toHaveLength(3);
      expect(vi.getTimerCount()).toBe(0);
      expect(settled).toBe(false);
      expect(terminal.owner).toBe("prompt");
      await expect(prompt.wait(() => undefined)).rejects.toMatchObject({ reason: "overlapping" });
      if (outcome === "resolve") {
        work.resolve("done");
        await expect(result).rejects.toMatchObject({ reason: "printer-error", cause });
      } else {
        work.reject(callbackFailure);
        await expect(result).rejects.toBe(callbackFailure);
      }
      expect(terminal.owner).toBeUndefined();
      expect(getEventListeners(signal, "abort")).toHaveLength(0);
      await expect(prompt.wait(() => "reused")).resolves.toBe("reused");
    },
  );

  it.each(["resolve", "reject"] as const)(
    "handles a closing printer failure after callback %s without losing the callback error",
    async (outcome) => {
      const cause = new Error("close failed");
      const callbackFailure = new Error("callback failed");
      const { prompt, terminal, signal, events } = createPrompt({
        print: (event) => {
          if (event.type === "prompt" && event.prompt.status === "closed") throw cause;
        },
      });
      const result = prompt.wait(() => {
        if (outcome === "reject") throw callbackFailure;
        return "done";
      });
      if (outcome === "reject") await expect(result).rejects.toBe(callbackFailure);
      else await expect(result).rejects.toMatchObject({ reason: "printer-error", cause });
      expect(events).toHaveLength(2);
      expect(terminal.owner).toBeUndefined();
      expect(terminal.acquire("exec")).toBe(true);
      terminal.release();
      expect(getEventListeners(signal, "abort")).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("rejects a pre-aborted invocation without starting work or touching the terminal", async () => {
    const controller = new AbortController();
    const cause = new Error("aborted");
    controller.abort(cause);
    const { prompt, events, terminal, signal, input } = createPrompt({ signal: controller.signal });
    const work = vi.fn();
    await expect(prompt.wait(work)).rejects.toMatchObject({ reason: "aborted", cause });
    expect(work).not.toHaveBeenCalled();
    expect(events).toEqual([]);
    expect(input.setRawMode).not.toHaveBeenCalled();
    expect(terminal.owner).toBeUndefined();
    expect(getEventListeners(signal, "abort")).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    [true, "resolve"],
    [true, "reject"],
    [false, "resolve"],
  ] as const)(
    "closes on abort but awaits callback %s/%s before releasing the terminal",
    async (interactive, outcome) => {
      const controller = new AbortController();
      const cause = new Error("aborted");
      const callbackFailure = new Error("callback aborted");
      const { prompt, events, terminal, signal } = createPrompt({
        interactive,
        signal: controller.signal,
      });
      const work = deferred<string>();
      const started = vi.fn(() => work.promise);
      const result = prompt.wait(started);
      let settled = false;
      void result.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );
      await turn();
      expect(started).toHaveBeenCalledOnce();
      controller.abort(cause);
      await turn();
      expect(events.at(-1)).toMatchObject({ prompt: { status: "closed" } });
      expect(settled).toBe(false);
      expect(terminal.owner).toBe("prompt");
      expect(getEventListeners(signal, "abort")).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(events).toHaveLength(2);
      if (outcome === "resolve") {
        work.resolve("done");
        await expect(result).rejects.toMatchObject({ reason: "aborted", cause });
      } else {
        work.reject(callbackFailure);
        await expect(result).rejects.toBe(callbackFailure);
      }
      expect(events).toHaveLength(2);
      expect(terminal.owner).toBeUndefined();
      expect(terminal.acquire("exec")).toBe(true);
      terminal.release();
    },
  );

  it("serializes closing after abort during the initial render and does not start work", async () => {
    const controller = new AbortController();
    const cause = new Error("aborted");
    const blockedPrint = deferred<void>();
    const { prompt, events, terminal, signal } = createPrompt({
      signal: controller.signal,
      print: async (event) => {
        if (event.type === "prompt" && event.prompt.status === "active") {
          controller.abort(cause);
          await blockedPrint.promise;
        }
      },
    });
    const work = vi.fn();
    const result = prompt.wait(work);
    await turn();
    expect(events).toHaveLength(1);
    expect(terminal.owner).toBe("prompt");
    expect(vi.getTimerCount()).toBe(0);
    blockedPrint.resolve();
    await expect(result).rejects.toMatchObject({ reason: "aborted", cause });
    expect(work).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({ prompt: { status: "closed" } });
    expect(terminal.owner).toBeUndefined();
    expect(getEventListeners(signal, "abort")).toHaveLength(0);
  });
});
