import { afterEach, describe, expect, expectTypeOf, it, vi } from "vite-plus/test";
import { z } from "zod";
import {
  defineCommand,
  parseArgs,
  runCommand,
  runMain,
  HackshError,
  HackshExitError,
  HackshUsageError,
  HackshValidationError,
  type CommandDef,
} from "./index.ts";
import type { PrintEvent, Printer } from "./printer-api.ts";

const initialExitCode = process.exitCode;
afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = initialExitCode;
});

describe("command routing", () => {
  it("routes hidden commands normally", async () => {
    const hiddenRun = vi.fn(() => 7);
    const root = defineCommand({
      subCommands: {
        internal: defineCommand({ hidden: true, run: hiddenRun }),
      },
    });

    await expect(runCommand(root, ["internal"])).resolves.toBe(7);
    expect(hiddenRun).toHaveBeenCalledOnce();
  });

  it("validates the parent prefix, skips option values, and runs only the child", async () => {
    const parentRun = vi.fn();
    const childRun = vi.fn();
    const child = defineCommand({
      args: z.object({ name: z.string() }),
      run: childRun,
    });
    const root = defineCommand({
      name: "git-worktree",
      args: z.object({ repo: z.string().meta({ alias: "R" }) }),
      subCommands: { new: child },
      run: parentRun,
    });

    for (const argv of [
      ["--repo", "x", "new", "--name", "foo"],
      ["-R", "x", "new", "--name", "bar"],
      ["-Rx", "new", "--name", "baz"],
    ]) {
      await expect(runCommand(root, argv)).resolves.toBe(0);
    }
    for (const [index, name] of ["foo", "bar", "baz"].entries()) {
      expect(childRun).toHaveBeenNthCalledWith(
        index + 1,
        expect.objectContaining({
          args: { name },
          input: expect.objectContaining({ argv: ["--name", name] }),
        }),
      );
    }
    expect(parentRun).not.toHaveBeenCalled();
    expect(childRun).toHaveBeenCalledTimes(3);
  });

  it("runs the parent only when no subcommand is selected", async () => {
    const parentRun = vi.fn();
    const childRun = vi.fn();
    const root = defineCommand({
      subCommands: { child: defineCommand({ run: childRun }) },
      run: parentRun,
    });
    await expect(runCommand(root, [])).resolves.toBe(0);
    expect(parentRun).toHaveBeenCalledOnce();
    expect(childRun).not.toHaveBeenCalled();
    await expect(runCommand(root, ["child"])).resolves.toBe(0);
    expect(parentRun).toHaveBeenCalledOnce();
    expect(childRun).toHaveBeenCalledOnce();
  });

  it("rejects unknown and missing commands with usage errors", async () => {
    const root = defineCommand({ name: "root", subCommands: { child: defineCommand({}) } });
    await expect(runCommand(root, ["unknown"])).rejects.toMatchObject({
      message: "Unknown command `unknown`",
      command: root,
    });
    await expect(runCommand(root, ["child"])).rejects.toBeInstanceOf(HackshUsageError);
  });

  it("provides the actual resolved command and inferred schema on command", async () => {
    const rootArgs = z.object({ rootValue: z.string().default("root") });
    const rootRun = vi.fn();
    const root = defineCommand({
      name: "root",
      args: rootArgs,
      run({ command, args }) {
        expectTypeOf(command).toEqualTypeOf<CommandDef<typeof rootArgs>>();
        expectTypeOf(args).toEqualTypeOf<{ rootValue: string }>();
        rootRun(command, args);
      },
    });
    await expect(runCommand(root, [])).resolves.toBe(0);
    expect(rootRun).toHaveBeenCalledExactlyOnceWith(root, { rootValue: "root" });

    const leafArgs = z.object({ count: z.coerce.number() });
    const leafRun = vi.fn();
    const unnamedLeaf = defineCommand({
      args: leafArgs,
      run({ command, args }) {
        expectTypeOf(command).toEqualTypeOf<CommandDef<typeof leafArgs>>();
        expectTypeOf(args).toEqualTypeOf<{ count: number }>();
        leafRun(command, args);
      },
    });
    const nested = defineCommand({
      name: "top",
      subCommands: {
        group: defineCommand({ subCommands: { leaf: unnamedLeaf } }),
      },
    });
    await expect(runCommand(nested, ["group", "leaf", "--count", "2"])).resolves.toBe(0);
    expect(leafRun).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ name: "leaf" }), {
      count: 2,
    });
    expect(unnamedLeaf).not.toHaveProperty("name");

    const namedRun = vi.fn();
    const namedLeaf = defineCommand({
      name: "custom",
      run: ({ command }) => {
        namedRun(command);
      },
    });
    const namedRoot = defineCommand({ subCommands: { alias: namedLeaf } });
    await expect(runCommand(namedRoot, ["alias"])).resolves.toBe(0);
    expect(namedRun).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ name: "custom" }));
    expect(namedRun.mock.calls[0]?.[0]).not.toBe(namedLeaf);
    expect(namedLeaf).toMatchObject({ name: "custom" });
  });

  it("rejects thrown errors rather than converting them into returned failures", async () => {
    const failure = new Error("thrown failure");
    const printer = { print: vi.fn() };
    for (const command of [
      defineCommand({
        run() {
          throw failure;
        },
      }),
      defineCommand({
        async run() {
          throw failure;
        },
      }),
    ]) {
      await expect(runCommand(command, [], { printer })).rejects.toBe(failure);
    }
    expect(printer.print).not.toHaveBeenCalled();
  });
});

