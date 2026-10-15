import { afterEach, describe, expect, expectTypeOf, it, vi } from "vite-plus/test";
import { z } from "zod";
import {
  createMain,
  defineCommand,
  runCommand,
  runMain,
  ZittyUsageError,
  type CommandDef,
  type Logger,
  type LogRecord,
  type PrintEvent,
  type Printer,
  type ShowUsageCallback,
} from "./index.ts";

afterEach(() => vi.restoreAllMocks());

describe("command routing", () => {
  it("routes hidden commands normally", async () => {
    const hiddenRun = vi.fn(() => "hidden result");
    const root = defineCommand({
      subCommands: {
        internal: defineCommand({ hidden: true, run: hiddenRun }),
      },
    });

    await expect(runCommand(root, ["internal"])).resolves.toBe("hidden result");
    expect(hiddenRun).toHaveBeenCalledOnce();
  });

  it("validates the parent prefix, skips option values, and runs only the child", async () => {
    const parentRun = vi.fn();
    const childRun = vi.fn(({ rawArgs }: { rawArgs: string[] }) => rawArgs.join(" "));
    const child = defineCommand({
      args: z.object({ name: z.string() }),
      run: childRun,
    });
    const root = defineCommand({
      name: "git-worktree",
      args: z.object({ repo: z.string() }),
      argOptions: { repo: { alias: "R" } },
      subCommands: { new: child },
      run: parentRun,
    });

    await expect(runCommand(root, ["--repo", "x", "new", "--name", "foo"])).resolves.toBe(
      "--name foo",
    );
    await expect(runCommand(root, ["-R", "x", "new", "--name", "bar"])).resolves.toBe("--name bar");
    await expect(runCommand(root, ["-Rx", "new", "--name", "baz"])).resolves.toBe("--name baz");
    expect(parentRun).not.toHaveBeenCalled();
    expect(childRun).toHaveBeenCalledTimes(3);
  });

  it("runs the parent only when no subcommand is selected", async () => {
    const root = defineCommand({
      subCommands: { child: defineCommand({ run: () => "child" }) },
      run: () => "parent",
    });
    await expect(runCommand(root, [])).resolves.toBe("parent");
    await expect(runCommand(root, ["child"])).resolves.toBe("child");
  });

  it("rejects unknown and missing commands with usage errors", async () => {
    const root = defineCommand({ name: "root", subCommands: { child: defineCommand({}) } });
    await expect(runCommand(root, ["unknown"])).rejects.toMatchObject({
      message: "Unknown command `unknown`",
      command: root,
    });
    await expect(runCommand(root, ["child"])).rejects.toBeInstanceOf(ZittyUsageError);
  });

  it("provides the actual resolved command and inferred schema on cmd", async () => {
    const rootArgs = z.object({ rootValue: z.string().default("root") });
    const rootRun = vi.fn();
    const root = defineCommand({
      name: "root",
      args: rootArgs,
      run({ cmd, args }) {
        expectTypeOf(cmd).toEqualTypeOf<CommandDef<typeof rootArgs>>();
        expectTypeOf(args).toEqualTypeOf<{ rootValue: string }>();
        rootRun();
        return cmd;
      },
    });
    await expect(runCommand(root, [])).resolves.toBe(root);

    const unnamedLeaf = defineCommand({
      args: z.object({ count: z.coerce.number() }),
      run({ cmd, args }) {
        expectTypeOf(cmd).toEqualTypeOf<typeof unnamedLeaf>();
        expectTypeOf(args).toEqualTypeOf<{ count: number }>();
        return { cmd, args };
      },
    });
    const nested = defineCommand({
      name: "top",
      subCommands: {
        group: defineCommand({ subCommands: { leaf: unnamedLeaf } }),
      },
    });
    const result = await runCommand(nested, ["group", "leaf", "--count", "2"]);
    expect(result).toMatchObject({ cmd: { name: "leaf" }, args: { count: 2 } });
    expect(unnamedLeaf).not.toHaveProperty("name");

    const namedLeaf = defineCommand({ name: "custom", run: ({ cmd }) => cmd });
    const namedRoot = defineCommand({ subCommands: { alias: namedLeaf } });
    await expect(runCommand(namedRoot, ["alias"])).resolves.toBe(namedLeaf);
  });
});

