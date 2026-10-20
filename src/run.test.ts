import { afterEach, describe, expect, expectTypeOf, it, vi } from "vite-plus/test";
import { z } from "zod";
import {
  createMain,
  defineCommand,
  parseArgs,
  runCommand,
  runMain,
  HackshUsageError,
  HackshValidationError,
  type CommandDef,
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
    await expect(runCommand(root, ["child"])).rejects.toBeInstanceOf(HackshUsageError);
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
    const resolved = await runCommand(namedRoot, ["alias"]);
    expect(resolved).toMatchObject({ name: "custom" });
    expect(resolved).not.toBe(namedLeaf);
    expect(namedLeaf).toMatchObject({ name: "custom" });
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
    await expect(runCommand(root, ["child", "--enabled=no"])).resolves.toEqual(["--enabled=no"]);
    await expect(
      runCommand(root, ["--enabled=no", "child", "--help"], { output: "pretty" }),
    ).resolves.toBeUndefined();
    await expect(
      runCommand(root, ["--enabled=no", "--version"], { output: "pretty" }),
    ).resolves.toBeUndefined();
    expect(log.mock.calls.at(-1)?.[0]).toBe("●  1.0.0");
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
      args: z.object({ repo: z.string().optional().describe("Repository") }),
      argOptions: { repo: { alias: "R" } },
      subCommands: { child: defineCommand({ description: "Do work", run: () => undefined }) },
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
    await runCommand(root, ["--version"], { output: "pretty" });
    expect(log).toHaveBeenCalledWith("●  1.2.3");
    await runCommand(root, ["--help"], { output: "pretty" });
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

  it("rejects a root version option but accepts one on a subcommand", async () => {
    const versioned = { args: z.object({ version: z.string().optional() }) };
    const run = vi.fn();
    await expect(
      runCommand(defineCommand({ ...versioned, run }), ["--version", "2.0"]),
    ).rejects.toThrow(TypeError);
    expect(run).not.toHaveBeenCalled();

    const root = defineCommand({
      subCommands: { child: defineCommand({ ...versioned, run: ({ args }) => args }) },
    });
    await expect(runCommand(root, ["child", "--version", "2.0"])).resolves.toEqual({
      version: "2.0",
    });
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
      { type: "error", error: { name: "HackshUsageError", message: "No command specified" } },
      { type: "usage", stream: "stderr", usage: { name: "tool" } },
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
    expect(events).toEqual([
      {
        type: "error",
        error: expect.objectContaining({ name: "Error", message: "boom" }),
      },
    ]);
  });

  it("summarizes Error causes and custom properties without retaining the thrown object", async () => {
    const events: PrintEvent[] = [];
    vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("stopped");
    }) as never);
    const cause = new Error("root cause");
    const failure = Object.assign(new Error("boom", { cause }), {
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
        name: "Error",
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
    const failure = new Error("wrapped", { cause: validation });
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

    await runMain(command, { argv: ["--help"], showUsage: display, output: "pretty" });
    expect(log).toHaveBeenCalledWith("◆  custom:tool");
    expect(error).not.toHaveBeenCalled();

    await expect(
      runMain(command, { argv: [], showUsage: display, output: "pretty" }),
    ).rejects.toThrow("stopped");
    expect(error).toHaveBeenCalledWith(expect.stringContaining("Invalid arguments:"));
    expect(error).toHaveBeenCalledWith("◆  custom:tool");
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
      runMain(defineCommand({ name: "empty" }), { argv: [], showUsage, output: "pretty" }),
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
            throw new Error("boom");
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
    const pretender = new Error("ordinary failed");
    pretender.name = "HackshPretender";
    await expect(
      runMain(
        defineCommand({
          run() {
            throw pretender;
          },
        }),
        { argv: [], output: "pretty", env: {} },
      ),
    ).rejects.toThrow("stopped");
    expect(error).toHaveBeenCalledWith("■  ordinary failed");
  });
});