describe("returned exit status", () => {
  it.each([0, 1, 42, 255])("returns status %i from sync and async handlers", async (code) => {
    const printer = { print: vi.fn() };
    for (const command of [
      defineCommand({ run: () => code }),
      defineCommand({ run: async () => code }),
    ]) {
      const result = runCommand(command, [], { printer });
      expectTypeOf(result).toEqualTypeOf<Promise<number>>();
      await expect(result).resolves.toBe(code);
    }
    expect(printer.print).not.toHaveBeenCalled();
  });

  it("normalizes synchronous and asynchronous undefined results to zero", async () => {
    for (const command of [defineCommand({ run() {} }), defineCommand({ async run() {} })]) {
      const result = runCommand(command, []);
      expectTypeOf(result).toEqualTypeOf<Promise<number>>();
      await expect(result).resolves.toBe(0);
    }
  });

  it("returns the asynchronous routed leaf status instead of running its ancestors", async () => {
    const parentRun = vi.fn(() => 3);
    const leafRun = vi.fn(async () => 29);
    const command = defineCommand({
      run: parentRun,
      subCommands: {
        group: defineCommand({
          run: parentRun,
          subCommands: { leaf: defineCommand({ run: leafRun }) },
        }),
      },
    });
    await expect(runCommand(command, ["group", "leaf"])).resolves.toBe(29);
    expect(leafRun).toHaveBeenCalledOnce();
    expect(parentRun).not.toHaveBeenCalled();
  });

  it.each([
    { label: "negative integer", value: -1 },
    { label: "above maximum", value: 256 },
    { label: "fraction", value: 1.5 },
    { label: "NaN", value: Number.NaN },
    { label: "positive infinity", value: Number.POSITIVE_INFINITY },
    { label: "negative infinity", value: Number.NEGATIVE_INFINITY },
    { label: "null", value: null },
    { label: "string", value: "0" },
    { label: "boolean", value: false },
    { label: "object", value: { ok: false, error: new Error("not an exit status") } },
    { label: "array", value: [] },
    { label: "bigint", value: 0n },
    { label: "symbol", value: Symbol("status") },
    { label: "function", value: () => 0 },
  ])("rejects $label returns from sync and async JavaScript handlers", async ({ value }) => {
    const printer = { print: vi.fn() };
    // JavaScript consumers can return values excluded by the TypeScript contract.
    for (const command of [
      defineCommand({ run: () => value as never }),
      defineCommand({ run: async () => value as never }),
    ]) {
      await expect(runCommand(command, [], { printer })).rejects.toBeInstanceOf(TypeError);
    }
    expect(printer.print).not.toHaveBeenCalled();
  });

  it.each([new HackshError("expected failure"), "failure", null, undefined])(
    "propagates thrown and rejected values unchanged: %s",
    async (failure) => {
      for (const command of [
        defineCommand({
          run() {
            throw failure;
          },
        }),
        defineCommand({
          async run() {
            throw failure;
          },
        }),
      ]) {
        await expect(runCommand(command, [])).rejects.toBe(failure);
      }
    },
  );
});

