import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import process from "node:process";

const repository = resolve(import.meta.dirname, "..");
const temporaryRoot = await mkdtemp(join(tmpdir(), "hacksh-packed-consumers-"));

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const startedAt = Date.now();
    const child = spawn(command, args, {
      cwd: options.cwd ?? repository,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let timedOut = false;
    const timeout = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, options.timeoutMs)
      : undefined;
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (timeout) clearTimeout(timeout);
      resolveRun({ code, stdout, stderr, timedOut, durationMs: Date.now() - startedAt });
    });
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runtimeEnvironment(base, overrides = {}) {
  const environment = { ...base };
  for (const key of ["CI", "NO_COLOR", "HACKSH_OUTPUT"]) delete environment[key];
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete environment[key];
    else environment[key] = value;
  }
  return environment;
}

async function runChecked(command, args, options) {
  const result = await run(command, args, options);
  assert(
    result.code === 0,
    `${command} ${args.join(" ")} failed (${result.code})\n${result.stdout}${result.stderr}`,
  );
  return result;
}

async function verifyConsumer(label, execute) {
  const phaseTwoBehavior = await execute([
    "visible",
    "--no-enabled",
    "-Qowner/repo",
    "one",
    "two",
    "--unknown=value",
    "--",
    "--help",
  ]);
  assert(
    phaseTwoBehavior.code === 0,
    `${label}: visible behavior command exited ${phaseTwoBehavior.code}\n${phaseTwoBehavior.stdout}${phaseTwoBehavior.stderr}`,
  );
  assert(
    phaseTwoBehavior.stdout.trim() ===
      JSON.stringify({
        cmd: "visible",
        args: { enabled: false, repo: "owner/repo", _: ["ONE", "TWO"] },
        extraArgs: ["--unknown=value"],
        passthrough: ["--help"],
      }),
    `${label}: unexpected visible behavior output: ${phaseTwoBehavior.stdout}${phaseTwoBehavior.stderr}`,
  );

  const equals = await execute(["visible", "--repo=equal/repo"]);
  assert(equals.code === 0, `${label}: equals command exited ${equals.code}`);
  assert(
    JSON.parse(equals.stdout).args.repo === "equal/repo" &&
      JSON.parse(equals.stdout).args._.length === 0,
    `${label}: equals value or empty variadic was not parsed`,
  );

  const inlineBoolean = await execute(["visible", "--enabled=false"]);
  assert(inlineBoolean.code === 0, `${label}: inline boolean exited ${inlineBoolean.code}`);
  assert(
    JSON.parse(inlineBoolean.stdout).args.enabled === false,
    `${label}: inline boolean false was not parsed`,
  );

  const invalidInlineBoolean = await execute(["visible", "--no-enabled=false"]);
  assert(
    invalidInlineBoolean.code === 1 && invalidInlineBoolean.stderr.includes("--no-enabled:"),
    `${label}: valued negation was not rejected`,
  );

  const missing = await execute(["visible", "--repo"]);
  assert(missing.code === 1, `${label}: missing value exited ${missing.code}`);
  assert(missing.stderr.includes("--repo: requires a value"), `${label}: missing error absent`);
  assert(
    missing.stderr.includes("◆  CUSTOM\n│  Public command (visible)") &&
      missing.stderr.includes("USAGE visible"),
    `${label}: visible usage absent: ${missing.stderr}`,
  );

  const version = await execute(["--version"]);
  assert(version.code === 0 && version.stdout.trim() === "●  1.2.3", `${label}: version failed`);

  const parentHelp = await execute(["--help"]);
  assert(parentHelp.code === 0, `${label}: parent help exited ${parentHelp.code}`);
  assert(
    parentHelp.stdout.includes("◆  CUSTOM\n│  packed-consumer v1.2.3") &&
      parentHelp.stdout.includes("USAGE packed-consumer [OPTIONS] <COMMAND>") &&
      parentHelp.stdout.includes("visible  Public command") &&
      !parentHelp.stdout.includes("zod-hidden") &&
      !parentHelp.stdout.includes("mini-hidden") &&
      !parentHelp.stdout.includes("Internal zod"),
    `${label}: parent help did not suppress hidden commands: ${parentHelp.stdout}`,
  );
  assert(parentHelp.stderr === "", `${label}: parent help wrote to stderr`);

  for (const [commandName, flavor] of [
    ["zod-hidden", "zod"],
    ["mini-hidden", "zod/mini"],
  ]) {
    const executed = await execute([commandName, "--mode=safe", "--enabled=false"]);
    assert(
      executed.code === 0,
      `${label}: ${commandName} exited ${executed.code}\n${executed.stdout}${executed.stderr}`,
    );
    assert(
      executed.stdout.trim() ===
        JSON.stringify({ flavor, cmd: commandName, args: { mode: "safe", enabled: false } }),
      `${label}: ${commandName} did not execute by name: ${executed.stdout}${executed.stderr}`,
    );

    const directHelp = await execute([commandName, "--help"]);
    assert(directHelp.code === 0, `${label}: ${commandName} help exited ${directHelp.code}`);
    assert(
      directHelp.stdout.includes(`◆  CUSTOM\n│  Internal ${flavor} command (${commandName})`) &&
        directHelp.stdout.includes(`USAGE ${commandName} [OPTIONS]`) &&
        directHelp.stdout.includes("--mode=<MODE>  Execution mode (Choices: fast, safe)") &&
        directHelp.stdout.includes("--[no-]enabled  Enable feature (Default: true)"),
      `${label}: ${commandName} direct help was unavailable: ${directHelp.stdout}`,
    );
    assert(directHelp.stderr === "", `${label}: ${commandName} help wrote to stderr`);
  }

  const unknown = await execute(["missing"]);
  assert(unknown.code === 1, `${label}: unknown command exited ${unknown.code}`);
  assert(
    unknown.stderr.includes("Unknown command `missing`") &&
      unknown.stderr.includes("◆  CUSTOM\n│  packed-consumer v1.2.3") &&
      unknown.stderr.includes("visible  Public command") &&
      !unknown.stderr.includes("zod-hidden") &&
      !unknown.stderr.includes("mini-hidden") &&
      !unknown.stderr.includes("Internal zod"),
    `${label}: unknown-command usage exposed hidden commands: ${unknown.stderr}`,
  );

  for (const environmentName of ["NO_COLOR", "CI"]) {
    const plainHelp = await execute(["--help"], { [environmentName]: "0" });
    assert(plainHelp.code === 0, `${label}: ${environmentName} help exited ${plainHelp.code}`);
    if (environmentName === "CI") {
      const event = JSON.parse(plainHelp.stdout);
      assert(event.type === "usage", `${label}: non-empty CI did not select JSON`);
    } else {
      assert(
        !plainHelp.stdout.includes(`${String.fromCharCode(27)}[`),
        `${label}: non-empty NO_COLOR help used ANSI`,
      );
    }
  }

  const parseLines = (text) =>
    text
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));

  for (const commandName of ["terminal-zod", "terminal-mini"]) {
    const args = [
      commandName,
      "--target",
      "production",
      "--json",
      "--output",
      "application",
      "--log-format",
      "application",
    ];
    const pretty = await execute(args, { HACKSH_OUTPUT: "pretty", NO_COLOR: "0" });
    assert(pretty.code === 0, `${label}: ${commandName} pretty run exited ${pretty.code}`);
    for (const message of ["trace", "debug", "info", "step", "success"]) {
      assert(pretty.stdout.includes(message), `${label}: pretty stdout omitted ${message}`);
    }
    for (const message of ["warning", "error", "fatal"]) {
      assert(pretty.stderr.includes(message), `${label}: pretty stderr omitted ${message}`);
    }
    assert(
      !pretty.stdout.includes(`${String.fromCharCode(27)}[`) &&
        !pretty.stderr.includes(`${String.fromCharCode(27)}[`),
      `${label}: non-empty NO_COLOR did not disable color on both streams`,
    );

    const json = await execute(args, { HACKSH_OUTPUT: "json" });
    assert(json.code === 0, `${label}: ${commandName} JSON run exited ${json.code}`);
    const logs = [...parseLines(json.stdout), ...parseLines(json.stderr)];
    assert(logs.length === 8, `${label}: expected all eight log records, got ${logs.length}`);
    assert(
      logs.every((event) => event.type === "log"),
      `${label}: JSON run emitted non-log data`,
    );
    assert(
      logs.map((event) => `${event.record.level}:${event.record.kind}`).join(",") ===
        "trace:message,debug:message,info:message,info:step,info:success,warning:message,error:message,fatal:message",
      `${label}: JSON levels/kinds were incomplete: ${JSON.stringify(logs)}`,
    );
    assert(
      logs.every(
        (event) =>
          event.record.category.join("/") === `packed-consumer/${commandName}` &&
          event.record.properties.target === "production",
      ),
      `${label}: JSON logger metadata was not preserved`,
    );

    const help = await execute([commandName, "--help"], { HACKSH_OUTPUT: "json" });
    const helpEvents = parseLines(help.stdout);
    assert(
      help.code === 0 &&
        help.stderr === "" &&
        helpEvents.length === 1 &&
        helpEvents[0].type === "usage" &&
        helpEvents[0].usage.name === commandName,
      `${label}: ${commandName} structured help failed: ${help.stdout}${help.stderr}`,
    );

    const validation = await execute([commandName], { HACKSH_OUTPUT: "json" });
    const validationEvents = parseLines(validation.stderr);
    assert(
      validation.code === 1 &&
        validation.stdout === "" &&
        validationEvents.map((event) => event.type).join(",") === "error,usage" &&
        validationEvents[0].error.kind === "validation" &&
        validationEvents[0].error.issues.some((issue) => issue.arg === "--target"),
      `${label}: ${commandName} structured validation failed: ${validation.stderr}`,
    );

    const runtime = await execute([commandName, "--target", "explode"], {
      HACKSH_OUTPUT: "json",
    });
    const runtimeEvents = parseLines(runtime.stderr);
    assert(
      runtime.code === 1 &&
        runtimeEvents.length === 1 &&
        runtimeEvents[0].type === "error" &&
        runtimeEvents[0].error.message === "runtime exploded" &&
        runtimeEvents[0].error.properties.code === "E_RUNTIME",
      `${label}: ${commandName} structured runtime error failed: ${runtime.stderr}`,
    );
  }

  const structuredVersion = await execute(["--version"], { HACKSH_OUTPUT: "json" });
  assert(
    structuredVersion.code === 0 &&
      JSON.parse(structuredVersion.stdout).type === "version" &&
      JSON.parse(structuredVersion.stdout).version === "1.2.3",
    `${label}: structured version failed`,
  );

  const structuredUnknown = await execute(["missing"], { HACKSH_OUTPUT: "json" });
  const unknownEvents = parseLines(structuredUnknown.stderr);
  assert(
    structuredUnknown.code === 1 &&
      unknownEvents.map((event) => event.type).join(",") === "error,usage" &&
      unknownEvents[0].error.kind === "usage" &&
      unknownEvents[0].error.message.includes("Unknown command `missing`"),
    `${label}: structured unknown-command error failed`,
  );

  const prompt = await execute(["prompt"], { HACKSH_OUTPUT: "json" }, { timeoutMs: 2_000 });
  const promptEvents = parseLines(prompt.stderr);
  assert(!prompt.timedOut, `${label}: noninteractive prompt waited past its deadline`);
  assert(
    prompt.code === 1 &&
      promptEvents.length === 1 &&
      promptEvents[0].type === "error" &&
      promptEvents[0].error.kind === "prompt" &&
      promptEvents[0].error.properties.reason === "non-interactive" &&
      promptEvents[0].error.properties.prompt.kind === "select" &&
      promptEvents[0].error.properties.prompt.message === "Environment" &&
      promptEvents[0].error.properties.prompt.choices.join(",") === "staging,production",
    `${label}: noninteractive prompt was not identified: ${prompt.stderr}`,
  );

  const invalidMode = await execute(["terminal-zod", "--target", "production"], {
    HACKSH_OUTPUT: "JSON",
  });
  const invalidEvents = parseLines(invalidMode.stderr);
  assert(
    invalidMode.code === 1 &&
      invalidMode.stdout === "" &&
      invalidEvents.length === 1 &&
      invalidEvents[0].type === "error" &&
      invalidEvents[0].error.message.includes("Invalid HACKSH_OUTPUT value JSON"),
    `${label}: case-sensitive output setting was not rejected before execution`,
  );

  const executed = await execute(["exec"], {}, { spawnsChildren: true });
  assert(
    executed.code === 0 &&
      executed.stdout.trim() ===
        JSON.stringify({
          echoed: ["with space", "$HOME", ";|*", 'quo"te', ""],
          status: "failed",
          reason: "exit-code",
          exitCode: 3,
        }),
    `${label}: context exec did not capture output or report the exit code: ${executed.stdout}${executed.stderr}`,
  );

  const execFailure = await execute(
    ["exec-fail"],
    { HACKSH_OUTPUT: "json" },
    { spawnsChildren: true },
  );
  const execFailureEvents = parseLines(execFailure.stderr);
  assert(
    execFailure.code === 1 &&
      execFailureEvents.length === 2 &&
      execFailureEvents[0].type === "exec" &&
      execFailureEvents[0].phase === "start" &&
      execFailureEvents[1].type === "error" &&
      execFailureEvents[1].error.kind === "error" &&
      execFailureEvents[1].error.name === "HackshExecError" &&
      execFailureEvents[1].error.message.includes("exit code 3") &&
      execFailureEvents[1].error.properties === undefined,
    `${label}: rejected exec was not reported as a JSON error: ${execFailure.stdout}${execFailure.stderr}`,
  );

  const execShow = await execute(
    ["exec-show"],
    { HACKSH_OUTPUT: "json" },
    { spawnsChildren: true },
  );
  const execShowEvents = parseLines(execShow.stderr);
  assert(
    execShow.code === 0 &&
      execShow.stdout === "" &&
      execShowEvents.length === 1 &&
      execShowEvents[0].type === "exec" &&
      execShowEvents[0].phase === "start" &&
      Array.isArray(execShowEvents[0].command.args),
    `${label}: JSON exec did not emit a start event without child output: ${execShow.stdout}${execShow.stderr}`,
  );

  const execQuiet = await execute(
    ["exec-quiet"],
    { HACKSH_OUTPUT: "json" },
    { spawnsChildren: true },
  );
  assert(
    execQuiet.code === 0 && execQuiet.stdout === "" && execQuiet.stderr === "",
    `${label}: display:false still emitted output: ${execQuiet.stdout}${execQuiet.stderr}`,
  );

  const execRedact = await execute(
    ["exec-redact"],
    { HACKSH_OUTPUT: "json" },
    { spawnsChildren: true },
  );
  assert(
    execRedact.code === 0 &&
      execRedact.stderr.includes("***") &&
      !execRedact.stdout.includes("super-secret-value") &&
      !execRedact.stderr.includes("super-secret-value"),
    `${label}: redact did not mask the command: ${execRedact.stdout}${execRedact.stderr}`,
  );

  const execInherit = await execute(
    ["exec-inherit"],
    { HACKSH_OUTPUT: "pretty", NO_COLOR: "1" },
    { spawnsChildren: true },
  );
  assert(
    execInherit.code === 0 && execInherit.stdout.includes("INHERITED-OUT"),
    `${label}: inherited stdout did not reach the consumer: ${execInherit.stdout}${execInherit.stderr}`,
  );

  const execJsonInherit = await execute(
    ["exec-json-inherit"],
    { HACKSH_OUTPUT: "json" },
    { spawnsChildren: true },
  );
  assert(
    execJsonInherit.code === 1 &&
      execJsonInherit.stderr.includes("JSON output mode") &&
      !execJsonInherit.stdout.includes("CHILD-RAN") &&
      !execJsonInherit.stderr.includes("CHILD-RAN"),
    `${label}: JSON inherit was not refused before the child ran: ${execJsonInherit.stdout}${execJsonInherit.stderr}`,
  );

  const execInteractive = await execute(
    ["exec-interactive"],
    { HACKSH_OUTPUT: "json" },
    { spawnsChildren: true },
  );
  assert(
    execInteractive.code === 1 &&
      execInteractive.stderr.includes("interactive terminal") &&
      !execInteractive.stdout.includes("CHILD-RAN") &&
      !execInteractive.stderr.includes("CHILD-RAN"),
    `${label}: non-interactive exec was not refused before the child ran: ${execInteractive.stdout}${execInteractive.stderr}`,
  );

  const standalonePretty = await execute(["__standalone-help__"], {
    HACKSH_OUTPUT: "pretty",
    NO_COLOR: "0",
  });
  assert(
    standalonePretty.code === 0 &&
      standalonePretty.stdout.includes("USAGE packed-consumer") &&
      !standalonePretty.stdout.includes(`${String.fromCharCode(27)}[`),
    `${label}: standalone help did not use automatic pretty policy`,
  );
  const standaloneJson = await execute(["__standalone-help__"], { HACKSH_OUTPUT: "json" });
  assert(
    standaloneJson.code === 0 && JSON.parse(standaloneJson.stdout).type === "usage",
    `${label}: standalone help did not use automatic JSON policy`,
  );
}