describe("run logger", () => {
  it("emits every level and info kind as structured, interpolated records", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_797_000_000_000);
    const records: LogRecord[] = [];
    const result = { unchanged: true };
    const command = defineCommand({
      name: "tool",
      run({ logger }) {
        expectTypeOf(logger).toEqualTypeOf<Logger>();
        logger.trace("trace {value}", { value: 1 });
        logger.debug("debug", { value: 2 });
        logger.info("info", { value: 3 });
        logger.warn("warn", { value: 4 });
        logger.error("error", { value: 5 });
        logger.fatal("fatal", { value: 6 });
        logger.step("step", { value: 7 });
        logger.success("success", { value: 8 });
        return result;
      },
    });

    await expect(
      runCommand(command, [], {
        printer: {
          print(event) {
            if (event.type === "log") records.push(event.record);
          },
        },
      }),
    ).resolves.toBe(result);

    expect(records.map(({ level, kind }) => [level, kind])).toEqual([
      ["trace", "message"],
      ["debug", "message"],
      ["info", "message"],
      ["warning", "message"],
      ["error", "message"],
      ["fatal", "message"],
      ["info", "step"],
      ["info", "success"],
    ]);
    expect(records[0]).toEqual({
      level: "trace",
      kind: "message",
      category: ["tool"],
      message: "trace 1",
      rawMessage: "trace {value}",
      properties: { value: 1 },
      timestamp: 1_797_000_000_000,
    });
  });

  it("merges bound properties with call precedence and composes child categories", async () => {
    const records: LogRecord[] = [];
    const leaf = defineCommand({
      run({ logger }) {
        expect(logger.category).toEqual(["root", "group", "leaf"]);
        logger
          .with({ app: "bound", env: "prod", attempt: 1 })
          .with({ attempt: 2 })
          .getChild("upload")
          .info("Deploying {app} to {env}, attempt {attempt}: {missing}", {
            app: "explicit",
            attempt: 3,
          });
      },
    });
    const root = defineCommand({
      name: "root",
      subCommands: { group: defineCommand({ subCommands: { leaf } }) },
    });

    await runCommand(root, ["group", "leaf"], {
      printer: {
        print(event) {
          if (event.type === "log") records.push(event.record);
        },
      },
    });

    expect(records[0]).toMatchObject({
      category: ["root", "group", "leaf", "upload"],
      message: "Deploying explicit to prod, attempt 3: {missing}",
      rawMessage: "Deploying {app} to {env}, attempt {attempt}: {missing}",
      properties: { app: "explicit", env: "prod", attempt: 3 },
    });
  });

  it("keeps records and the run result when placeholder values cannot be converted", async () => {
    const records: LogRecord[] = [];
    const nullPrototypeValue = Object.create(null) as object;
    const nullPrototypeProperties = Object.assign(Object.create(null), {
      value: nullPrototypeValue,
    }) as Record<string, unknown>;
    const throwingValue = {
      toString(): string {
        throw new Error("cannot format");
      },
    };
    const result = { unchanged: true };
    const command = defineCommand({
      run({ logger }) {
        logger.info("Null prototype: {value}", nullPrototypeProperties);
        logger.info("Throwing conversion: {value}", { value: throwingValue });
        return result;
      },
    });

    await expect(
      runCommand(command, [], {
        printer: {
          print(event) {
            if (event.type === "log") records.push(event.record);
          },
        },
      }),
    ).resolves.toBe(result);

    expect(records).toHaveLength(2);
    expect(records.map(({ message }) => message)).toEqual([
      "Null prototype: {value}",
      "Throwing conversion: {value}",
    ]);
    expect(records[0]?.properties.value).toBe(nullPrototypeValue);
    expect(records[1]?.properties.value).toBe(throwingValue);
  });

  it("retains Error inputs as structured properties", async () => {
    const records: LogRecord[] = [];
    const failure = new Error("connection lost", { cause: new Error("socket closed") });
    const command = defineCommand({
      run({ logger }) {
        logger.with({ requestId: "req-1" }).error(failure, { retryable: true });
      },
    });

    await runCommand(command, [], {
      printer: {
        print(event) {
          if (event.type === "log") records.push(event.record);
        },
      },
    });

    expect(records[0]).toMatchObject({
      level: "error",
      message: "connection lost",
      rawMessage: "connection lost",
      properties: { requestId: "req-1", retryable: true, error: failure },
    });
    expect(records[0]?.properties.error).toBe(failure);
  });

  it("serializes log writes and drains them before preserving the run result", async () => {
    const sequence: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const result = { status: "complete" };
    const invocation = runCommand(
      defineCommand({
        run({ logger }) {
          logger.info("first");
          logger.info("second");
          return result;
        },
      }),
      [],
      {
        printer: {
          async print(event) {
            if (event.type !== "log") return;
            sequence.push(`start:${event.record.message}`);
            if (event.record.message === "first") {
              await new Promise<void>((resolve) => {
                releaseFirst = resolve;
              });
            }
            sequence.push(`end:${event.record.message}`);
          },
        },
      },
    );

    await vi.waitFor(() => expect(releaseFirst).toBeTypeOf("function"));
    expect(sequence).toEqual(["start:first"]);
    releaseFirst?.();
    await expect(invocation).resolves.toBe(result);
    expect(sequence).toEqual(["start:first", "end:first", "start:second", "end:second"]);
  });

  it("rejects after run when an asynchronous log write fails", async () => {
    const failure = new Error("log failed");
    const command = defineCommand({
      run({ logger }) {
        logger.info("queued");
        return "run result";
      },
    });

    await expect(
      runCommand(command, [], {
        printer: {
          print: async (event) =>
            event.type === "log" ? Promise.reject(failure) : Promise.resolve(),
        },
      }),
    ).rejects.toBe(failure);
  });
});