describe("help and version", () => {
  it("routes help and version through the invocation printer as structured events", async () => {
    const events: PrintEvent[] = [];
    const printer: Printer = { print: (event) => void events.push(event) };
    const command = defineCommand({ name: "tool", version: "1.2.3" });

    await expect(runCommand(command, ["--help"], { printer })).resolves.toBe(0);
    await expect(runCommand(command, ["--version"], { printer })).resolves.toBe(0);

    expect(events).toMatchObject([
      { type: "usage", usage: { name: "tool", version: "1.2.3" }, stream: "stdout" },
      { type: "version", version: "1.2.3" },
    ]);
    expect(events[0]).toMatchObject({ text: expect.stringContaining("USAGE tool") });
    expect(events[0]).not.toHaveProperty("command");
  });

  it("serializes async printer events and waits for them before completing", async () => {
    const calls: string[] = [];
    let releaseFirst: (() => void) | undefined;
    let blockNext = true;
    const printer: Printer = {
      async print(event) {
        calls.push(`start:${event.type}`);
        if (blockNext) {
          blockNext = false;
          await new Promise<void>((resolve) => {
            releaseFirst = resolve;
          });
        }
        calls.push(`end:${event.type}`);
      },
    };
    const command = defineCommand({
      name: "tool",
      run({ logger }) {
        logger.info("first");
        logger.info("second");
        return 23;
      },
    });

    let completed = false;
    const invocation = runCommand(command, [], { printer }).then((code) => {
      completed = true;
      return code;
    });
    await vi.waitFor(() => expect(releaseFirst).toBeTypeOf("function"));
    expect(calls).toEqual(["start:log"]);
    expect(completed).toBe(false);

    releaseFirst?.();
    await expect(invocation).resolves.toBe(23);
    expect(calls).toEqual(["start:log", "end:log", "start:log", "end:log"]);
  });

  it("rejects the invocation when an async printer rejects", async () => {
    const failure = new Error("printer failed");
    const printer: Printer = { print: async () => Promise.reject(failure) };

    await expect(runCommand(defineCommand({ name: "tool" }), ["--help"], { printer })).rejects.toBe(
      failure,
    );
  });

  it("shows help for a hidden command without exposing it in parent help", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const root = defineCommand({
      name: "tool",
      subCommands: {
        public: defineCommand({ description: "Public command" }),
        internal: defineCommand({
          hidden: true,
          description: "Internal command",
          args: z.object({ token: z.string().describe("Internal token") }),
        }),
      },
    });

    await runCommand(root, ["--help"], { output: "pretty" });
    const parentHelp = String(log.mock.calls.at(-1)?.[0]);
    expect(parentHelp).toContain("public  Public command");
    expect(parentHelp).not.toContain("internal");

    await runCommand(root, ["internal", "--help"], { output: "pretty" });
    const hiddenHelp = String(log.mock.calls.at(-1)?.[0]);
    expect(hiddenHelp).toContain("Internal command (internal)");
    expect(hiddenHelp).toContain("USAGE internal [OPTIONS]");
    expect(hiddenHelp).toContain("--token=<token>  Internal token (Required)");
  });

  it("scopes boolean syntax issues across children and builtin bypasses", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const childRun = vi.fn();
    const child = defineCommand({
      args: z.object({ childFlag: z.boolean().catch(false) }),
      allowUnknownArgs: true,
      run: childRun,
    });
    const root = defineCommand({
      name: "root",
      version: "1.0.0",
      args: z.object({ enabled: z.boolean().catch(true) }),
      subCommands: { child },
    });

    await expect(
      runCommand(root, ["--enabled=no", "child"], { output: "pretty" }),
    ).rejects.toMatchObject({
      issues: [{ arg: "--enabled", message: "expects true or false" }],
    });
    await expect(
      runCommand(root, ["child", "--child-flag=no"], { output: "pretty" }),
    ).rejects.toMatchObject({
      issues: [{ arg: "--child-flag", message: "expects true or false" }],
    });
    await expect(runCommand(root, ["child", "--enabled=no"])).resolves.toBe(0);
    expect(childRun).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ input: expect.objectContaining({ unknown: ["--enabled=no"] }) }),
    );
    await expect(
      runCommand(root, ["--enabled=no", "child", "--help"], { output: "pretty" }),
    ).resolves.toBe(0);
    await expect(
      runCommand(root, ["--enabled=no", "--version"], { output: "pretty" }),
    ).resolves.toBe(0);
    expect(log.mock.calls.at(-1)?.[0]).toBe("●  1.0.0");
  });

  it("renders the deepest command help and bypasses required validation", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const leaf = defineCommand({
      description: "Create a worktree\nwith a selected branch",
      args: z.object({
        positionals: z.tuple([z.string().describe("Target path").meta({ title: "PATH" })]),
        force: z.boolean().default(false).describe("Overwrite target"),
      }),
      run: vi.fn(),
    });
    const root = defineCommand({ name: "git-worktree", subCommands: { new: leaf } });

    await runCommand(root, ["new", "--help"], { output: "pretty" });
    const help = String(log.mock.calls[0]?.[0]);
    expect(help).toContain("◆  Create a worktree\n│  with a selected branch (new)");
    expect(help).toContain("USAGE new [OPTIONS] <PATH>");
    expect(help).toContain("PATH  Target path (Required)");
    expect(help).toContain("--[no-]force  Overwrite target (Default: false)");
  });

  it("shows root metadata, options, and child listings", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const root = defineCommand({
      name: "tool",
      version: "1.2.3",
      description: "A useful tool",
      args: z.object({
        repo: z.string().optional().meta({ description: "Repository", alias: "R" }),
      }),
      subCommands: {
        child: defineCommand({
          description: "Do work",
          run() {},
        }),
      },
    });
    await runCommand(root, ["--help"], { output: "pretty" });
    const help = String(log.mock.calls[0]?.[0]);
    expect(help).toContain("A useful tool (tool v1.2.3)");
    expect(help).toContain("-R, --repo=<repo>  Repository");
    expect(help).toContain("COMMANDS");
    expect(help).toContain("child  Do work");
  });

  it("keeps long builtins and lets aliases override short builtins", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const run = vi.fn();
    const root = defineCommand({
      name: "tool",
      version: "1.2.3",
      args: z.object({
        verbose: z.boolean().default(false).meta({ alias: "v" }),
        host: z.boolean().default(false).meta({ alias: "h" }),
      }),
      run,
    });
    await runCommand(root, ["-v", "-h"]);
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ args: { verbose: true, host: true } }),
    );
    await runCommand(root, ["--version"], { output: "pretty" });
    expect(log).toHaveBeenCalledWith("●  1.2.3");
    await runCommand(root, ["--help"], { output: "pretty" });
    expect(log.mock.calls.at(-1)?.[0]).toContain("USAGE tool");
  });

  it("treats version as a root-only builtin", async () => {
    const childRun = vi.fn();
    const root = defineCommand({
      version: "1.0.0",
      subCommands: { child: defineCommand({ allowUnknownArgs: true, run: childRun }) },
    });
    await expect(runCommand(root, ["child", "--version"])).resolves.toBe(0);
    expect(childRun).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ input: expect.objectContaining({ unknown: ["--version"] }) }),
    );
  });

  it("ignores root and child builtin spellings after the passthrough separator", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const rootRun = vi.fn();
    const root = defineCommand({ name: "root", version: "1.0.0", run: rootRun });
    await expect(runCommand(root, ["--", "--help", "-v"])).resolves.toBe(0);
    expect(rootRun).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        input: expect.objectContaining({ passthrough: ["--help", "-v"] }),
      }),
    );
    expect(log).not.toHaveBeenCalled();

    const childRun = vi.fn();
    const withChild = defineCommand({
      name: "root",
      version: "1.0.0",
      subCommands: { child: defineCommand({ allowUnknownArgs: true, run: childRun }) },
    });
    await expect(runCommand(withChild, ["child", "--", "--help", "-v"])).resolves.toBe(0);
    expect(childRun).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        input: expect.objectContaining({ passthrough: ["--help", "-v"] }),
      }),
    );
    expect(log).not.toHaveBeenCalled();
  });
});

