import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";
import * as mini from "zod/mini";
import { defineCommand, HackshError, runCommand, runMain } from "./index.ts";
import type { PrintEvent } from "./printer-api.ts";

class IntegrationInput extends PassThrough {
  readonly isTTY = true;
  isRaw = false;

  setRawMode(mode: boolean): this {
    this.isRaw = mode;
    return this;
  }
}

async function nextTurn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

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
      allowUnknownArgs: true,
      run: ({ args, input }) => ({ args, input }),
    });
    await expect(
      runCommand(command, ["--path", ".", "--no-focus", "--model=o3", "--", "--sandbox"]),
    ).resolves.toEqual({
      args: { path: ".", focus: false },
      input: {
        argv: ["--path", ".", "--no-focus", "--model=o3", "--", "--sandbox"],
        unknown: ["--model=o3"],
        passthrough: ["--sandbox"],
      },
    });
  });

  it("supports git-worktree parent options before a subcommand", async () => {
    const parentRun = vi.fn(() => undefined);
    const command = defineCommand({
      args: z.object({ repo: z.string() }),
      subCommands: {
        new: defineCommand({
          args: z.object({ name: z.string() }),
          run: ({ args, input }) => ({ args, input }),
        }),
      },
      run: parentRun,
    });
    await expect(runCommand(command, ["--repo", "x", "new", "--name", "feature"])).resolves.toEqual(
      {
        args: { name: "feature" },
        input: { argv: ["--name", "feature"], unknown: [], passthrough: [] },
      },
    );
    expect(parentRun).not.toHaveBeenCalled();
  });

  it("supports gh-pr-commits coercion, optional positional, and repo alias", async () => {
    const command = defineCommand({
      args: z.object({
        positionals: z.tuple([z.coerce.number().int().optional()]),
        repo: z.string().optional().meta({ alias: "R" }),
      }),
      run: ({ args }) => args,
    });
    await expect(runCommand(command, ["42", "-R", "owner/repo"])).resolves.toEqual({
      positionals: [42],
      repo: "owner/repo",
    });
  });

  it("supports multiple positional arguments and overflow", async () => {
    const command = defineCommand({
      args: z.object({ positionals: z.tuple([z.string(), z.string().optional()]) }),
      allowUnknownArgs: true,
      run: ({ args, input }) => ({ args, input }),
    });
    await expect(runCommand(command, ["a", "b", "c"])).resolves.toEqual({
      args: { positionals: ["a", "b"] },
      input: { argv: ["a", "b", "c"], unknown: ["c"], passthrough: [] },
    });
  });

  it("accepts zod/mini object schemas at the public API", async () => {
    const command = defineCommand({
      args: mini.object({ value: mini._default(mini.string(), "mini") }),
      run: ({ args }) => args.value,
    });
    await expect(runCommand(command, [])).resolves.toEqual("mini");
  });

  it.each([
    ["zod", z.object({ positionals: z.tuple([z.string()], z.string()) })],
    ["zod/mini", mini.object({ positionals: mini.tuple([mini.string()], mini.string()) })],
  ])("runs fixed and variadic arguments with %s", async (_name, args) => {
    const command = defineCommand({
      args,
      allowUnknownArgs: true,
      run: ({ args: parsed, input }) => ({ parsed, input }),
    });
    await expect(
      runCommand(command, ["fixed", "one", "two", "--extra", "--", "tail"]),
    ).resolves.toEqual({
      parsed: { positionals: ["fixed", "one", "two"] },
      input: {
        argv: ["fixed", "one", "two", "--extra", "--", "tail"],
        unknown: ["--extra"],
        passthrough: ["tail"],
      },
    });
  });
});

