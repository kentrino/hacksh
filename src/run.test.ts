import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";
import { defineCommand, runCommand, runMain, ZittyUsageError } from "./index.ts";

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
    expect(parentRun).not.toHaveBeenCalled();
    expect(childRun).toHaveBeenCalledTimes(2);
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
});

describe("runMain", () => {
  it("uses process argv, replaces reporting with async onError, and exits one", async () => {
    vi.spyOn(process, "argv", "get").mockReturnValue(["node", "cli", "--bad"]);
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    const onError = vi.fn(async () => Promise.resolve());
    const command = defineCommand({
      run: () => {
        throw new Error("boom");
      },
    });
    await expect(runMain(command, { onError })).rejects.toThrow("exit:1");
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "boom" }));
    expect(exit).toHaveBeenCalledWith(1);
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
