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
    const child = spawn(command, args, {
      cwd: options.cwd ?? repository,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolveRun({ code, stdout, stderr }));
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
    missing.stderr.includes("CUSTOM\nPublic command (visible)") &&
      missing.stderr.includes("USAGE visible"),
    `${label}: visible usage absent: ${missing.stderr}`,
  );

  const version = await execute(["--version"]);
  assert(version.code === 0 && version.stdout.trim() === "1.2.3", `${label}: version failed`);

  const parentHelp = await execute(["--help"]);
  assert(parentHelp.code === 0, `${label}: parent help exited ${parentHelp.code}`);
  assert(
    parentHelp.stdout.includes("CUSTOM\npacked-consumer v1.2.3") &&
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
      directHelp.stdout.includes(`CUSTOM\nInternal ${flavor} command (${commandName})`) &&
        directHelp.stdout.includes(`USAGE ${commandName} [OPTIONS]`) &&
        directHelp.stdout.includes("--mode=<MODE>  Execution mode (Choices: fast, safe)") &&
        directHelp.stdout.includes("--no-enabled  Disable feature"),
      `${label}: ${commandName} direct help was unavailable: ${directHelp.stdout}`,
    );
    assert(directHelp.stderr === "", `${label}: ${commandName} help wrote to stderr`);
  }

  const unknown = await execute(["missing"]);
  assert(unknown.code === 1, `${label}: unknown command exited ${unknown.code}`);
  assert(
    unknown.stderr.includes("Unknown command `missing`") &&
      unknown.stderr.includes("CUSTOM\npacked-consumer v1.2.3") &&
      unknown.stderr.includes("visible  Public command") &&
      !unknown.stderr.includes("zod-hidden") &&
      !unknown.stderr.includes("mini-hidden") &&
      !unknown.stderr.includes("Internal zod"),
    `${label}: unknown-command usage exposed hidden commands: ${unknown.stderr}`,
  );

  for (const environmentName of ["NO_COLOR", "CI"]) {
    const plainHelp = await execute(["--help"], { [environmentName]: "1" });
    assert(plainHelp.code === 0, `${label}: ${environmentName} help exited ${plainHelp.code}`);
    assert(
      !plainHelp.stdout.includes(`${String.fromCharCode(27)}[`),
      `${label}: ${environmentName} help used ANSI`,
    );
  }
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
  ZittyValidationError,
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
    "--no-enabled  Disable feature",
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
    if (!(error instanceof ZittyValidationError) || !error.message.includes(token.split("=")[0])) {
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
    enabled: { negatedDescription: "Disable feature" },
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
    enabled: { negatedDescription: "Disable feature" },
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
      enabled: { negatedDescription: "Disable feature" },
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
const legacyCommand = defineCommand({
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
const command = defineCommand({
  name: "packed-consumer",
  version: "1.2.3",
  subCommands: {
    visible: defineCommand({ ...legacyCommand, description: "Public command" }),
    "zod-hidden": zodHidden,
    "mini-hidden": miniHidden,
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
  output: "pretty",
  async showUsage(selected, { write }) {
    await write("CUSTOM\\n" + await renderUsage(selected));
  },
});
await main();
`;
}

function typeConsumerSource() {
  return `
import { z } from "zod";
import * as mini from "zod/mini";
import {
  createMain,
  defineCommand,
  parseArgs,
  renderUsage,
  showUsage,
  type ArgOptions,
  type ArgOptionsMap,
  type CommandDef,
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
  enabled: { negatedDescription: "Disable feature" },
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
  enabled: { negatedDescription: "Disable feature" },
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
];
`;
}

let registry;
try {
  const configuredNode = process.env.ZITTY_MINIMUM_NODE;
  assert(
    !configuredNode || isAbsolute(configuredNode),
    "ZITTY_MINIMUM_NODE must be an absolute path to a Node 22.18.0 executable",
  );
  const minimumNodeExecutable = configuredNode ?? process.execPath;
  const minimumNode = await run(minimumNodeExecutable, ["--version"]);
  assert(
    minimumNode.code === 0 && minimumNode.stdout.trim() === "v22.18.0",
    `Packed consumer tests require Node 22.18.0, got ${minimumNode.stdout.trim() || minimumNode.stderr.trim() || `exit ${minimumNode.code}`}. Run pnpm under Node 22.18.0 or set ZITTY_MINIMUM_NODE=/absolute/path/to/node.`,
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
  await verifyConsumer("Node", (args, environment = {}) =>
    run(minimumNodeExecutable, ["consumer.mjs", ...args], {
      cwd: nodeDirectory,
      env: { ...minimumNodeEnvironment, ...environment },
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
  await verifyConsumer("Deno", (args, environment = {}) =>
    run("deno", ["run", "--node-modules-dir=auto", "consumer.mjs", ...args], {
      cwd: denoDirectory,
      env: { ...denoEnvironment, ...environment },
    }),
  );

  console.log("Packed consumers passed: Node 22.18.0 and Deno");
} finally {
  if (registry) await new Promise((resolveClose) => registry.close(resolveClose));
  await rm(temporaryRoot, { recursive: true, force: true });
}
