import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import {
  defineCommand,
  parseArgs,
  renderUsage,
  runCommand,
  HackshValidationError,
} from "./index.ts";
import type { PrintEvent, Printer } from "./printer-api.ts";

function deployTree() {
  const deploy = defineCommand({
    args: z.object({
      target: z.string(),
      dryRun: z.boolean().default(false),
      token: z.string().meta({ env: "GITHUB_TOKEN" }),
      debug: z.boolean().optional().meta({ env: false }),
    }),
    run: ({ args }) => args,
  });
  return defineCommand({
    name: "my-cli",
    args: z.object({ verbose: z.boolean().default(false) }),
    subCommands: { deploy },
    run: ({ args }) => args,
  });
}

async function validationIssues(invocation: Promise<unknown>) {
  const error = await invocation.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(HackshValidationError);
  return (error as HackshValidationError).issues.map(({ arg, message }) => ({ arg, message }));
}

describe("environment-backed options", () => {
  const base = { MY_CLI_DEPLOY_TARGET: "prod", GITHUB_TOKEN: "t" };

  it("reads options from command-path names and explicit names", async () => {
    await expect(runCommand(deployTree(), ["deploy"], { env: base })).resolves.toEqual({
      target: "prod",
      token: "t",
      dryRun: false,
    });
  });

  it("prefers CLI arguments, including explicit negation, over the environment", async () => {
    const env = { ...base, MY_CLI_DEPLOY_DRY_RUN: "true" };
    await expect(
      runCommand(deployTree(), ["deploy", "--target=stg", "--no-dry-run"], { env }),
    ).resolves.toMatchObject({ target: "stg", dryRun: false });
    await expect(runCommand(deployTree(), ["deploy"], { env })).resolves.toMatchObject({
      dryRun: true,
    });
  });

  it("ignores replaced and disabled automatic names", async () => {
    const env = {
      MY_CLI_DEPLOY_TARGET: "prod",
      MY_CLI_DEPLOY_TOKEN: "auto",
      MY_CLI_DEPLOY_DEBUG: "true",
      GITHUB_TOKEN: "explicit",
    };
    const args = await runCommand(deployTree(), ["deploy"], { env });
    expect(args).toEqual({ target: "prod", token: "explicit", dryRun: false });
  });

  it("validates parent options from their own names", async () => {
    const root = deployTree();
    await expect(runCommand(root, [], { env: { MY_CLI_VERBOSE: "true" } })).resolves.toEqual({
      verbose: true,
    });
    const issues = await validationIssues(
      runCommand(root, ["deploy"], { env: { ...base, MY_CLI_VERBOSE: "1" } }),
    );
    expect(issues).toEqual([{ arg: "MY_CLI_VERBOSE", message: "expects true or false" }]);
  });

  it("names nested subcommands by their routing keys", async () => {
    const leaf = defineCommand({
      name: "display-name",
      args: z.object({ maxRetries: z.coerce.number() }),
      run: ({ args }) => args.maxRetries,
    });
    const root = defineCommand({
      name: "tool",
      subCommands: { db: defineCommand({ subCommands: { "run-migrations": leaf } }) },
    });
    await expect(
      runCommand(root, ["db", "run-migrations"], {
        env: { TOOL_DB_RUN_MIGRATIONS_MAX_RETRIES: "3" },
      }),
    ).resolves.toEqual(3);
  });

  it("reads only explicit names when the root has no name", async () => {
    const root = defineCommand({
      subCommands: {
        sub: defineCommand({
          args: z.object({
            a: z.string().optional(),
            b: z.string().optional().meta({ env: "B_VALUE" }),
          }),
          run: ({ args }) => args,
        }),
      },
    });
    await expect(
      runCommand(root, ["sub"], { env: { SUB_A: "x", A: "x", B_VALUE: "y" } }),
    ).resolves.toEqual({ b: "y" });
  });

  it("treats an empty value as set and leaves unset values to defaults", async () => {
    const command = defineCommand({
      name: "tool",
      args: z.object({ label: z.string().default("fallback"), quiet: z.boolean().default(false) }),
      run: ({ args }) => args,
    });
    await expect(runCommand(command, [], { env: { TOOL_LABEL: "" } })).resolves.toEqual({
      label: "",
      quiet: false,
    });
    await expect(runCommand(command, [], { env: {} })).resolves.toEqual({
      label: "fallback",
      quiet: false,
    });
    const issues = await validationIssues(runCommand(command, [], { env: { TOOL_QUIET: "" } }));
    expect(issues).toEqual([{ arg: "TOOL_QUIET", message: "expects true or false" }]);
  });

  it("reports schema failures by variable name without the value", async () => {
    let ran = false;
    const command = defineCommand({
      name: "tool",
      args: z.object({ port: z.coerce.number().int() }),
      run: () => {
        ran = true;
        return;
      },
    });
    const issues = await validationIssues(
      runCommand(command, [], { env: { TOOL_PORT: "secret-value" } }),
    );
    expect(issues).toEqual([{ arg: "TOOL_PORT", message: expect.any(String) }]);
    expect(JSON.stringify(issues)).not.toContain("secret-value");
    expect(ran).toBe(false);
  });

  it("rejects one variable name shared by a parent and a child option", async () => {
    const root = defineCommand({
      name: "my-cli",
      args: z.object({ deployTarget: z.string().optional() }),
      subCommands: {
        deploy: defineCommand({
          args: z.object({ target: z.string() }),
          run: () => "ran",
        }),
      },
    });
    await expect(runCommand(root, ["deploy"], { env: {} })).rejects.toThrow(
      "Environment variable `MY_CLI_DEPLOY_TARGET` is used by both `--deploy-target` and `deploy --target`",
    );
  });

  it("keeps concurrent invocations and process.env separate", async () => {
    const before = { ...process.env };
    const results = await Promise.all([
      runCommand(deployTree(), ["deploy"], { env: { ...base, MY_CLI_DEPLOY_TARGET: "a" } }),
      runCommand(deployTree(), ["deploy"], { env: { ...base, MY_CLI_DEPLOY_TARGET: "b" } }),
    ]);
    expect(results).toMatchObject([{ target: "a" }, { target: "b" }]);
    expect(process.env).toEqual(before);
  });

  it("reads the environment in parseArgs only when one is given", async () => {
    const command = defineCommand({
      name: "tool",
      args: z.object({ mode: z.string().optional() }),
    });
    await expect(parseArgs(command, [], { env: { TOOL_MODE: "fast" } })).resolves.toEqual({
      mode: "fast",
    });
    process.env.TOOL_MODE = "fast";
    try {
      await expect(parseArgs(command, [])).resolves.toEqual({});
    } finally {
      delete process.env.TOOL_MODE;
    }
  });
});

