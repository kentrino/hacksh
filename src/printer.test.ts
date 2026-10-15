import { describe, expect, it, vi } from "vite-plus/test";
import { createJsonPrinter, resolveOutputMode, type PrintEvent } from "./index.ts";

describe("output mode", () => {
  it.each([
    ["auto outside CI on terminals", {}, "auto", true, true, ["pretty", true, true]],
    ["auto in CI", { CI: "1" }, "auto", true, true, ["json", false, false]],
    ["auto through a pipe", {}, "auto", true, false, ["pretty", false, false]],
    ["explicit JSON", {}, "json", true, true, ["json", false, false]],
    ["explicit pretty in CI", { CI: "1" }, "pretty", true, true, ["pretty", false, true]],
    ["NO_COLOR presence", { NO_COLOR: "" }, "pretty", true, true, ["pretty", true, false]],
    ["input is not a TTY", {}, "pretty", false, true, ["pretty", false, true]],
  ] as const)("resolves %s", (_name, env, output, inputIsTTY, outputIsTTY, expected) => {
    expect(resolveOutputMode({ env, output, inputIsTTY, outputIsTTY })).toEqual({
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
      }),
    ).toEqual({ format: "json", interactive: false, color: false });
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
      resolveOutputMode({ env, output: "pretty", inputIsTTY: true, outputIsTTY: true }),
    ).toEqual({ format: "pretty", interactive: true, color: true });
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
      { type: "error", error: { name: "Error", message: "failed" } },
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
    ];

    for (const event of events) void printer.print(event);

    expect(stdout).toHaveLength(3);
    expect(stderr).toHaveLength(3);
    for (const line of [...stdout, ...stderr]) {
      expect(line.endsWith("\n")).toBe(true);
      expect(line.trim().split("\n")).toHaveLength(1);
      expect(line).not.toContain("\u001b");
      expect(() => JSON.parse(line)).not.toThrow();
    }
    expect(JSON.parse(stdout[0]!)).toMatchObject({ type: "usage", text: "USAGE tool" });
    expect(JSON.parse(stderr[0]!)).toMatchObject({
      type: "log",
      record: { level: "warning", properties: {} },
    });
  });

  it("normalizes cycles, BigInt, Error causes, unsupported values, and hostile properties", () => {
    const lines: string[] = [];
    const printer = createJsonPrinter({
      stdout: { write: (value) => void lines.push(value) },
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

  it("keeps a parseable event line when an exotic value resists inspection", () => {
    const lines: string[] = [];
    const printer = createJsonPrinter({ stdout: { write: (value) => void lines.push(value) } });
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