describe("runMain", () => {
  it.each([undefined, 0])("sets exitCode to zero without forcing exit for %s", async (code) => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const printer = { print: vi.fn() };
    const onError = vi.fn();
    for (const command of [
      defineCommand({ run: () => code }),
      defineCommand({ run: async () => code }),
    ]) {
      process.exitCode = 19;
      await expect(runMain(command, { argv: [], printer, onError })).resolves.toBeUndefined();
      expect(process.exitCode).toBe(0);
    }
    expect(exit).not.toHaveBeenCalled();
    expect(printer.print).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it.each(["--help", "--version"])(
    "sets exitCode to zero after %s without forcing exit",
    async (arg) => {
      const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
      const run = vi.fn(() => 12);
      const printer = { print: vi.fn() };
      process.exitCode = 19;
      await runMain(defineCommand({ name: "tool", version: "1.0.0", run }), {
        argv: [arg],
        printer,
      });
      expect(process.exitCode).toBe(0);
      expect(exit).not.toHaveBeenCalled();
      expect(run).not.toHaveBeenCalled();
      expect(printer.print).toHaveBeenCalledOnce();
    },
  );

  it.each([0, 31])("drains output before applying returned status %i", async (code) => {
    const sequence: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started!: () => void;
    const printing = new Promise<void>((resolve) => {
      started = resolve;
    });
    const printer: Printer = {
      async print() {
        started();
        await gate;
        sequence.push("drained");
      },
    };
    const stopped = new Error("process exited");
    const exit = vi.spyOn(process, "exit").mockImplementation(((status?: number) => {
      sequence.push(`exit:${status}`);
      throw stopped;
    }) as never);
    const onError = vi.fn();
    const command = defineCommand({
      subCommands: {
        child: defineCommand({
          async run({ logger }) {
            logger.info("pending output");
            return code;
          },
        }),
      },
    });
    process.exitCode = 19;
    const main = runMain(command, { argv: ["child"], printer, onError });
    const completion =
      code === 0 ? expect(main).resolves.toBeUndefined() : expect(main).rejects.toBe(stopped);
    await printing;
    expect(exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(19);
    release();
    await completion;
    if (code === 0) {
      expect(process.exitCode).toBe(0);
      expect(exit).not.toHaveBeenCalled();
      expect(sequence).toEqual(["drained"]);
    } else {
      expect(exit).toHaveBeenCalledExactlyOnceWith(code);
      expect(sequence).toEqual(["drained", `exit:${code}`]);
    }
    expect(onError).not.toHaveBeenCalled();
  });

  it("propagates a printer failure instead of applying a returned nonzero status", async () => {
    const failure = new Error("printer failed");
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const onError = vi.fn();
    const command = defineCommand({
      run({ logger }) {
        logger.info("pending output");
        return 23;
      },
    });
    await expect(
      runMain(command, {
        argv: [],
        printer: {
          async print() {
            throw failure;
          },
        },
        onError,
      }),
    ).rejects.toBe(failure);
    expect(exit).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("propagates invalid handler returns without treating them as application errors", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const printer = { print: vi.fn() };
    const onError = vi.fn();
    const baseline = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];
    for (const run of [() => 256, async () => null as never]) {
      await expect(
        runMain(defineCommand({ run }), {
          argv: [],
          printer,
          onError,
        }),
      ).rejects.toBeInstanceOf(TypeError);
    }
    expect(exit).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(printer.print).not.toHaveBeenCalled();
    expect([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")]).toEqual(baseline);
  });

  it("reports an application error and drains queued output before the default exit", async () => {
    const sequence: string[] = [];
    class AppError extends HackshError {}
    const failure = new AppError("application failed");
    const events: PrintEvent[] = [];
    const printer: Printer = {
      async print(event) {
        sequence.push(`start:${event.type}`);
        await Promise.resolve();
        events.push(event);
        sequence.push(`end:${event.type}`);
      },
    };
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      sequence.push(`exit:${code}`);
      throw new Error(`exit:${code}`);
    }) as never);
    const command = defineCommand({
      run({ logger }) {
        logger.info("before failure");
        throw failure;
      },
    });
    await expect(runMain(command, { argv: [], printer })).rejects.toThrow("exit:1");
    expect(events).toMatchObject([
      { type: "log" },
      { type: "error", error: { name: "AppError", message: "application failed" } },
    ]);
    expect(sequence).toEqual(["start:log", "end:log", "start:error", "end:error", "exit:1"]);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("drains pending output after onError handles an expected failure", async () => {
    const sequence: string[] = [];
    class AppError extends HackshError {}
    const failure = new AppError("not ready");
    let release!: () => void;
    let markPrinted!: () => void;
    let markReported!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const printed = new Promise<void>((resolve) => (markPrinted = resolve));
    const reported = new Promise<void>((resolve) => (markReported = resolve));
    const printer: Printer = {
      async print() {
        markPrinted();
        await gate;
        sequence.push("drained");
      },
    };
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      sequence.push(`exit:${code}`);
      throw new Error(`exit:${code}`);
    }) as never);
    const onError = vi.fn(async (error: HackshError) => {
      expect(error).toBe(failure);
      sequence.push("reported");
      markReported();
    });
    const command = defineCommand({
      run({ logger }) {
        logger.info("pending output");
        throw failure;
      },
    });
    const main = runMain(command, { argv: [], printer, onError });
    const rejection = expect(main).rejects.toThrow("exit:1");
    await printed;
    await reported;
    expect(exit).not.toHaveBeenCalled();
    release();
    await rejection;
    expect(sequence).toEqual(["reported", "drained", "exit:1"]);
    expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
  });

  it("drains pending output and removes listeners when onError rejects without exiting", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const failure = new HackshError("command failed");
    const reportingFailure = new HackshError("reporting failed");
    let release!: () => void;
    let started!: () => void;
    let reported!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const printing = new Promise<void>((resolve) => (started = resolve));
    const reporting = new Promise<void>((resolve) => (reported = resolve));
    const events: PrintEvent[] = [];
    const printer: Printer = {
      async print(event) {
        started();
        await gate;
        events.push(event);
      },
    };
    const onError = vi.fn(async () => {
      reported();
      throw reportingFailure;
    });
    const baseline = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];
    const command = defineCommand({
      run({ logger }) {
        logger.info("pending output");
        throw failure;
      },
    });
    let settled = false;
    const rejection = expect(runMain(command, { argv: [], onError, printer }))
      .rejects.toBe(reportingFailure)
      .then(() => {
        settled = true;
      });
    await printing;
    await reporting;
    expect(settled).toBe(false);
    release();
    await rejection;
    expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
    expect(exit).not.toHaveBeenCalled();
    expect(events).toMatchObject([{ type: "log" }]);
    expect([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")]).toEqual(baseline);
  });

  it("routes usage errors through one printer and drains it before exit", async () => {
    const sequence: string[] = [];
    const events: PrintEvent[] = [];
    const printer: Printer = {
      async print(event) {
        sequence.push(`start:${event.type}`);
        await Promise.resolve();
        events.push(event);
        sequence.push(`end:${event.type}`);
      },
    };
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      sequence.push(`exit:${code}`);
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(runMain(defineCommand({ name: "tool" }), { argv: [], printer })).rejects.toThrow(
      "exit:1",
    );
    expect(events).toMatchObject([
      { type: "error", error: { name: "HackshUsageError", message: "No command specified" } },
      { type: "usage", stream: "stderr", usage: { name: "tool" } },
    ]);
    expect(sequence).toEqual(["start:error", "end:error", "start:usage", "end:usage", "exit:1"]);
  });

  it.each([
    new Error("unexpected failure"),
    new TypeError("programming bug"),
    "primitive failure",
    42,
    null,
    undefined,
    Object.assign(new Error("not an expected error"), { name: "HackshError" }),
  ])("rejects unexpected thrown values unchanged: %s", async (failure) => {
    const print = vi.fn();
    const onError = vi.fn();
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const baseline = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];
    for (const command of [
      defineCommand({
        run() {
          throw failure;
        },
      }),
      defineCommand({
        async run() {
          throw failure;
        },
      }),
    ]) {
      await expect(runMain(command, { argv: [], printer: { print }, onError })).rejects.toBe(
        failure,
      );
      expect([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")]).toEqual(baseline);
    }
    expect(print).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it("drains pending output before rejecting an unexpected failure and removes listeners", async () => {
    const failure = new Error("unexpected failure");
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const printing = new Promise<void>((resolve) => (started = resolve));
    const events: PrintEvent[] = [];
    const printer: Printer = {
      async print(event) {
        started();
        await gate;
        events.push(event);
      },
    };
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const onError = vi.fn();
    const baseline = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];
    const command = defineCommand({
      run({ logger }) {
        logger.info("pending output");
        throw failure;
      },
    });
    let settled = false;
    const main = runMain(command, { argv: [], printer, onError });
    const rejection = expect(main)
      .rejects.toBe(failure)
      .then(() => {
        settled = true;
      });
    await printing;
    expect(settled).toBe(false);
    release();
    await rejection;
    expect(events).toMatchObject([{ type: "log" }]);
    expect(onError).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
    expect([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")]).toEqual(baseline);
  });

  it("rejects invalid output configuration without running, reporting, or falling back to JSON", async () => {
    const run = vi.fn();
    const onError = vi.fn();
    const print = vi.fn();
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const baseline = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];
    await expect(
      runMain(defineCommand({ run }), {
        argv: [],
        output: "invalid" as never,
        printer: { print },
        onError,
      }),
    ).rejects.toBeInstanceOf(TypeError);
    expect(run).not.toHaveBeenCalled();
    expect(print).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
    expect([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")]).toEqual(baseline);
  });

  it("summarizes Error causes and custom properties without retaining the thrown object", async () => {
    const events: PrintEvent[] = [];
    vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("stopped");
    }) as never);
    const cause = new Error("root cause");
    const failure = Object.assign(new HackshError("boom", { cause }), {
      code: "E_BOOM",
      retryable: false,
    });

    await expect(
      runMain(
        defineCommand({
          run() {
            throw failure;
          },
        }),
        { argv: [], printer: { print: (event) => void events.push(event) } },
      ),
    ).rejects.toThrow("stopped");

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "error",
      error: {
        kind: "error",
        name: "HackshError",
        message: "boom",
        cause: { kind: "error", name: "Error", message: "root cause" },
        properties: { code: "E_BOOM", retryable: false },
      },
    });
    expect(events[0]).not.toHaveProperty("message");
    expect(events[0]).not.toHaveProperty("error.command");
    expect(events[0]).not.toHaveProperty("error", failure);
  });

  it("summarizes an actual validation error used as a cause without schema leakage", async () => {
    const invalid = defineCommand({
      name: "invalid",
      args: z.object({ count: z.number() }),
      run: vi.fn(),
    });
    const validation = await parseArgs(invalid, ["--count", "nope"]).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(validation).toBeInstanceOf(HackshValidationError);
    const failure = new HackshError("wrapped", { cause: validation });
    (validation as HackshValidationError & { related: Error }).related = failure;
    const events: PrintEvent[] = [];
    vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("stopped");
    }) as never);

    await expect(
      runMain(
        defineCommand({
          run() {
            throw failure;
          },
        }),
        { argv: [], printer: { print: (event) => void events.push(event) } },
      ),
    ).rejects.toThrow("stopped");

    const event = events[0];
    if (event?.type !== "error") throw new Error("Expected an error event");
    expect(event.error).toMatchObject({
      kind: "error",
      cause: {
        kind: "validation",
        issues: [{ arg: "--count", code: "invalid_type" }],
      },
    });
    const cause = event.error.cause as {
      properties: { related: { cause: unknown } };
    };
    expect(cause).not.toHaveProperty("command");
    expect(cause.properties.related).toBe(event.error);
    expect(cause).not.toHaveProperty("issues.0.details.inst");
  });

  it.each([new Error("printer failed"), new HackshError("printer failed")])(
    "propagates printer rejection on a successful main invocation: %s",
    async (failure) => {
      const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
      const onError = vi.fn();
      const print = vi.fn(async () => {
        throw failure;
      });
      const baseline = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];

      await expect(
        runMain(defineCommand({ name: "tool" }), {
          argv: ["--help"],
          printer: { print },
          onError,
        }),
      ).rejects.toBe(failure);
      expect(exit).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(print).toHaveBeenCalledOnce();
      expect([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")]).toEqual(baseline);
    },
  );

  it("omits hidden commands from usage reported for an unknown command", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const command = defineCommand({
      name: "tool",
      subCommands: {
        public: defineCommand({ description: "Public command" }),
        internal: defineCommand({ description: "Internal command", hidden: true }),
      },
    });

    await expect(runMain(command, { argv: ["unknown"], output: "pretty" })).rejects.toThrow(
      "exit:1",
    );
    expect(exit).toHaveBeenCalledWith(1);
    const output = error.mock.calls.map(([value]) => String(value)).join("\n");
    expect(output).toContain("Unknown command `unknown`");
    expect(output).toContain("public  Public command");
    expect(output).not.toContain("internal");
  });

  it("uses explicit, empty, and omitted argv with the documented precedence", async () => {
    const seen: string[] = [];
    const command = defineCommand({
      args: z.object({ value: z.string().default("empty") }),
      run({ args }) {
        seen.push(args.value);
      },
    });
    vi.spyOn(process, "argv", "get").mockReturnValue(["node", "cli", "--value", "process"]);

    await runMain(command, { argv: ["--value", "explicit"] });
    await runMain(command, { argv: [] });
    await runMain(command);
    expect(seen).toEqual(["explicit", "empty", "process"]);
  });

  it("propagates pending printer rejection after onError succeeds without exiting", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const failure = new HackshError("command failed");
    const printerFailure = new Error("printer failed");
    const onError = vi.fn();
    const command = defineCommand({
      name: "tool",
      run({ logger }) {
        logger.info("pending output");
        throw failure;
      },
    });

    await expect(
      runMain(command, {
        argv: [],
        printer: { print: async () => Promise.reject(printerFailure) },
        onError,
      }),
    ).rejects.toBe(printerFailure);
    expect(onError).toHaveBeenCalledWith(failure);
    expect(exit).not.toHaveBeenCalled();
  });

  it("propagates rejection from the default error reporter without forcing an exit", async () => {
    const failure = new HackshError("command failed");
    const printerFailure = new HackshError("reporter failed");
    const print = vi.fn(async () => {
      throw printerFailure;
    });
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const baseline = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];
    await expect(
      runMain(
        defineCommand({
          run() {
            throw failure;
          },
        }),
        {
          argv: [],
          printer: { print },
        },
      ),
    ).rejects.toBe(printerFailure);
    expect(print).toHaveBeenCalledOnce();
    expect(exit).not.toHaveBeenCalled();
    expect([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")]).toEqual(baseline);
  });

  it("uses process argv, replaces reporting with async onError, and exits one", async () => {
    vi.spyOn(process, "argv", "get").mockReturnValue(["node", "cli", "--bad"]);
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    const onError = vi.fn(async () => Promise.resolve());
    const printer = { print: vi.fn() };
    const command = defineCommand({
      allowUnknownArgs: true,
      run: () => {
        throw new HackshError("boom");
      },
    });
    await expect(runMain(command, { onError, printer })).rejects.toThrow("exit:1");
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "boom" }));
    expect(exit).toHaveBeenCalledWith(1);
    expect(printer.print).not.toHaveBeenCalled();
  });

  it("prints usage errors and other expected errors differently", async () => {
    vi.spyOn(process, "argv", "get").mockReturnValue(["node", "cli"]);
    vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("stopped");
    }) as never);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(runMain(defineCommand({ name: "empty" }), { output: "pretty" })).rejects.toThrow(
      "stopped",
    );
    expect(error).toHaveBeenCalledWith("■  No command specified");
    expect(error).toHaveBeenCalledWith(expect.stringContaining("USAGE empty"));
    error.mockClear();

    await expect(
      runMain(
        defineCommand({
          run: () => {
            throw new HackshError("boom");
          },
        }),
        { output: "pretty" },
      ),
    ).rejects.toThrow("stopped");
    expect(error).toHaveBeenCalledWith("■  boom");
  });

  it("uses the same pretty error mark regardless of error class name", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("stopped");
    }) as never);

    class RenamedUsageError extends HackshUsageError {
      override name = "RenamedUsageError";
    }
    const usageCommand = defineCommand({ name: "tool" });
    await expect(
      runMain(
        defineCommand({
          run() {
            throw new RenamedUsageError("usage failed", usageCommand);
          },
        }),
        { argv: [], output: "pretty", env: {} },
      ),
    ).rejects.toThrow("stopped");
    expect(error).toHaveBeenCalledWith("■  usage failed");
    expect(error).not.toHaveBeenCalledWith("■  Error: usage failed");

    error.mockClear();
    class AppError extends HackshError {}
    const failure = new AppError("application failed");
    await expect(
      runMain(
        defineCommand({
          run() {
            throw failure;
          },
        }),
        { argv: [], output: "pretty", env: {} },
      ),
    ).rejects.toThrow("stopped");
    expect(error).toHaveBeenCalledWith("■  application failed");
  });
});

