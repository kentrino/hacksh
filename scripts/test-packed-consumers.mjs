import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import process from "node:process";

const repository = resolve(import.meta.dirname, "..");
const temporaryRoot = await mkdtemp(join(tmpdir(), "zitty-packed-consumers-"));

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
  const behavior = await execute([
    "--no-enabled",
    "-Qowner/repo",
    "one",
    "two",
    "--unknown=value",
    "--",
    "--help",
  ]);
  assert(behavior.code === 0, `${label}: behavior command exited ${behavior.code}`);
  assert(
    behavior.stdout.trim() ===
      JSON.stringify({
        cmd: "packed-consumer",
        args: { enabled: false, repo: "owner/repo", files: ["ONE", "TWO"] },
        extraArgs: ["--unknown=value"],
        passthrough: ["--help"],
      }),
    `${label}: unexpected behavior output: ${behavior.stdout}${behavior.stderr}`,
  );

  const equals = await execute(["--repo=equal/repo"]);
  assert(equals.code === 0, `${label}: equals command exited ${equals.code}`);
  assert(
    JSON.parse(equals.stdout).args.repo === "equal/repo" &&
      JSON.parse(equals.stdout).args.files.length === 0,
    `${label}: equals value or empty variadic was not parsed`,
  );

  const version = await execute(["--version"]);
  assert(version.code === 0 && version.stdout.trim() === "1.2.3", `${label}: version failed`);

  const inlineBoolean = await execute(["--enabled=false"]);
  assert(inlineBoolean.code === 1, `${label}: inline boolean exited ${inlineBoolean.code}`);
  assert(
    inlineBoolean.stderr.includes("--enabled:"),
    `${label}: inline boolean validation error absent`,
  );

  const missing = await execute(["--repo"]);
  assert(missing.code === 1, `${label}: missing value exited ${missing.code}`);
  assert(missing.stderr.includes("--repo: requires a value"), `${label}: missing error absent`);
  assert(
    missing.stderr.includes("CUSTOM\npacked-consumer v1.2.3") &&
      missing.stderr.includes("USAGE packed-consumer"),
    `${label}: usage absent: ${missing.stderr}`,
  );

  const help = await execute(["--help"]);
  assert(help.code === 0, `${label}: help exited ${help.code}`);
  assert(
    help.stdout.includes("CUSTOM\npacked-consumer v1.2.3") &&
      help.stdout.includes("USAGE packed-consumer"),
    `${label}: custom help absent`,
  );
  assert(help.stderr === "", `${label}: help wrote to stderr`);
}

function consumerSource(zodSpecifier, miniSpecifier, zittySpecifier) {
  return `
import { z } from ${JSON.stringify(zodSpecifier)};
import * as mini from ${JSON.stringify(miniSpecifier)};
import {
  createMain,
  defineCommand,
  parseArgs,
  renderUsage,
  showUsage,
} from ${JSON.stringify(zittySpecifier)};
const command = defineCommand({
  name: "packed-consumer",
  version: "1.2.3",
  args: z.object({
    enabled: z.boolean().default(true),
    repo: z.string().optional(),
    files: z.array(z.string().transform((value) => value.toUpperCase())),
  }),
  alias: { repo: ["R", "Q"] },
  variadic: "files",
  run({ cmd, args, extraArgs, passthrough }) {
    console.log(JSON.stringify({ cmd: cmd.name, args, extraArgs, passthrough }));
  },
});
const miniCommand = defineCommand({
  args: mini.object({
    value: mini._default(mini.string(), "mini"),
    rest: mini.optional(mini.array(mini.string())),
  }),
  variadic: "rest",
});
const miniArgs = await parseArgs(miniCommand, ["one", "two"]);
if (miniArgs.value !== "mini" || miniArgs.rest?.join(",") !== "one,two") {
  throw new Error("zod/mini variadic parseArgs failed");
}
const usage = await renderUsage(command);
const writes = [];
await showUsage(command, { async write(text) { writes.push(text); } });
if (writes.length !== 1 || writes[0] !== usage) throw new Error("usage APIs diverged");
const main = createMain(command, {
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
  type ShowUsageCallback,
} from "zitty";
const schema = z.object({
  count: z.coerce.number(),
  label: z.string().default("ok"),
  files: z.array(z.string()),
});
const command = defineCommand({
  args: schema,
  variadic: "files",
  run({ cmd, args }) {
    const same: import("zitty").CommandDef<typeof schema> = cmd;
    const output: { count: number; label: string; files: string[] } = args;
    return { same, output };
  },
});
const parsed: Promise<{ count: number; label: string; files: string[] }> = parseArgs(command, [
  "--count",
  "2",
  "one",
]);
const rendered: Promise<string> = renderUsage(command);
const shown: Promise<void> = showUsage(command, { write: async (_text) => {} });
const callback: ShowUsageCallback = async (selected, { write }) => write(await renderUsage(selected));
const main: (argv?: string[]) => Promise<void> = createMain(command, { showUsage: callback });
const miniCommand = defineCommand({ args: mini.object({ value: mini.string() }) });
const miniParsed: Promise<{ value: string }> = parseArgs(miniCommand, ["--value", "ok"]);
void [parsed, rendered, shown, main, miniParsed];
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
  await writeFile(join(nodeDirectory, "consumer.mjs"), consumerSource("zod", "zod/mini", "zitty"));
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
  await verifyConsumer("Node", (args) =>
    run(minimumNodeExecutable, ["consumer.mjs", ...args], {
      cwd: nodeDirectory,
      env: minimumNodeEnvironment,
    }),
  );

  const packageJson = JSON.parse(await readFile(join(repository, "package.json"), "utf8"));
  const archive = await readFile(archivePath);
  registry = createServer(async (request, response) => {
    const port = registry.address().port;
    if (request.url === "/zitty") {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          name: "zitty",
          "dist-tags": { latest: packageJson.version },
          versions: {
            [packageJson.version]: {
              name: "zitty",
              version: packageJson.version,
              type: "module",
              exports: packageJson.exports,
              peerDependencies: packageJson.peerDependencies,
              dist: {
                tarball: `http://127.0.0.1:${port}/zitty/-/${archiveName}`,
              },
            },
          },
        }),
      );
      return;
    }
    if (request.url === `/zitty/-/${archiveName}`) {
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
    consumerSource("npm:zod@4", "npm:zod@4/mini", `npm:zitty@${packageJson.version}`),
  );
  const registryUrl = `http://127.0.0.1:${registry.address().port}/`;
  const denoEnvironment = {
    ...process.env,
    DENO_DIR: join(denoDirectory, "cache"),
    NPM_CONFIG_REGISTRY: registryUrl,
  };
  await verifyConsumer("Deno", (args) =>
    run("deno", ["run", "--node-modules-dir=auto", "consumer.mjs", ...args], {
      cwd: denoDirectory,
      env: denoEnvironment,
    }),
  );

  console.log("Packed consumers passed: Node 22.18.0 and Deno");
} finally {
  if (registry) await new Promise((resolveClose) => registry.close(resolveClose));
  await rm(temporaryRoot, { recursive: true, force: true });
}
