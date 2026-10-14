import { afterEach, describe, expect, expectTypeOf, it, vi } from "vite-plus/test";
import { z } from "zod";
import {
  createMain,
  defineCommand,
  runCommand,
  runMain,
  ZittyUsageError,
  type CommandDef,
  type ShowUsageCallback,
} from "./index.ts";

afterEach(() => vi.restoreAllMocks());

describe("command routing", () => {
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
      alias: { repo: "R" },
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

describe("help and version", () => {
  it("renders the deepest command help and bypasses required validation", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const leaf = defineCommand({
      description: "Create a worktree\nwith a selected branch",
      args: z.object({
        path: z.string().describe("Target path"),
        force: z.boolean().default(false).describe("Overwrite target"),
      }),
      positional: ["path"],
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
      alias: { repo: "R" },
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
      alias: { verbose: "v", host: "h" },
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