describe("help and version", () => {
  it("routes help and version through the invocation printer as structured events", async () => {
    const events: PrintEvent[] = [];
    const printer: Printer = { print: (event) => void events.push(event) };
    const command = defineCommand({ name: "tool", version: "1.2.3" });

    await runCommand(command, ["--help"], { printer });
    await runCommand(command, ["--version"], { printer });

    expect(events).toMatchObject([
      { type: "usage", command, stream: "stdout" },
      { type: "version", version: "1.2.3" },
    ]);
    expect(events[0]).toMatchObject({ text: expect.stringContaining("USAGE tool") });
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
    const showUsage: ShowUsageCallback = (command, { write }) => {
      void write(`first:${command.name}`);
      void write(`second:${command.name}`);
    };

    let completed = false;
    const invocation = runCommand(defineCommand({ name: "tool" }), ["--help"], {
      printer,
      showUsage,
    }).then(() => {
      completed = true;
    });
    await vi.waitFor(() => expect(releaseFirst).toBeTypeOf("function"));
    expect(calls).toEqual(["start:usage"]);
    expect(completed).toBe(false);

    releaseFirst?.();
    await invocation;
    expect(calls).toEqual(["start:usage", "end:usage", "start:usage", "end:usage"]);
  });

  it("preserves legacy callback order when the printer writes synchronously", async () => {
    const output: string[] = [];
    const showUsage: ShowUsageCallback = (_command, { write }) => {
      output.push("HEADER");
      void write("USAGE");
      output.push("FOOTER");
    };

    await runCommand(defineCommand({ name: "tool" }), ["--help"], {
      printer: { print: (event) => void output.push(event.type.toUpperCase()) },
      showUsage,
    });

    expect(output).toEqual(["HEADER", "USAGE", "FOOTER"]);
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

    await runCommand(root, ["--help"]);
    const parentHelp = String(log.mock.calls.at(-1)?.[0]);
    expect(parentHelp).toContain("public  Public command");
    expect(parentHelp).not.toContain("internal");

    await runCommand(root, ["internal", "--help"]);
    const hiddenHelp = String(log.mock.calls.at(-1)?.[0]);
    expect(hiddenHelp).toContain("Internal command (internal)");
    expect(hiddenHelp).toContain("USAGE internal [OPTIONS]");
    expect(hiddenHelp).toContain("--token=<token>  Internal token (Required)");
  });

  it("scopes boolean syntax issues across children and builtin bypasses", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const child = defineCommand({
      args: z.object({ childFlag: z.boolean().catch(false) }),
      run: ({ extraArgs }) => extraArgs,
    });
    const root = defineCommand({
      name: "root",
      version: "1.0.0",
      args: z.object({ enabled: z.boolean().catch(true) }),
      subCommands: { child },
    });

    await expect(runCommand(root, ["--enabled=no", "child"])).rejects.toMatchObject({
      issues: [{ arg: "--enabled", message: "expects true or false" }],
    });
    await expect(runCommand(root, ["child", "--child-flag=no"])).rejects.toMatchObject({
      issues: [{ arg: "--child-flag", message: "expects true or false" }],
    });
    await expect(runCommand(root, ["child", "--enabled=no"])).resolves.toEqual(["--enabled=no"]);
    await expect(runCommand(root, ["--enabled=no", "child", "--help"])).resolves.toBeUndefined();
    await expect(runCommand(root, ["--enabled=no", "--version"])).resolves.toBeUndefined();
    expect(log.mock.calls.at(-1)?.[0]).toBe("1.0.0");
  });

  it("renders the deepest command help and bypasses required validation", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const leaf = defineCommand({
      description: "Create a worktree\nwith a selected branch",
      args: z.object({
        _: z.tuple([z.string().describe("Target path").meta({ title: "PATH" })]),
        force: z.boolean().default(false).describe("Overwrite target"),
      }),
      run: vi.fn(),
    });
    const root = defineCommand({ name: "git-worktree", subCommands: { new: leaf } });

    await runCommand(root, ["new", "--help"]);
    const help = String(log.mock.calls[0]?.[0]);
    expect(help).toContain("Create a worktree\nwith a selected branch (new)");
    expect(help).toContain("USAGE new [OPTIONS] <PATH>");
    expect(help).toContain("PATH  Target path (Required)");
    expect(help).toContain("--force  Overwrite target (Default: false)");
  });

  it("shows root metadata, options, and child listings", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const root = defineCommand({
      name: "tool",
      version: "1.2.3",
      description: "A useful tool",
      args: z.object({ repo: z.string().optional().describe("Repository") }),
      argOptions: { repo: { alias: "R" } },
      subCommands: { child: defineCommand({ description: "Do work", run: () => undefined }) },
    });
    await runCommand(root, ["--help"]);
    const help = String(log.mock.calls[0]?.[0]);
    expect(help).toContain("A useful tool (tool v1.2.3)");
    expect(help).toContain("-R, --repo=<repo>  Repository");
    expect(help).toContain("COMMANDS");
    expect(help).toContain("child  Do work");
  });

  it("keeps long builtins and lets aliases override short builtins", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const run = vi.fn(({ args }) => args);
    const root = defineCommand({
      name: "tool",
      version: "1.2.3",
      args: z.object({ verbose: z.boolean().default(false), host: z.boolean().default(false) }),
      argOptions: { verbose: { alias: "v" }, host: { alias: "h" } },
      run,
    });
    await runCommand(root, ["-v", "-h"]);
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ args: { verbose: true, host: true } }),
    );
    await runCommand(root, ["--version"]);
    expect(log).toHaveBeenCalledWith("1.2.3");
    await runCommand(root, ["--help"]);
    expect(log.mock.calls.at(-1)?.[0]).toContain("USAGE tool");
  });

  it("treats version as a root-only builtin", async () => {
    const childRun = vi.fn(({ extraArgs }) => extraArgs);
    const root = defineCommand({
      version: "1.0.0",
      subCommands: { child: defineCommand({ run: childRun }) },
    });
    await expect(runCommand(root, ["child", "--version"])).resolves.toEqual(["--version"]);
  });

  it("ignores root and child builtin spellings after the passthrough separator", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const rootRun = vi.fn(({ passthrough }) => passthrough);
    const root = defineCommand({ name: "root", version: "1.0.0", run: rootRun });
    await expect(runCommand(root, ["--", "--help", "-v"])).resolves.toEqual(["--help", "-v"]);
    expect(rootRun).toHaveBeenCalledOnce();
    expect(log).not.toHaveBeenCalled();

    const childRun = vi.fn(({ passthrough }) => passthrough);
    const withChild = defineCommand({
      name: "root",
      version: "1.0.0",
      subCommands: { child: defineCommand({ run: childRun }) },
    });
    await expect(runCommand(withChild, ["child", "--", "--help", "-v"])).resolves.toEqual([
      "--help",
      "-v",
    ]);
    expect(childRun).toHaveBeenCalledOnce();
    expect(log).not.toHaveBeenCalled();
  });
});

