import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { describe, expect, it } from "vite-plus/test";

describe("real process behavior", () => {
  it("exits zero after a successful command", () => {
    const result = spawnSync(process.execPath, ["src/fixtures/exit-cli.ts", "--count", "3"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("3\n");
    expect(result.stderr).toBe("");
  });

  it("prints help to stdout and exits zero", () => {
    const result = spawnSync(process.execPath, ["src/fixtures/exit-cli.ts", "--help"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("USAGE exit-fixture [OPTIONS]");
    expect(result.stderr).toBe("");
  });

  it("exits one and prints validation details plus usage", () => {
    const result = spawnSync(process.execPath, ["src/fixtures/exit-cli.ts", "--count", "bad"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Invalid arguments:");
    expect(result.stderr).toContain("--count:");
    expect(result.stderr).toContain("USAGE exit-fixture [OPTIONS]");
  });

  it("leaves invalid output configuration to the runtime without executing or JSON reporting", () => {
    const result = spawnSync(process.execPath, ["src/fixtures/exit-cli.ts", "--count", "3"], {
      encoding: "utf8",
      env: { ...process.env, HACKSH_OUTPUT: "JSON" },
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/^TypeError:/m);
    expect(result.stderr).not.toContain('{"type":"error"');
  });

  async function signalFixture(args: string[], signals: NodeJS.Signals[]): Promise<number | null> {
    const child = spawn(process.execPath, ["src/fixtures/signal-cli.ts", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const exited = once(child, "exit");
    const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
    await lines.next();
    for (const signal of signals) {
      child.kill(signal);
      await lines.next();
    }
    const [code] = (await exited) as [number | null];
    return code;
  }

  it.each([
    ["SIGINT", 130],
    ["SIGTERM", 143],
  ] as const)("exits %i after %s aborts the invocation", async (signal, code) => {
    await expect(signalFixture([], [signal])).resolves.toBe(code);
  });

  it("exits on a second SIGINT when run ignores the abort", async () => {
    await expect(signalFixture(["--ignore-abort"], ["SIGINT", "SIGINT"])).resolves.toBe(130);
  });
});