function consumerSource(zodSpecifier, miniSpecifier, packageSpecifier) {
  return `
import { z } from ${JSON.stringify(zodSpecifier)};
import * as mini from ${JSON.stringify(miniSpecifier)};
import {
  createMain,
  defineCommand,
  parseArgs,
  renderUsage,
  showUsage,
  HackshValidationError,
} from ${JSON.stringify(packageSpecifier)};
async function verifyPhaseTwo(label, phaseCommand) {
  const usage = await renderUsage(phaseCommand);
  for (const expected of [
    "<MODE>",
    "[INPUT...]",
    "Execution mode (Choices: fast, safe)",
    "--format=<FORMAT>",
    "Output format (Choices: json, yaml)",
    "Input files (Choices: txt, md)",
    "--[no-]enabled  Enable feature (Default: true)",
  ]) {
    if (!usage.includes(expected)) throw new Error(label + " help omitted " + expected + "\\n" + usage);
  }
  const parsed = await parseArgs(phaseCommand, [
    "fast",
    "txt",
    "md",
    "--format=json",
    "--enabled=false",
  ]);
  if (
    parsed._.join(",") !== "fast,txt,md" ||
    parsed.format !== "json" ||
    parsed.enabled !== false
  ) {
    throw new Error(label + " combined phase 2 parse failed: " + JSON.stringify(parsed));
  }
  const explicitTrue = await parseArgs(phaseCommand, ["safe", "--enabled=true"]);
  if (explicitTrue.enabled !== true || explicitTrue._.join(",") !== "safe") {
    throw new Error(label + " explicit true or empty variadic failed");
  }
  for (const token of ["--enabled=maybe", "--no-enabled=false"]) {
    const error = await parseArgs(phaseCommand, ["safe", token]).catch((caught) => caught);
    if (!(error instanceof HackshValidationError) || !error.message.includes(token.split("=")[0])) {
      throw new Error(label + " boolean error missing for " + token + ": " + String(error));
    }
  }
}
const phaseCommand = defineCommand({
  args: z.object({
    _: z.tuple(
      [z.enum(["fast", "safe"]).describe("Execution mode").meta({ title: "MODE" })],
      z.enum(["txt", "md"]).describe("Input files").meta({ title: "INPUT" }),
    ),
    enabled: z.boolean().default(true).describe("Enable feature"),
    format: z.enum(["json", "yaml"]).optional().describe("Output format"),
  }),
  argOptions: {
    format: { valueName: "FORMAT" },
  },
});
const miniPhaseCommand = defineCommand({
  args: mini.object({
    _: mini.tuple(
      [mini.enum(["fast", "safe"]).check(mini.describe("Execution mode"), mini.meta({ title: "MODE" }))],
      mini.enum(["txt", "md"]).check(mini.describe("Input files"), mini.meta({ title: "INPUT" })),
    ),
    enabled: mini._default(mini.boolean(), true).check(mini.describe("Enable feature")),
    format: mini.optional(mini.enum(["json", "yaml"])).check(mini.describe("Output format")),
  }),
  argOptions: {
    format: { valueName: "FORMAT" },
  },
});
await verifyPhaseTwo("zod", phaseCommand);
await verifyPhaseTwo("zod/mini", miniPhaseCommand);
function hiddenCommand(flavor, args) {
  return defineCommand({
    hidden: true,
    description: "Internal " + flavor + " command",
    args,
    argOptions: {
      mode: { valueName: "MODE" },
    },
    run({ cmd, args: parsed }) {
      console.log(JSON.stringify({ flavor, cmd: cmd.name, args: parsed }));
    },
  });
}
const zodHidden = hiddenCommand(
  "zod",
  z.object({
    mode: z.enum(["fast", "safe"]).describe("Execution mode"),
    enabled: z.boolean().default(true).describe("Enable feature"),
  }),
);
const miniHidden = hiddenCommand(
  "zod/mini",
  mini.object({
    mode: mini.enum(["fast", "safe"]).check(mini.describe("Execution mode")),
    enabled: mini._default(mini.boolean(), true).check(mini.describe("Enable feature")),
  }),
);
const runtimeScript = (code, ...args) =>
  typeof Deno === "undefined" ? ["-e", code, ...args] : ["eval", code, ...args];
const echoArguments =
  "console.log(JSON.stringify(typeof Deno === 'undefined' ? process.argv.slice(1) : Deno.args))";
const exitThree = "typeof Deno === 'undefined' ? process.exit(3) : Deno.exit(3)";
const legacyCommand = defineCommand({
  allowUnknownArgs: true,
  args: z.object({
    enabled: z.boolean().default(true),
    repo: z.string().optional(),
    _: z.array(z.string().transform((value) => value.toUpperCase())),
  }),
  argOptions: { repo: { alias: ["R", "Q"] } },
  run({ cmd, args, extraArgs, passthrough }) {
    console.log(JSON.stringify({ cmd: cmd.name, args, extraArgs, passthrough }));
  },
});
function terminalCommand(flavor, args) {
  return defineCommand({
    description: "Exercise installed terminal output with " + flavor,
    args,
    run({ args: parsed, logger }) {
      if (parsed.target === "explode") {
        throw Object.assign(new Error("runtime exploded"), { code: "E_RUNTIME" });
      }
      const log = logger.with({ flavor, target: parsed.target });
      log.trace("trace {target}");
      log.debug("debug {target}");
      log.info("info {target}");
      log.step("step {target}");
      log.success("success {target}");
      log.warn("warning {target}");
      log.error("error {target}");
      log.fatal("fatal {target}");
    },
  });
}
const command = defineCommand({
  name: "packed-consumer",
  version: "1.2.3",
  subCommands: {
    visible: defineCommand({ ...legacyCommand, description: "Public command" }),
    "zod-hidden": zodHidden,
    "mini-hidden": miniHidden,
    "terminal-zod": terminalCommand(
      "zod",
      z.object({
        target: z.string(),
        json: z.boolean().default(false),
        output: z.string().optional(),
        logFormat: z.string().optional(),
      }),
    ),
    "terminal-mini": terminalCommand(
      "zod/mini",
      mini.object({
        target: mini.string(),
        json: mini._default(mini.boolean(), false),
        output: mini.optional(mini.string()),
        logFormat: mini.optional(mini.string()),
      }),
    ),
    prompt: defineCommand({
      async run({ logger }) {
        await logger.select({
          message: "Environment",
          options: [{ value: "staging" }, { value: "production" }],
          initialValue: "staging",
        });
      },
    }),
    exec: defineCommand({
      hidden: true,
      async run({ exec }) {
        const echoed = await exec(
          process.execPath,
          runtimeScript(echoArguments, "with space", "$HOME", ";|*", 'quo"te', ""),
        );
        const failed = await exec(process.execPath, runtimeScript(exitThree), { reject: false });
        console.log(JSON.stringify({
          echoed: JSON.parse(echoed.stdout),
          status: failed.status,
          reason: failed.reason,
          exitCode: failed.exitCode,
        }));
      },
    }),
    "exec-fail": defineCommand({
      hidden: true,
      async run({ exec }) {
        await exec(process.execPath, runtimeScript(exitThree));
      },
    }),
    "exec-show": defineCommand({
      hidden: true,
      async run({ exec }) {
        await exec(process.execPath, runtimeScript("console.log('captured-marker')"));
      },
    }),
    "exec-quiet": defineCommand({
      hidden: true,
      async run({ exec }) {
        await exec(process.execPath, runtimeScript("console.log('quiet-marker')"), {
          display: false,
        });
      },
    }),
    "exec-redact": defineCommand({
      hidden: true,
      async run({ exec }) {
        await exec(process.execPath, runtimeScript("void 0", "super-secret-value"), {
          redact: ["super-secret-value"],
        });
      },
    }),
    "exec-inherit": defineCommand({
      hidden: true,
      async run({ exec }) {
        await exec(process.execPath, runtimeScript("console.log('INHERITED-OUT')"), {
          stdout: "inherit",
        });
      },
    }),
    "exec-json-inherit": defineCommand({
      hidden: true,
      async run({ exec }) {
        await exec(process.execPath, runtimeScript("console.log(['CHILD','RAN'].join('-'))"), {
          stdout: "inherit",
        });
      },
    }),
    "exec-interactive": defineCommand({
      hidden: true,
      async run({ exec }) {
        await exec(process.execPath, runtimeScript("console.log(['CHILD','RAN'].join('-'))"), {
          interactive: true,
        });
      },
    }),
  },
});
const miniCommand = defineCommand({
  args: mini.object({
    value: mini._default(mini.string(), "mini"),
    _: mini.optional(mini.array(mini.string())),
  }),
});
const miniArgs = await parseArgs(miniCommand, ["one", "two"]);
if (miniArgs.value !== "mini" || miniArgs._?.join(",") !== "one,two") {
  throw new Error("zod/mini variadic parseArgs failed");
}
const usage = await renderUsage(legacyCommand);
const writes = [];
await showUsage(legacyCommand, { async write(text) { writes.push(text); } });
if (writes.length !== 1 || writes[0] !== usage) throw new Error("usage APIs diverged");
const main = createMain(command, {
  output: "auto",
  async showUsage(selected, { write }) {
    await write("CUSTOM\\n" + await renderUsage(selected));
  },
});
if (process.argv.slice(2)[0] === "__standalone-help__") await showUsage(command);
else await main();
`;
}

