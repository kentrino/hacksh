import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
    "--unknown=value",
    "--",
    "--help",
  ]);
  assert(behavior.code === 0, `${label}: behavior command exited ${behavior.code}`);
  assert(
    behavior.stdout.trim() ===
      JSON.stringify({
        args: { enabled: false, repo: "owner/repo" },
        extraArgs: ["--unknown=value"],
        passthrough: ["--help"],
      }),
    `${label}: unexpected behavior output: ${behavior.stdout}${behavior.stderr}`,
  );

  const equals = await execute(["--repo=equal/repo"]);
  assert(equals.code === 0, `${label}: equals command exited ${equals.code}`);
  assert(
    JSON.parse(equals.stdout).args.repo === "equal/repo",
    `${label}: equals value was not parsed`,
  );

  const version = await execute(["--version"]);
  assert(version.code === 0 && version.stdout.trim() === "1.2.3", `${label}: version failed`);

  const missing = await execute(["--repo"]);
  assert(missing.code === 1, `${label}: missing value exited ${missing.code}`);
  assert(missing.stderr.includes("--repo: requires a value"), `${label}: missing error absent`);
  assert(missing.stderr.includes("USAGE packed-consumer"), `${label}: usage absent`);
}

function consumerSource(zodSpecifier, zittySpecifier) {
  return `
import { z } from ${JSON.stringify(zodSpecifier)};
import { defineCommand, runMain } from ${JSON.stringify(zittySpecifier)};
const command = defineCommand({
  name: "packed-consumer",
  version: "1.2.3",
  args: z.object({
    enabled: z.boolean().default(true),
    repo: z.string().optional(),
  }),
  alias: { repo: ["R", "Q"] },
  run({ args, extraArgs, passthrough }) {
    console.log(JSON.stringify({ args, extraArgs, passthrough }));
  },
});
await runMain(command);
`;
}

let registry;
try {
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
  await writeFile(join(nodeDirectory, "consumer.mjs"), consumerSource("zod", "zitty"));
  await runChecked(
    "npm",
    ["install", "--ignore-scripts", "--no-package-lock", archivePath, "zod@^4"],
    { cwd: nodeDirectory },
  );
  await verifyConsumer("Node", (args) =>
    run(process.execPath, ["consumer.mjs", ...args], { cwd: nodeDirectory }),
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
    consumerSource("npm:zod@4", `npm:zitty@${packageJson.version}`),
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

  console.log("Packed consumers passed: Node and Deno");
} finally {
  if (registry) await new Promise((resolveClose) => registry.close(resolveClose));
  await rm(temporaryRoot, { recursive: true, force: true });
}