describe("environment names in help", () => {
  it("shows the path-derived names for the routed subcommand", async () => {
    const events: PrintEvent[] = [];
    const printer: Printer = { print: (event) => void events.push(event) };
    await runCommand(deployTree(), ["deploy", "--help"], { printer, env: {} });

    const [event] = events;
    expect(event).toMatchObject({ type: "usage" });
    if (event?.type !== "usage") return;
    expect(event.usage.options.map(({ name, env }) => ({ name, env }))).toEqual([
      { name: "target", env: "MY_CLI_DEPLOY_TARGET" },
      { name: "dry-run", env: "MY_CLI_DEPLOY_DRY_RUN" },
      { name: "token", env: "GITHUB_TOKEN" },
      { name: "debug", env: undefined },
    ]);
    expect(event.text).toContain("--[no-]dry-run  (Default: false) (Env: MY_CLI_DEPLOY_DRY_RUN)");
    expect(event.text).toContain("--token=<token>  (Required) (Env: GITHUB_TOKEN)");
  });

  it("treats a standalone command as the root", () => {
    const command = defineCommand({ name: "tool", args: z.object({ level: z.string() }) });
    expect(renderUsage(command)).toContain("(Env: TOOL_LEVEL)");
    expect(renderUsage(defineCommand({ args: z.object({ level: z.string() }) }))).not.toContain(
      "Env:",
    );
  });
});