function typeConsumerSource() {
  return `
import { z } from "zod";
import * as mini from "zod/mini";
import {
  consolePrinter,
  createMain,
  createStreamPrinter,
  defineCommand,
  HackshExecError,
  parseArgs,
  renderUsage,
  runCommand,
  showUsage,
  type ArgOptions,
  type ArgOptionsMap,
  type CommandDef,
  type Exec,
  type ExecCommand,
  type ExecFailure,
  type ExecFailureReason,
  type ExecOptions,
  type ExecPrintEvent,
  type ExecResult,
  type ExecReturn,
  type ExecSuccess,
  type PrintEvent,
  type HackshPromptErrorReason,
  type Printer,
  type ShowUsageCallback,
} from "hacksh";
const schema = z.object({
  _: z.tuple([z.enum(["fast", "safe"]).meta({ title: "MODE" })], z.string()),
  count: z.coerce.number(),
  label: z.string().default("ok"),
  enabled: z.boolean().default(true),
  format: z.enum(["json", "yaml"]).optional(),
});
const formatOptions: ArgOptions = { alias: "f", valueName: "FORMAT" };
const argOptions: ArgOptionsMap<typeof schema> = {
  format: formatOptions,
};
const command = defineCommand({
  args: schema,
  argOptions,
  run({ cmd, args }) {
    const same: CommandDef<typeof schema> = cmd;
    const output: {
      _: ["fast" | "safe", ...string[]];
      count: number;
      label: string;
      enabled: boolean;
      format?: "json" | "yaml";
    } = args;
    return { same, output };
  },
});
const parsed: Promise<z.output<typeof schema>> = parseArgs(command, [
  "fast",
  "--count",
  "2",
  "one",
]);
const rendered: Promise<string> = renderUsage(command);
const shown: Promise<void> = showUsage(command, { write: async (_text) => {} });
const callback: ShowUsageCallback = async (selected, { write }) => write(await renderUsage(selected));
const main: (argv?: string[]) => Promise<void> = createMain(command, {
  output: "pretty",
  showUsage: callback,
});
const miniSchema = mini.object({
  _: mini.tuple([mini.enum(["fast", "safe"])], mini.string()),
  enabled: mini._default(mini.boolean(), true),
});
const miniArgOptions: ArgOptionsMap<typeof miniSchema> = {
  enabled: { alias: "e" },
};
const miniCommand = defineCommand({
  args: miniSchema,
  argOptions: miniArgOptions,
});
const miniParsed: Promise<{
  _: ["fast" | "safe", ...string[]];
  enabled: boolean;
}> = parseArgs(miniCommand, ["fast", "one"]);
const hiddenSchema = z.object({
  mode: z.enum(["fast", "safe"]),
  enabled: z.boolean().default(true),
});
const hiddenZod = defineCommand({
  hidden: true,
  args: hiddenSchema,
  run({ args }) {
    const output: z.output<typeof hiddenSchema> = args;
    return output;
  },
});
const hiddenMiniSchema = mini.object({
  mode: mini.enum(["fast", "safe"]),
  enabled: mini._default(mini.boolean(), true),
});
const hiddenMini = defineCommand({
  hidden: true,
  args: hiddenMiniSchema,
  run({ args }) {
    const output: { mode: "fast" | "safe"; enabled: boolean } = args;
    return output;
  },
});
const hiddenRoot = defineCommand({
  subCommands: { hiddenZod, hiddenMini },
});
const hiddenMetadata: boolean | undefined = hiddenZod.hidden;
const promptCommand = defineCommand({
  async run({ logger }) {
    const selected = await logger.select({
      message: "Environment",
      options: [{ value: "staging" }, { value: "production" }] as const,
      initialValue: "staging",
    });
    const inferred: "staging" | "production" = selected;
    return inferred;
  },
});
const promptResult: Promise<unknown> = runCommand(promptCommand, [], { output: "json" });
const execCommand = defineCommand({
  async run({ exec }) {
    const typedExec: Exec = exec;
    const success: ExecSuccess = await typedExec("node", ["--version"], { cwd: "." });
    const command: ExecCommand = success.command;
    const options: ExecOptions = {
      reject: false,
      timeout: 1_000,
      maxBuffer: 1_024,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      interactive: false,
      display: false,
      redact: ["secret"],
      input: "data",
    };
    const inheritedStdout: ExecSuccess = await typedExec("node", ["--version"], {
      stdout: "inherit",
      stdin: "inherit",
      stderr: "inherit",
    });
    const result: ExecResult = await exec("node", ["-e", "process.exit(3)"], options);
    const returned: ExecReturn<{ reject: false }> = result;
    const execEvent: ExecPrintEvent = {
      type: "exec",
      phase: "start",
      command,
      stdio: { stdin: "input", stdout: "pipe", stderr: "inherit" },
      interactive: true,
    };
    const printed: PrintEvent = execEvent;
    // @ts-expect-error input cannot be combined with inherited stdin
    void exec("node", [], { input: "data", stdin: "inherit" });
    const inheritedInput: ExecOptions = { input: "data", stdin: "inherit" };
    void exec("node", [], inheritedInput);
    // @ts-expect-error a misspelled option is rejected next to a valid one
    void exec("node", [], { cwd: ".", rejct: false });
    if (result.status === "failed") {
      const failure: ExecFailure = result;
      const reason: ExecFailureReason = failure.reason;
      if (result.reason === "exit-code") return [command, returned, reason, result.exitCode satisfies number, printed, inheritedStdout];
      if (result.reason === "signal") return result.signal satisfies string;
      if (result.reason === "spawn") return result.error satisfies Error;
      if (result.reason === "json-output" || result.reason === "non-interactive" || result.reason === "overlapping") {
        return result.stdout;
      }
    }
    return result.stdout;
  },
});
const execFailure = (error: unknown): ExecFailure | undefined =>
  error instanceof HackshExecError ? error.result : undefined;
const promptReason: HackshPromptErrorReason = "non-interactive";
const legacyConsole: Printer = consolePrinter;
const legacyStreams: Printer = createStreamPrinter({
  stdout: { write: (_text) => undefined },
  stderr: { write: (_text) => undefined },
});
void [
  parsed,
  rendered,
  shown,
  main,
  miniParsed,
  argOptions,
  miniArgOptions,
  hiddenRoot,
  hiddenMetadata,
  promptResult,
  promptReason,
  execCommand,
  execFailure,
  legacyConsole,
  legacyStreams,
];
`;
}

