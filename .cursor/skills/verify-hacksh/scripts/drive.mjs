#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import process from "node:process";

const skillDirectory = resolve(import.meta.dirname, "..");
const repository = resolve(skillDirectory, "../../..");
const workRoot = join(repository, "verify-hacksh.local");

function usage(message) {
  if (message) process.stderr.write(`drive: ${message}\n`);
  process.stderr.write(
    "usage: drive.mjs --run <name> --label <label> [--env KEY=VALUE]... [--unset KEY]...\n" +
      "                 [--pty <steps-file>] [--columns <n>] [--timeout <ms>] [--expect-code <n>]\n" +
      "                 -- <consumer.ts> [args...]\n",
  );
  process.exit(2);
}

const argv = process.argv.slice(2);
const separator = argv.indexOf("--");
if (separator === -1) usage("missing -- before the consumer");
const options = { env: {}, unset: [], columns: 80, timeout: 10_000 };
for (let index = 0; index < separator; index += 2) {
  const [flag, value] = [argv[index], argv[index + 1]];
  if (value === undefined || index + 1 >= separator) usage(`${flag} requires a value`);
  if (flag === "--run") options.run = value;
  else if (flag === "--label") options.label = value;
  else if (flag === "--env") {
    const at = value.indexOf("=");
    if (at <= 0) usage(`--env expects KEY=VALUE, got ${value}`);
    options.env[value.slice(0, at)] = value.slice(at + 1);
  } else if (flag === "--unset") options.unset.push(value);
  else if (flag === "--pty") options.pty = resolve(value);
  else if (flag === "--columns") options.columns = Number(value);
  else if (flag === "--timeout") options.timeout = Number(value);
  else if (flag === "--expect-code") options.expectCode = Number(value);
  else usage(`unknown flag ${flag}`);
}
const [consumer, ...consumerArgs] = argv.slice(separator + 1);
if (!options.run || !options.label || !consumer)
  usage("--run, --label, and a consumer are required");
for (const name of [options.run, options.label]) {
  if (!/^[\w.-]+$/.test(name)) usage(`names may only contain letters, digits, _, ., -: ${name}`);
}

const environment = { ...process.env, NODE_NO_WARNINGS: "1" };
for (const key of ["CI", "NO_COLOR", "HACKSH_OUTPUT", ...options.unset]) delete environment[key];
Object.assign(environment, options.env);

const consumerPath = resolve(consumer);
const command = options.pty
  ? [
      "expect",
      [
        join(skillDirectory, "scripts/pty.exp"),
        String(options.columns),
        options.pty,
        process.execPath,
        consumerPath,
        ...consumerArgs,
      ],
    ]
  : [process.execPath, [consumerPath, ...consumerArgs]];

const startedAt = Date.now();
const child = spawn(command[0], command[1], {
  cwd: repository,
  env: environment,
  stdio: ["ignore", "pipe", "pipe"],
});
let stdout = "";
let stderr = "";
child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  child.kill("SIGKILL");
}, options.timeout);
const { code, signal } = await new Promise((resolveExit, reject) => {
  child.once("error", reject);
  child.once("close", (exitCode, exitSignal) =>
    resolveExit({ code: exitCode, signal: exitSignal }),
  );
});
clearTimeout(timer);

let exitCode = code;
if (options.pty) {
  const status = stdout.match(/PTY_CHILD_STATUS (\S+) (\S+) (\S+) (\S+)/);
  if (status) exitCode = Number(status[4]);
  stdout = stdout.replace(/\r?\nPTY_CHILD_STATUS .*\r?\n?$/, "\n");
}

const evidenceDirectory = join(workRoot, "evidence", options.run);
await mkdir(evidenceDirectory, { recursive: true });
const record = {
  label: options.label,
  consumer: relative(repository, consumerPath),
  args: consumerArgs,
  env: options.env,
  unset: options.unset,
  pty: options.pty ? { steps: relative(repository, options.pty), columns: options.columns } : null,
  node: process.version,
  exitCode,
  signal,
  timedOut,
  durationMs: Date.now() - startedAt,
  stdout,
  stderr,
};
const base = join(evidenceDirectory, options.label);
await writeFile(`${base}.json`, `${JSON.stringify(record, null, 2)}\n`);
await writeFile(
  `${base}.txt`,
  `$ ${[...Object.entries(options.env).map(([key, value]) => `${key}=${value}`), "node", record.consumer, ...consumerArgs].join(" ")}\n` +
    `exit: ${exitCode}${timedOut ? " (timed out)" : ""}\n--- stdout ---\n${stdout}--- stderr ---\n${stderr}`,
);

process.stdout.write(
  `${options.label}: exit ${exitCode}${timedOut ? " (timed out)" : ""} -> ${relative(repository, base)}.{json,txt}\n` +
    `--- stdout ---\n${stdout}--- stderr ---\n${stderr}`,
);
if (timedOut) process.exit(124);
if (options.expectCode !== undefined && exitCode !== options.expectCode) {
  process.stderr.write(`drive: expected exit ${options.expectCode}, got ${exitCode}\n`);
  process.exit(1);
}
