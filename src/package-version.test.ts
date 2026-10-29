import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { defineCommand, runCommand, runMain } from "./index.ts";
import type { PrintEvent, Printer } from "./printer-api.ts";
import { findPackageVersion } from "./package-version.ts";

let root: string;
const originalArgv = process.argv;
const originalExitCode = process.exitCode;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "hacksh-version-"));
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "tool", version: "2.3.4" }));
  await mkdir(join(root, "dist", "bin"), { recursive: true });
  await writeFile(join(root, "dist", "package.json"), JSON.stringify({ type: "module" }));
  await writeFile(join(root, "dist", "bin", "cli.js"), "");
});

afterEach(async () => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  await rm(root, { recursive: true, force: true });
});

describe("findPackageVersion", () => {
  it("uses the nearest ancestor package.json that declares a version", async () => {
    await expect(findPackageVersion(join(root, "dist", "bin", "cli.js"))).resolves.toBe("2.3.4");
  });

  it("follows symlinks to the real executable", async () => {
    const bin = join(root, "node_modules", ".bin");
    await mkdir(bin, { recursive: true });
    await writeFile(join(root, "node_modules", "package.json"), "{");
    await symlink(join(root, "dist", "bin", "cli.js"), join(bin, "tool"));
    await expect(findPackageVersion(join(bin, "tool"))).resolves.toBe("2.3.4");
  });

  it("returns undefined without a resolvable executable", async () => {
    await expect(findPackageVersion(undefined)).resolves.toBeUndefined();
    await expect(findPackageVersion(join(root, "missing.js"))).resolves.toBeUndefined();
  });
});

describe("version fallback", () => {
  function capture(): { events: PrintEvent[]; printer: Printer } {
    const events: PrintEvent[] = [];
    return { events, printer: { print: (event) => void events.push(event) } };
  }

  it("prints the executable's package version when the root has none", async () => {
    process.argv = [process.execPath, join(root, "dist", "bin", "cli.js")];
    const { events, printer } = capture();
    await runMain(defineCommand({ name: "tool" }), { argv: ["--version"], printer });
    expect(events).toEqual([{ type: "version", version: "2.3.4" }]);
  });

  it("prefers the declared version", async () => {
    process.argv = [process.execPath, join(root, "dist", "bin", "cli.js")];
    const { events, printer } = capture();
    await runMain(defineCommand({ name: "tool", version: "9.9.9" }), {
      argv: ["--version"],
      printer,
    });
    expect(events).toEqual([{ type: "version", version: "9.9.9" }]);
  });

  it("does not search the filesystem from runCommand", async () => {
    process.argv = [process.execPath, join(root, "dist", "bin", "cli.js")];
    const { events, printer } = capture();
    await runCommand(defineCommand({ name: "tool" }), ["--version"], { printer });
    expect(events).toEqual([{ type: "version", version: "" }]);
  });
});
