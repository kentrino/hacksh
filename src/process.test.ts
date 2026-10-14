import { spawnSync } from "node:child_process";
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
});
