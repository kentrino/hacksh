import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import process from "node:process";
import { consumerSource, typeConsumerSource } from "./packed-consumer-sources.mjs";

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
        command: "visible",
        args: { enabled: false, repo: "owner/repo", positionals: ["ONE", "TWO"] },
        input: {
          argv: ["--no-enabled", "-Qowner/repo", "one", "two", "--unknown=value", "--", "--help"],
          unknown: ["--unknown=value"],
          passthrough: ["--help"],
        },
      }),
    `${label}: unexpected visible behavior output: ${phaseTwoBehavior.stdout}${phaseTwoBehavior.stderr}`,
  );

  const equals = await execute(["visible", "--repo=equal/repo"]);
  assert(equals.code === 0, `${label}: equals command exited ${equals.code}`);
  assert(
    JSON.parse(equals.stdout).args.repo === "equal/repo" &&
      JSON.parse(equals.stdout).args.positionals.length === 0,
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
    missing.stderr.includes("◆  Public command (visible)") &&
      missing.stderr.includes("USAGE visible"),
    `${label}: visible usage absent: ${missing.stderr}`,
  );

  const version = await execute(["--version"]);
  assert(version.code === 0 && version.stdout.trim() === "●  1.2.3", `${label}: version failed`);

  const parentHelp = await execute(["--help"]);
  assert(parentHelp.code === 0, `${label}: parent help exited ${parentHelp.code}`);
  assert(
    parentHelp.stdout.includes("◆  packed-consumer v1.2.3") &&
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
        JSON.stringify({ flavor, command: commandName, args: { mode: "safe", enabled: false } }),
      `${label}: ${commandName} did not execute by name: ${executed.stdout}${executed.stderr}`,
    );

    const directHelp = await execute([commandName, "--help"]);
    assert(directHelp.code === 0, `${label}: ${commandName} help exited ${directHelp.code}`);
    assert(
      directHelp.stdout.includes(`◆  Internal ${flavor} command (${commandName})`) &&
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
      unknown.stderr.includes("◆  packed-consumer v1.2.3") &&
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
    assert(pretty.stdout === "", `${label}: pretty logs reached stdout: ${pretty.stdout}`);
    for (const message of [
      "trace",
      "debug",
      "info",
      "step",
      "success",
      "warning",
      "error",
      "fatal",
    ]) {
      assert(pretty.stderr.includes(message), `${label}: pretty stderr omitted ${message}`);
    }
    assert(
      !pretty.stdout.includes(`${String.fromCharCode(27)}[`) &&
        !pretty.stderr.includes(`${String.fromCharCode(27)}[`),
      `${label}: non-empty NO_COLOR did not disable color on both streams`,
    );

    const json = await execute(args, { HACKSH_OUTPUT: "json" });
    assert(json.code === 0, `${label}: ${commandName} JSON run exited ${json.code}`);
    assert(json.stdout === "", `${label}: JSON logs reached stdout: ${json.stdout}`);
    const logs = parseLines(json.stderr);
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

  const execDryRun = await execute(
    ["exec-dry-run"],
    { HACKSH_OUTPUT: "json" },
    { spawnsChildren: true },
  );
  const dryEvents = parseLines(execDryRun.stderr);
  const dryBody = JSON.parse(execDryRun.stdout);
  assert(
    execDryRun.code === 0 &&
      dryBody.branch === "skip" &&
      dryBody.fetchReason === "exit-code" &&
      dryBody.fetchExit === 2 &&
      dryBody.fetchStdout === "state" &&
      dryBody.skipped.status === "skipped" &&
      dryBody.skipped.stdout === undefined &&
      dryBody.skipped.stderr === undefined &&
      dryBody.skipped.exitCode === undefined &&
      dryBody.changed === false &&
      dryEvents.length === 2 &&
      dryEvents[0].type === "exec" &&
      dryEvents[0].phase === "start" &&
      dryEvents[1].type === "exec" &&
      dryEvents[1].phase === "skip" &&
      dryEvents[1].interactive === true &&
      dryEvents[1].stdio.stdin === "inherit" &&
      dryEvents[1].stdio.stdout === "inherit" &&
      dryEvents[1].stdio.stderr === "inherit" &&
      JSON.stringify(dryEvents[1].command) === JSON.stringify(dryBody.skipped.command),
    `${label}: dry-run did not skip only the later call: ${execDryRun.stdout}${execDryRun.stderr}`,
  );

  const execDryPretty = await execute(
    ["exec-dry-run"],
    { HACKSH_OUTPUT: "pretty", NO_COLOR: "1" },
    { spawnsChildren: true },
  );
  assert(
    execDryPretty.code === 0 &&
      execDryPretty.stderr.includes("$  ") &&
      execDryPretty.stderr.includes("#  ") &&
      !execDryPretty.stderr.includes("interactive terminal"),
    `${label}: non-interactive pretty output did not show the plan: ${execDryPretty.stdout}${execDryPretty.stderr}`,
  );

  const standalonePretty = await execute(["__standalone-help__"]);
  assert(
    standalonePretty.code === 0 &&
      standalonePretty.stdout.includes("USAGE packed-consumer") &&
      !standalonePretty.stdout.includes(`${String.fromCharCode(27)}[`),
    `${label}: standalone help did not use the explicit pretty printer`,
  );
  const standaloneJson = await execute(["__standalone-json-help__"]);
  assert(
    standaloneJson.code === 0 && JSON.parse(standaloneJson.stdout).type === "usage",
    `${label}: standalone help did not use the explicit JSON printer`,
  );
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
