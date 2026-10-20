#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const repository = resolve(import.meta.dirname, "../../../..");
const checks = [];
function check(name, run) {
  try {
    const detail = run();
    checks.push({ name, ok: true, detail });
  } catch (error) {
    checks.push({
      name,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

check("node >= 22.18 (type stripping)", () => {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 18)) throw new Error(`node ${process.version}`);
  return process.version;
});
check("dependencies installed", () => {
  for (const name of ["zod", "vite-plus"]) {
    if (!existsSync(join(repository, "node_modules", name)))
      throw new Error(`missing ${name}; run pnpm install`);
  }
  return "zod, vite-plus";
});
check("verify-hacksh.local is git-ignored", () => {
  execFileSync("git", ["check-ignore", "-q", "verify-hacksh.local/probe"], { cwd: repository });
  return "*.local";
});
check("expect available for PTY drives", () =>
  execFileSync("which", ["expect"], { encoding: "utf8" }).trim(),
);
const imported = await import(pathToFileURL(join(repository, "src/index.ts")).href).then(
  (module) => ({ ok: true, module }),
  (error) => ({ ok: false, error }),
);
check("src/index.ts loads", () => {
  if (!imported.ok) throw imported.error;
  for (const name of ["defineCommand", "runMain", "runCommand"]) {
    if (typeof imported.module[name] !== "function") throw new Error(`missing export ${name}`);
  }
  return "defineCommand, runMain, runCommand";
});
const head = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
  cwd: repository,
  encoding: "utf8",
}).trim();
const dirty = execFileSync("git", ["status", "--porcelain", "--", "src"], {
  cwd: repository,
  encoding: "utf8",
}).trim();
checks.push({
  name: "source revision",
  ok: true,
  detail: `${head}${dirty ? " + uncommitted src changes" : ""}`,
});

for (const { name, ok, detail } of checks)
  process.stdout.write(`${ok ? "ok  " : "FAIL"}  ${name}: ${detail}\n`);
process.exit(checks.every(({ ok }) => ok) ? 0 : 1);
