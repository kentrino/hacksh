import { describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";
import * as mini from "zod/mini";
import { defineCommand, runCommand } from "./index.ts";

describe("consumer-equivalent commands", () => {
  it("supports sanitize-branch default-on negatable flags", async () => {
    const command = defineCommand({
      args: z.object({
        execute: z.boolean().default(false),
        removeEmpty: z.boolean().default(true),
        removeCoauthor: z.boolean().default(true),
      }),
      run: ({ args }) => args,
    });
    await expect(runCommand(command, ["--execute", "--no-remove-empty"])).resolves.toEqual({
      execute: true,
      removeEmpty: false,
      removeCoauthor: true,
    });
  });

  it("supports cdx extras, passthrough, and a default-on focus flag", async () => {
    const command = defineCommand({
      args: z.object({ path: z.string().optional(), focus: z.boolean().default(true) }),
      run: ({ args, extraArgs, passthrough }) => ({ args, extraArgs, passthrough }),
    });
    await expect(
      runCommand(command, ["--path", ".", "--no-focus", "--model=o3", "--", "--sandbox"]),
    ).resolves.toEqual({
      args: { path: ".", focus: false },
      extraArgs: ["--model=o3"],
      passthrough: ["--sandbox"],
    });
  });

  it("supports git-worktree parent options before a subcommand", async () => {
    const parentRun = vi.fn();
    const command = defineCommand({
      args: z.object({ repo: z.string() }),
      subCommands: {
        new: defineCommand({
          args: z.object({ name: z.string() }),
          run: ({ args, rawArgs }) => ({ args, rawArgs }),
        }),
      },
      run: parentRun,
    });
    await expect(runCommand(command, ["--repo", "x", "new", "--name", "feature"])).resolves.toEqual(
      {
        args: { name: "feature" },
        rawArgs: ["--name", "feature"],
      },
    );
    expect(parentRun).not.toHaveBeenCalled();
  });

  it("supports gh-pr-commits coercion, optional positional, and repo alias", async () => {
    const command = defineCommand({
      args: z.object({ pr: z.coerce.number().int().optional(), repo: z.string().optional() }),
      positional: ["pr"],
      alias: { repo: "R" },
      run: ({ args }) => args,
    });
    await expect(runCommand(command, ["42", "-R", "owner/repo"])).resolves.toEqual({
      pr: 42,
      repo: "owner/repo",
    });
  });

  it("supports multiple named positional arguments and overflow", async () => {
    const command = defineCommand({
      args: z.object({ src: z.string(), dest: z.string().optional() }),
      positional: ["src", "dest"],
      run: ({ args, extraArgs }) => ({ args, extraArgs }),
    });
    await expect(runCommand(command, ["a", "b", "c"])).resolves.toEqual({
      args: { src: "a", dest: "b" },
      extraArgs: ["c"],
    });
  });

  it("accepts zod/mini object schemas at the public API", async () => {
    const command = defineCommand({
      args: mini.object({ value: mini._default(mini.string(), "mini") }),
      run: ({ args }) => args.value,
    });
    await expect(runCommand(command, [])).resolves.toBe("mini");
  });

  it.each([
    ["zod", z.object({ prefix: z.string(), values: z.array(z.string()) })],
    ["zod/mini", mini.object({ prefix: mini.string(), values: mini.array(mini.string()) })],
  ])("runs fixed and variadic arguments with %s", async (_name, args) => {
    const command = defineCommand({
      args,
      positional: ["prefix"],
      variadic: "values",
      run: ({ args: parsed, extraArgs, passthrough }) => ({ parsed, extraArgs, passthrough }),
    });
    await expect(
      runCommand(command, ["fixed", "one", "two", "--extra", "--", "tail"]),
    ).resolves.toEqual({
      parsed: { prefix: "fixed", values: ["one", "two"] },
      extraArgs: ["--extra"],
      passthrough: ["tail"],
    });
  });
});
