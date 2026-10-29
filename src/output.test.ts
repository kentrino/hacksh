import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";
import { defineCommand, runCommand, runMain } from "./index.ts";
import type { PrintEvent } from "./printer-api.ts";
import { selectOutputPrinter } from "./output.ts";

afterEach(() => vi.restoreAllMocks());

describe("invocation output selection", () => {
  it("does not reserve output-format command arguments", async () => {
    const run = vi.fn(({ args }) => {
      expect(args).toEqual({ output: "file", json: true, logFormat: "compact" });
    });
    const command = defineCommand({
      args: z.object({
        output: z.string(),
        json: z.boolean().default(false),
        logFormat: z.string(),
      }),
      run,
    });

    await expect(
      runCommand(command, ["--output", "file", "--json", "--log-format", "compact"], {
        output: "pretty",
      }),
    ).resolves.toBe(0);
    expect(run).toHaveBeenCalledOnce();
  });

  it("writes every output call as its own event", async () => {
    const events: PrintEvent[] = [];
    const command = defineCommand({
      run({ output }) {
        output.print("");
        output.println();
        output.json(null);
        output.json(null);
      },
    });

    await expect(
      runCommand(command, [], { printer: { print: (event) => void events.push(event) } }),
    ).resolves.toBe(0);
    expect(events).toEqual([
      { type: "output", kind: "text", text: "" },
      { type: "output", kind: "text", text: "\n" },
      { type: "output", kind: "json", data: null },
      { type: "output", kind: "json", data: null },
    ]);
  });

  it("rejects the invocation when writing output fails, after run completes", async () => {
    const broken = Object.assign(new Error("write EPIPE"), { code: "EPIPE" });
    const after = vi.fn();
    const command = defineCommand({
      run({ output }) {
        output.println("first");
        after();
        return;
      },
    });

    await expect(
      runCommand(command, [], {
        output: "json",
        env: {},
        stdout: {
          write: () => {
            throw broken;
          },
        },
      }),
    ).rejects.toBe(broken);
    expect(after).toHaveBeenCalledOnce();
  });

  it("rejects invalid output settings before routing or execution", async () => {
    const run = vi.fn(() => undefined);
    const command = defineCommand({ run });

    await expect(runCommand(command, [], { output: "yaml" as "json", env: {} })).rejects.toThrow(
      "Invalid output value yaml",
    );
    await expect(runCommand(command, [], { env: { HACKSH_OUTPUT: "xml" } })).rejects.toThrow(
      "Invalid HACKSH_OUTPUT value xml",
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("runs identical command code with pretty and JSON output", async () => {
    const results: string[] = [];
    const run = vi.fn(({ logger }) => {
      logger.info("same {mode}", { mode: "code" });
      results.push("ran");
    });
    const command = defineCommand({ run });
    const events: PrintEvent[] = [];
    await expect(
      runCommand(command, [], {
        output: "pretty",
        printer: { print: (event) => void events.push(event) },
      }),
    ).resolves.toBe(0);

    const lines: string[] = [];
    await expect(
      runCommand(command, [], {
        output: "json",
        env: {},
        stdout: { isTTY: false, write: () => undefined },
        stderr: { write: (value) => void lines.push(value) },
      }),
    ).resolves.toBe(0);

    expect(run).toHaveBeenCalledTimes(2);
    expect(results).toEqual(["ran", "ran"]);
    expect(events[0]).toMatchObject({ type: "log", record: { message: "same code" } });
    expect(JSON.parse(lines[0]!)).toMatchObject({
      type: "log",
      record: { message: "same code" },
    });
  });

  it("applies resolved color and Unicode configuration only to pretty output", async () => {
    const command = defineCommand({
      run({ logger }) {
        logger.success("done");
        return;
      },
    });
    const colored: string[] = [];
    const ascii: string[] = [];
    const json: string[] = [];

    const stdout = { isTTY: true, write: () => undefined };
    await runCommand(command, [], {
      output: "pretty",
      env: {},
      stdout,
      stderr: { isTTY: true, write: (text) => void colored.push(text) },
    });
    await runCommand(command, [], {
      output: "pretty",
      unicode: false,
      env: { NO_COLOR: "1" },
      stdout,
      stderr: { isTTY: true, write: (text) => void ascii.push(text) },
    });
    await runCommand(command, [], {
      output: "json",
      unicode: false,
      env: {},
      stdout,
      stderr: { isTTY: true, write: (text) => void json.push(text) },
    });

    expect(colored[0]).toContain("\u001b[");
    expect(colored[0]).toContain("✔");
    expect(ascii).toEqual(["+  done\n"]);
    expect(JSON.parse(json[0]!)).toMatchObject({
      type: "log",
      record: { kind: "success", message: "done" },
    });
    expect(json[0]).not.toContain("\u001b[");
  });

  it.each([
    { output: "YAML" as "json", env: {}, message: "Invalid output value YAML" },
    { env: { HACKSH_OUTPUT: "JSON" }, message: "Invalid HACKSH_OUTPUT value JSON" },
  ])(
    "rejects invalid output without fallback reporting: $message",
    async ({ message, ...options }) => {
      const stdout: string[] = [];
      const stderr: string[] = [];
      const run = vi.fn();
      const onError = vi.fn();
      const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
        throw new Error(`exit:${code}`);
      }) as never);

      await expect(
        runMain(defineCommand({ run }), {
          argv: [],
          ...options,
          onError,
          stdout: { isTTY: true, write: (value) => void stdout.push(value) },
          stderr: { write: (value) => void stderr.push(value) },
        }),
      ).rejects.toMatchObject({ name: "TypeError", message: expect.stringContaining(message) });

      expect(run).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(exit).not.toHaveBeenCalled();
      expect(stdout).toEqual([]);
      expect(stderr).toEqual([]);
    },
  );

  it.each([
    { output: "yaml" as "json", env: {}, message: "Invalid output value yaml" },
    { env: { HACKSH_OUTPUT: "JSON" }, message: "Invalid HACKSH_OUTPUT value JSON" },
  ])(
    "does not hand invalid configuration to a printer or onError: $message",
    async ({ message, ...options }) => {
      const run = vi.fn();
      const print = vi.fn();
      const onError = vi.fn(async () => {
        throw new Error("must not report");
      });
      const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
        throw new Error(`exit:${code}`);
      }) as never);

      await expect(
        runMain(defineCommand({ run }), {
          argv: [],
          ...options,
          printer: { print },
          onError,
        }),
      ).rejects.toMatchObject({ name: "TypeError", message: expect.stringContaining(message) });

      expect(run).not.toHaveBeenCalled();
      expect(print).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(exit).not.toHaveBeenCalled();
    },
  );

  it("uses the resolved JSON mode for routing and validation errors before run", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    const run = vi.fn(() => undefined);
    const command = defineCommand({
      name: "tool",
      args: z.object({ count: z.coerce.number() }),
      run,
    });

    await expect(
      runMain(command, {
        argv: ["--count", "invalid"],
        output: "pretty",
        env: { HACKSH_OUTPUT: "json" },
        stdin: {
          isTTY: true,
          on: () => undefined,
          removeListener: () => undefined,
          resume: () => undefined,
          pause: () => undefined,
        },
        stdout: {
          isTTY: false,
          write: (value) => void stdout.push(value),
        },
        stderr: {
          write: (value) => void stderr.push(value),
        },
      }),
    ).rejects.toThrow("exit:1");

    expect(run).not.toHaveBeenCalled();
    expect(stdout).toEqual([]);
    expect(stderr).toHaveLength(2);
    expect(stderr.map((line) => JSON.parse(line).type)).toEqual(["error", "usage"]);
    expect(JSON.parse(stderr[0]!)).toMatchObject({
      error: {
        name: "HackshValidationError",
        issues: [{ arg: "--count", code: "invalid_type" }],
      },
    });
  });

  it("resolves output mode only once per invocation", async () => {
    const reads = new Map<PropertyKey, number>();
    const env = new Proxy<Record<string, string | undefined>>(
      {},
      {
        get(_target, key) {
          reads.set(key, (reads.get(key) ?? 0) + 1);
          return;
        },
      },
    );

    await runCommand(defineCommand({ run: () => undefined }), [], {
      env,
      stdin: {
        isTTY: true,
        on: () => undefined,
        removeListener: () => undefined,
        resume: () => undefined,
        pause: () => undefined,
      },
      stdout: { isTTY: true, write: () => undefined },
      printer: { print: () => undefined },
    });

    expect(reads).toEqual(
      new Map<PropertyKey, number>([
        ["HACKSH_OUTPUT", 1],
        ["CI", 1],
        ["NO_COLOR", 1],
      ]),
    );
  });

  it("writes prompt erasure without a newline through the default writer", () => {
    const bytes: string[] = [];
    vi.spyOn(console, "log").mockImplementation((value) => {
      bytes.push(`${String(value)}\n`);
    });
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
      bytes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
    const printer = selectOutputPrinter({ output: "pretty", env: { NO_COLOR: "1" } });

    void printer.print({
      type: "prompt",
      prompt: { kind: "text", message: "Cancelled", status: "active", value: "partial" },
    });
    void printer.print({
      type: "prompt",
      prompt: { kind: "text", message: "Cancelled", status: "closed", value: "partial" },
    });

    expect(bytes.join("")).toBe(`?  Cancelled\n│  partial\n${"\u001b[1A\u001b[2K".repeat(2)}`);
  });

  it("does not insert blank rows while interleaving default-writer logs", () => {
    const bytes: string[] = [];
    vi.spyOn(console, "log").mockImplementation((value) => {
      bytes.push(`${String(value)}\n`);
    });
    vi.spyOn(console, "error").mockImplementation((value) => {
      bytes.push(`${String(value)}\n`);
    });
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
      bytes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
    const printer = selectOutputPrinter({ output: "pretty", env: { NO_COLOR: "1" } });
    const active: PrintEvent = {
      type: "prompt",
      prompt: { kind: "confirm", message: "Continue?", status: "active", value: false },
    };

    void printer.print(active);
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
      prompt: { kind: "confirm", message: "Continue?", status: "closed", value: false },
    });

    const erase = "\u001b[1A\u001b[2K".repeat(2);
    const renderedPrompt = "?  Continue?\n│  No\n";
    expect(bytes.join("")).toBe(
      `${renderedPrompt}${erase}●  background update\n${renderedPrompt}${erase}`,
    );
  });
});