describe("HackshExitError", () => {
  it("propagates unchanged from runCommand", async () => {
    const failure = new HackshExitError(3, "lint failed");
    await expect(
      runCommand(
        defineCommand({
          run() {
            throw failure;
          },
        }),
        [],
      ),
    ).rejects.toBe(failure);
    expect(failure).toMatchObject({ name: "HackshExitError", exitCode: 3 });
  });

  it("accepts only integer exit codes from 0 to 255", () => {
    expect(new HackshExitError(0).exitCode).toBe(0);
    expect(new HackshExitError(255).exitCode).toBe(255);
    for (const code of [-1, 256, 1.5, Number.NaN]) {
      expect(() => new HackshExitError(code)).toThrow(TypeError);
    }
  });

  it("preserves an explicit forced exit for HackshExitError zero", async () => {
    const stopped = new Error("process exited");
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw stopped;
    }) as never);
    const printer = { print: vi.fn() };
    const command = defineCommand({
      run() {
        throw new HackshExitError(0);
      },
    });
    await expect(runMain(command, { argv: [], printer })).rejects.toBe(stopped);
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
    expect(printer.print).not.toHaveBeenCalled();
  });

  it("sets the runMain exit code and reports only a non-empty message", async () => {
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    const events: PrintEvent[] = [];
    const printer: Printer = { print: (event) => void events.push(event) };
    const exitWith = (error: HackshExitError) =>
      defineCommand({
        run() {
          throw error;
        },
      });

    await expect(runMain(exitWith(new HackshExitError(3)), { argv: [], printer })).rejects.toThrow(
      "exit:3",
    );
    expect(events).toEqual([]);

    await expect(
      runMain(exitWith(new HackshExitError(4, "lint failed")), { argv: [], printer }),
    ).rejects.toThrow("exit:4");
    expect(events).toMatchObject([
      { type: "error", error: { name: "HackshExitError", message: "lint failed" } },
    ]);

    const failure = new HackshExitError(5);
    const onError = vi.fn();
    await expect(runMain(exitWith(failure), { argv: [], onError })).rejects.toThrow("exit:5");
    expect(onError).toHaveBeenCalledWith(failure);
  });
});