describe("runMain", () => {
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
      { type: "error", message: "No command specified" },
      { type: "usage", stream: "stderr", command: { name: "tool" } },
    ]);
    expect(sequence).toEqual(["start:error", "end:error", "start:usage", "end:usage", "exit:1"]);
  });

  it("routes unexpected errors through the selected printer", async () => {
    const events: PrintEvent[] = [];
    vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("stopped");
    }) as never);
    const failure = new Error("boom");
    const command = defineCommand({
      run() {
        throw failure;
      },
    });

    await expect(
      runMain(command, {
        argv: [],
        printer: { print: (event) => void events.push(event) },
      }),
    ).rejects.toThrow("stopped");
    expect(events).toEqual([{ type: "error", error: failure, message: "Error: boom" }]);
  });

  it("propagates a printer rejection on a successful main invocation", async () => {
    const exit = vi.spyOn(process, "exit");
    const failure = new Error("printer failed");

    await expect(
      runMain(defineCommand({ name: "tool" }), {
        argv: ["--help"],
        printer: { print: async () => Promise.reject(failure) },
      }),
    ).rejects.toBe(failure);
    expect(exit).not.toHaveBeenCalled();
  });

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

    await expect(runMain(command, { argv: ["unknown"] })).rejects.toThrow("exit:1");
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
      run: ({ args }) => seen.push(args.value),
    });
    vi.spyOn(process, "argv", "get").mockReturnValue(["node", "cli", "--value", "process"]);

    await runMain(command, { argv: ["--value", "explicit"] });
    await runMain(command, { argv: [] });
    await runMain(command);
    expect(seen).toEqual(["explicit", "empty", "process"]);
  });

  it("creates a reusable main whose invocation argv takes precedence", async () => {
    const seen: string[] = [];
    const command = defineCommand({
      args: z.object({ value: z.string().default("empty") }),
      run: ({ args }) => seen.push(args.value),
    });
    const main = createMain(command, { argv: ["--value", "configured"] });
    expectTypeOf(main).toEqualTypeOf<(argv?: string[]) => Promise<void>>();

    await main();
    await main(["--value", "invocation"]);
    await main([]);
    expect(seen).toEqual(["configured", "invocation", "empty"]);
  });

  it("uses one async usage hook with stdout and stderr writers", async () => {
    vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("stopped");
    }) as never);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const calls: string[] = [];
    const display: ShowUsageCallback = async (command, { write }) => {
      await Promise.resolve();
      calls.push(command.name ?? "command");
      await write(`custom:${command.name ?? "command"}`);
    };
    const command = defineCommand({ name: "tool", args: z.object({ value: z.string() }) });

    await runMain(command, { argv: ["--help"], showUsage: display });
    expect(log).toHaveBeenCalledWith("custom:tool");
    expect(error).not.toHaveBeenCalled();

    await expect(runMain(command, { argv: [], showUsage: display })).rejects.toThrow("stopped");
    expect(error).toHaveBeenCalledWith(expect.stringContaining("Invalid arguments:"));
    expect(error).toHaveBeenCalledWith("custom:tool");
    expect(calls).toEqual(["tool", "tool"]);
  });

  it("exits one when an async usage hook rejects while reporting an error", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const showUsage: ShowUsageCallback = async () => {
      await Promise.resolve();
      throw new Error("usage rendering failed");
    };

    await expect(
      runMain(defineCommand({ name: "empty" }), { argv: [], showUsage }),
    ).rejects.toThrow("exit:1");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("preserves an onError rejection without forcing another exit", async () => {
    const exit = vi.spyOn(process, "exit");
    const onError = vi.fn(async () => {
      throw new Error("reporting failed");
    });
    const command = defineCommand({
      run() {
        throw new Error("command failed");
      },
    });

    await expect(runMain(command, { argv: [], onError })).rejects.toThrow("reporting failed");
    expect(exit).not.toHaveBeenCalled();
  });

  it("exits one after onError succeeds even when pending printer output rejects", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    const failure = new Error("usage failed");
    const onError = vi.fn();
    const showUsage: ShowUsageCallback = (_command, { write }) => {
      void write("usage");
      throw failure;
    };

    await expect(
      runMain(defineCommand({ name: "tool" }), {
        argv: ["--help"],
        printer: { print: async () => Promise.reject(new Error("printer failed")) },
        showUsage,
        onError,
      }),
    ).rejects.toThrow("exit:1");
    expect(onError).toHaveBeenCalledWith(failure);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("uses process argv, replaces reporting with async onError, and exits one", async () => {
    vi.spyOn(process, "argv", "get").mockReturnValue(["node", "cli", "--bad"]);
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    const onError = vi.fn(async () => Promise.resolve());
    const showUsage = vi.fn();
    const command = defineCommand({
      run: () => {
        throw new Error("boom");
      },
    });
    await expect(runMain(command, { onError, showUsage })).rejects.toThrow("exit:1");
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "boom" }));
    expect(exit).toHaveBeenCalledWith(1);
    expect(showUsage).not.toHaveBeenCalled();
  });

  it("prints usage errors and ordinary errors differently", async () => {
    vi.spyOn(process, "argv", "get").mockReturnValue(["node", "cli"]);
    vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("stopped");
    }) as never);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(runMain(defineCommand({ name: "empty" }))).rejects.toThrow("stopped");
    expect(error).toHaveBeenCalledWith("No command specified");
    expect(error).toHaveBeenCalledWith(expect.stringContaining("USAGE empty"));
    error.mockClear();

    await expect(
      runMain(
        defineCommand({
          run: () => {
            throw new Error("boom");
          },
        }),
      ),
    ).rejects.toThrow("stopped");
    expect(error).toHaveBeenCalledWith("Error: boom");
  });
});