let registry;
try {
  const configuredNode = process.env.HACKSH_MINIMUM_NODE;
  assert(
    !configuredNode || isAbsolute(configuredNode),
    "HACKSH_MINIMUM_NODE must be an absolute path to a Node 22.18.0 executable",
  );
  const minimumNodeExecutable = configuredNode ?? process.execPath;
  const minimumNode = await run(minimumNodeExecutable, ["--version"]);
  assert(
    minimumNode.code === 0 && minimumNode.stdout.trim() === "v22.18.0",
    `Packed consumer tests require Node 22.18.0, got ${minimumNode.stdout.trim() || minimumNode.stderr.trim() || `exit ${minimumNode.code}`}. Run pnpm under Node 22.18.0 or set HACKSH_MINIMUM_NODE=/absolute/path/to/node.`,
  );
  const minimumNodeEnvironment = {
    ...process.env,
    PATH: [dirname(minimumNodeExecutable), process.env.PATH].filter(Boolean).join(delimiter),
  };
  const packDirectory = join(temporaryRoot, "pack");
  await mkdir(packDirectory);
  await runChecked("pnpm", ["build"]);
  await runChecked("pnpm", ["pack", "--pack-destination", packDirectory]);
  const archiveName = (await readdir(packDirectory)).find((name) => name.endsWith(".tgz"));
  assert(archiveName, "pnpm pack did not produce a tarball");
  const archivePath = join(packDirectory, archiveName);

  const nodeDirectory = join(temporaryRoot, "node");
  await mkdir(nodeDirectory);
  await writeFile(join(nodeDirectory, "package.json"), JSON.stringify({ type: "module" }));
  await writeFile(join(nodeDirectory, "consumer.mjs"), consumerSource("zod", "zod/mini", "hacksh"));
  await writeFile(join(nodeDirectory, "consumer-types.ts"), typeConsumerSource());
  await runChecked(
    "npm",
    ["install", "--ignore-scripts", "--no-package-lock", archivePath, "zod@^4"],
    { cwd: nodeDirectory, env: minimumNodeEnvironment },
  );
  await runChecked(
    "pnpm",
    [
      "exec",
      "tsc",
      "--noEmit",
      "--ignoreConfig",
      "--strict",
      "--skipLibCheck",
      "--target",
      "ES2023",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      join(nodeDirectory, "consumer-types.ts"),
    ],
    { cwd: repository },
  );
  await verifyConsumer("Node 22.18.0", (args, environment = {}, executionOptions = {}) =>
    run(minimumNodeExecutable, ["consumer.mjs", ...args], {
      ...executionOptions,
      cwd: nodeDirectory,
      env: runtimeEnvironment(minimumNodeEnvironment, environment),
    }),
  );
  const hostNode = await run(process.execPath, ["--version"]);
  assert(hostNode.code === 0, `Host Node failed: ${hostNode.stderr}`);
  const hostNodeEnvironment = {
    ...process.env,
    PATH: [dirname(process.execPath), process.env.PATH].filter(Boolean).join(delimiter),
  };
  await verifyConsumer(
    `Node ${hostNode.stdout.trim()}`,
    (args, environment = {}, executionOptions = {}) =>
      run(process.execPath, ["consumer.mjs", ...args], {
        ...executionOptions,
        cwd: nodeDirectory,
        env: runtimeEnvironment(hostNodeEnvironment, environment),
      }),
  );

  const packageJson = JSON.parse(await readFile(join(repository, "package.json"), "utf8"));
  const archive = await readFile(archivePath);
  registry = createServer(async (request, response) => {
    const port = registry.address().port;
    if (request.url === "/hacksh") {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          name: "hacksh",
          "dist-tags": { latest: packageJson.version },
          versions: {
            [packageJson.version]: {
              name: "hacksh",
              version: packageJson.version,
              type: "module",
              exports: packageJson.exports,
              peerDependencies: packageJson.peerDependencies,
              dist: {
                tarball: `http://127.0.0.1:${port}/hacksh/-/${archiveName}`,
              },
            },
          },
        }),
      );
      return;
    }
    if (request.url === `/hacksh/-/${archiveName}`) {
      response.setHeader("content-type", "application/octet-stream");
      response.end(archive);
      return;
    }
    const upstream = await fetch(`https://registry.npmjs.org${request.url}`);
    response.statusCode = upstream.status;
    response.setHeader(
      "content-type",
      upstream.headers.get("content-type") ?? "application/octet-stream",
    );
    response.end(Buffer.from(await upstream.arrayBuffer()));
  });
  await new Promise((resolveListen) => registry.listen(0, "127.0.0.1", resolveListen));

  const denoDirectory = join(temporaryRoot, "deno");
  await mkdir(denoDirectory);
  await writeFile(
    join(denoDirectory, "consumer.mjs"),
    consumerSource("npm:zod@4", "npm:zod@4/mini", `npm:hacksh@${packageJson.version}`),
  );
  const registryUrl = `http://127.0.0.1:${registry.address().port}/`;
  const denoEnvironment = {
    ...process.env,
    DENO_DIR: join(denoDirectory, "cache"),
    NPM_CONFIG_REGISTRY: registryUrl,
  };
  const deniedEnvironment = await run(
    "deno",
    ["run", "--node-modules-dir=auto", "consumer.mjs", "--help"],
    { cwd: denoDirectory, env: runtimeEnvironment(denoEnvironment) },
  );
  assert(
    deniedEnvironment.code === 0 && deniedEnvironment.stdout.includes("USAGE packed-consumer"),
    `Deno without environment permission failed: ${deniedEnvironment.stdout}${deniedEnvironment.stderr}`,
  );
  await verifyConsumer("Deno", (args, environment = {}, executionOptions = {}) =>
    run(
      "deno",
      [
        "run",
        "--allow-run",
        // Deno's node:child_process reads the whole environment for every spawn.
        executionOptions.spawnsChildren ? "--allow-env" : "--allow-env=CI,NO_COLOR,HACKSH_OUTPUT",
        "--node-modules-dir=auto",
        "consumer.mjs",
        ...args,
      ],
      {
        ...executionOptions,
        cwd: denoDirectory,
        env: runtimeEnvironment(denoEnvironment, environment),
      },
    ),
  );

  console.log(`Packed consumers passed: Node 22.18.0, host ${hostNode.stdout.trim()}, and Deno`);
} finally {
  if (registry) await new Promise((resolveClose) => registry.close(resolveClose));
  await rm(temporaryRoot, { recursive: true, force: true });
}