describe("invocation signal", () => {
  it("gives each invocation an unaborted signal that follows only its own external signal", async () => {
    const controller = new AbortController();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const seen: AbortSignal[] = [];
    const command = defineCommand({
      async run({ signal }) {
        expect(signal.aborted).toBe(false);
        seen.push(signal);
        await gate;
        expect(signal.aborted).toBe(signal === seen[0]);
      },
    });

    const linked = runCommand(command, [], { signal: controller.signal });
    const separate = runCommand(command, []);
    await vi.waitFor(() => expect(seen).toHaveLength(2));
    controller.abort();
    release();

    await expect(linked).resolves.toBe(0);
    await expect(separate).resolves.toBe(0);
  });

  it("rejects with the reason of an already aborted signal without running", async () => {
    const reason = new Error("stopped before start");
    const run = vi.fn();

    await expect(
      runCommand(defineCommand({ run }), [], { signal: AbortSignal.abort(reason) }),
    ).rejects.toBe(reason);
    expect(run).not.toHaveBeenCalled();
  });
});

describe("runMain signals", () => {
  const signalListeners = () => [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];

  function throwingExit() {
    return vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
  }

  function waitForAbort() {
    let started!: () => void;
    const running = new Promise<void>((resolve) => (started = resolve));
    const reasons: unknown[] = [];
    const command = defineCommand({
      run({ signal }) {
        return new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => {
            reasons.push(signal.reason);
            resolve();
          });
          started();
        });
      },
    });
    return { command, running, reasons };
  }

  it.each([
    ["SIGINT", 130],
    ["SIGTERM", 143],
  ] as const)("aborts run on %s and exits %i after it settles", async (name, code) => {
    throwingExit();
    const baseline = signalListeners();
    const { command, running, reasons } = waitForAbort();

    const main = runMain(command, { argv: [], printer: { print: () => undefined } });
    await running;
    process.emit(name);

    await expect(main).rejects.toThrow(`exit:${code}`);
    expect(reasons).toEqual([
      expect.objectContaining({ name: "AbortError", message: `Received ${name}` }),
    ]);
    expect(signalListeners()).toEqual(baseline);
  });

  it("forces exit on a second signal while run ignores the abort", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const baseline = signalListeners();
    let finish!: () => void;
    let started!: () => void;
    const running = new Promise<void>((resolve) => (started = resolve));
    const command = defineCommand({
      async run() {
        started();
        await new Promise<void>((resolve) => (finish = resolve));
      },
    });

    const main = runMain(command, { argv: [], printer: { print: () => undefined } });
    await running;
    process.emit("SIGINT");
    expect(exit).not.toHaveBeenCalled();
    process.emit("SIGINT");
    expect(exit).toHaveBeenCalledExactlyOnceWith(130);

    finish();
    await main;
    expect(signalListeners()).toEqual(baseline);
  });

  it.each([
    ["SIGINT", 130],
    ["SIGTERM", 143],
  ] as const)("handles rejection with its own %s reason without reporting", async (name, code) => {
    const exit = throwingExit();
    const baseline = signalListeners();
    let started!: () => void;
    const running = new Promise<void>((resolve) => (started = resolve));
    const print = vi.fn();
    const onError = vi.fn();
    const command = defineCommand({
      run({ signal }) {
        return new Promise<never>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason));
          started();
        });
      },
    });

    const main = runMain(command, {
      argv: [],
      printer: { print },
      onError,
    });
    await running;
    process.emit(name);

    await expect(main).rejects.toThrow(`exit:${code}`);
    expect(exit).toHaveBeenCalledExactlyOnceWith(code);
    expect(print).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(signalListeners()).toEqual(baseline);
  });

  it.each([
    new Error("unrelated failure"),
    new DOMException("unrelated cancellation", "AbortError"),
    "unrelated primitive",
  ])("propagates an unrelated rejection during abort: %s", async (failure) => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const baseline = signalListeners();
    let started!: () => void;
    const running = new Promise<void>((resolve) => (started = resolve));
    const print = vi.fn();
    const onError = vi.fn();
    const command = defineCommand({
      run({ signal }) {
        return new Promise<never>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(failure));
          started();
        });
      },
    });
    const main = runMain(command, { argv: [], printer: { print }, onError });
    const rejection = expect(main).rejects.toBe(failure);
    await running;
    process.emit("SIGINT");
    await rejection;
    expect(print).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
    expect(signalListeners()).toEqual(baseline);
  });

  it("propagates a drain failure instead of exiting after signal cancellation", async () => {
    const failure = new Error("printer failed");
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const baseline = signalListeners();
    let started!: () => void;
    const running = new Promise<void>((resolve) => (started = resolve));
    const onError = vi.fn();
    const print = vi.fn(async () => {
      throw failure;
    });
    const command = defineCommand({
      run({ signal, logger }) {
        logger.info("pending output");
        return new Promise<never>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason));
          started();
        });
      },
    });
    const main = runMain(command, { argv: [], printer: { print }, onError });
    const rejection = expect(main).rejects.toBe(failure);
    await running;
    process.emit("SIGTERM");
    await rejection;
    expect(print).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
    expect(signalListeners()).toEqual(baseline);
  });

  it("removes its listeners after success, failure, and a rejected onError", async () => {
    throwingExit();
    const baseline = signalListeners();
    const failing = defineCommand({
      run() {
        throw new HackshError("boom");
      },
    });

    await runMain(defineCommand({ run() {} }), { argv: [] });
    expect(signalListeners()).toEqual(baseline);
    await expect(
      runMain(failing, { argv: [], printer: { print: () => undefined } }),
    ).rejects.toThrow("exit:1");
    expect(signalListeners()).toEqual(baseline);
    await expect(
      runMain(failing, {
        argv: [],
        onError: () => Promise.reject(new Error("reporting failed")),
      }),
    ).rejects.toThrow("reporting failed");
    expect(signalListeners()).toEqual(baseline);
  });

  it("keeps a running invocation subscribed after another one finishes", async () => {
    throwingExit();
    const baseline = signalListeners();
    const { command, running, reasons } = waitForAbort();

    const main = runMain(command, { argv: [], printer: { print: () => undefined } });
    await running;
    await runMain(defineCommand({ run() {} }), { argv: [] });
    process.emit("SIGINT");

    await expect(main).rejects.toThrow("exit:130");
    expect(reasons).toHaveLength(1);
    expect(signalListeners()).toEqual(baseline);
  });
});