describe("terminal output integration", () => {
  it("routes every public output kind through the invocation printer", async () => {
    const events: PrintEvent[] = [];
    const printer = { print: (event: PrintEvent) => void events.push(event) };
    const input = new IntegrationInput();
    const output = { isTTY: true, write: () => undefined };
    const root = defineCommand({
      name: "release",
      version: "1.2.3",
      subCommands: {
        deploy: defineCommand({
          args: z.object({ target: z.string() }),
          async run({ args, logger, prompt }) {
            logger.info("Preparing {target}", { target: args.target });
            const environment = await prompt.select({
              message: "Environment",
              options: [{ value: "staging" }, { value: "production" }] as const,
              initialValue: "staging",
            });
            logger.success("Deploying {target} to {environment}", {
              target: args.target,
              environment,
            });
            return;
          },
        }),
        prompt: defineCommand({
          run: async ({ prompt }) =>
            await prompt.confirm({ message: "Continue?", initialValue: true }),
        }),
        crash: defineCommand({
          run() {
            throw new HackshError("runtime failed");
          },
        }),
      },
    });

    const deployment = runCommand(root, ["deploy", "--target", "api"], {
      printer,
      stdin: input,
      stdout: output,
      env: {},
    });
    await nextTurn();
    input.write("\r");
    await deployment;
    await runCommand(root, ["--help"], { printer, env: {} });
    await runCommand(root, ["--version"], { printer, env: {} });

    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    try {
      await expect(runMain(root, { argv: ["deploy"], printer, env: {} })).rejects.toThrow("exit:1");
      await expect(runMain(root, { argv: ["missing"], printer, env: {} })).rejects.toThrow(
        "exit:1",
      );
      await expect(runMain(root, { argv: ["crash"], printer, env: {} })).rejects.toThrow("exit:1");
      await expect(
        runMain(root, {
          argv: ["prompt"],
          printer,
          stdin: input,
          stdout: { isTTY: false, write: () => undefined },
          env: {},
        }),
      ).rejects.toThrow("exit:1");
    } finally {
      exit.mockRestore();
    }

    expect(new Set(events.map(({ type }) => type))).toEqual(
      new Set(["log", "prompt", "usage", "version", "error"]),
    );
    expect(
      events.filter((event) => event.type === "prompt").map(({ prompt }) => prompt.status),
    ).toEqual(["active", "submitted"]);
    expect(events.filter((event) => event.type === "error").map(({ error }) => error.kind)).toEqual(
      ["validation", "usage", "error", "prompt"],
    );
    expect(events.at(-1)).toMatchObject({
      type: "error",
      error: {
        kind: "prompt",
        properties: {
          reason: "non-interactive",
          prompt: { kind: "confirm", message: "Continue?" },
        },
      },
    });
    expect(input.isRaw).toBe(false);
    expect(input.listenerCount("keypress")).toBe(0);
  });

  it("runs identical logger code through pretty and JSON printers", async () => {
    const run = vi.fn(({ logger, output }) => {
      logger.info("built {count}", { count: 2 });
      logger.warn("check output", { target: "dist" });
      output.println("dist/app.js");
      output.json({ files: 1 });
      return;
    });
    const command = defineCommand({ name: "build", run });
    const prettyStdout: string[] = [];
    const prettyStderr: string[] = [];
    await runCommand(command, [], {
      output: "pretty",
      env: { NO_COLOR: "1" },
      stdout: { isTTY: true, write: (text) => void prettyStdout.push(text) },
      stderr: { write: (text) => void prettyStderr.push(text) },
    });
    const jsonStdout: string[] = [];
    const jsonStderr: string[] = [];
    await runCommand(command, [], {
      output: "json",
      env: {},
      stdout: { isTTY: true, write: (text) => void jsonStdout.push(text) },
      stderr: { write: (text) => void jsonStderr.push(text) },
    });

    expect(run).toHaveBeenCalledTimes(2);
    expect(prettyStdout.join("")).toBe('dist/app.js\n{\n  "files": 1\n}\n');
    expect(prettyStderr.join("")).toContain("built 2");
    expect(prettyStderr.join("")).toContain("check output");
    expect(jsonStdout.map((line) => JSON.parse(line))).toEqual([
      { type: "output", kind: "text", text: "dist/app.js\n" },
      { type: "output", kind: "json", data: { files: 1 } },
    ]);
    expect(jsonStderr.map((line) => JSON.parse(line))).toMatchObject([
      { type: "log", record: { level: "info", message: "built 2", properties: { count: 2 } } },
      { type: "log", record: { level: "warning", properties: { target: "dist" } } },
    ]);
  });
});
