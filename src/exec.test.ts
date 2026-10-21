import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { getEventListeners } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { summarizeError } from "./errors.ts";
import { createExec, type ExecContext } from "./exec.ts";
import {
  defineCommand,
  HackshExecError,
  runCommand,
  type ExecPrintEvent,
  type ExecResult,
} from "./index.ts";
import { TerminalLock } from "./terminal.ts";

const node = process.execPath;

function createTestExec(env?: ExecContext["env"]): ReturnType<typeof createExec> {
  return createExec({
    env,
    mode: { format: "pretty", interactive: false },
    print: () => undefined,
    terminal: new TerminalLock(),
    signal: new AbortController().signal,
  });
}

const exec = createTestExec();
const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "hacksh-exec-"));
  temporaryDirectories.push(path);
  return path;
}

function script(code: string, ...args: string[]): readonly string[] {
  return ["-e", code, ...args];
}

const printPidThenWait = `process.stderr.write(String(process.pid)); setInterval(() => {}, 1000);`;

function expectGone(pid: number): void {
  expect(Number.isInteger(pid) && pid > 0).toBe(true);
  expect(() => process.kill(pid, 0)).toThrow(expect.objectContaining({ code: "ESRCH" }));
}

async function rejection(promise: Promise<unknown>): Promise<HackshExecError> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(HackshExecError);
  return error as HackshExecError;
}

describe("exec arguments and environment", () => {
  it("passes arguments verbatim without a shell", async () => {
    const args = ["with space", 'double"quote', "it's", "$HOME", ";", "|", "*", ""];
    const result = await exec(
      node,
      script("process.stdout.write(JSON.stringify(process.argv.slice(1)))", ...args),
    );
    expect(JSON.parse(result.stdout)).toEqual(args);
  });

  it("runs in the requested cwd and reports it in the command", async () => {
    const cwd = await temporaryDirectory();
    const result = await exec(node, script("process.stdout.write(process.cwd())"), { cwd });
    expect(realpathSync(result.stdout)).toBe(realpathSync(cwd));
    expect(result.command).toEqual({
      file: node,
      args: ["-e", "process.stdout.write(process.cwd())"],
      cwd,
    });
  });

  const printEnv = script(
    "const { BASE, ADDED, DROPPED, INHERITED } = process.env;" +
      "process.stdout.write(JSON.stringify({ BASE, ADDED, DROPPED, INHERITED }))",
  );

  it("sets, overrides, and deletes variables on top of the invocation environment", async () => {
    vi.stubEnv("INHERITED", "from-process");
    const bound = createTestExec({ BASE: "base", DROPPED: "present", ADDED: undefined });
    const result = await bound(node, printEnv, {
      env: { BASE: "override", ADDED: "added", DROPPED: undefined },
    });
    expect(JSON.parse(result.stdout)).toEqual({ BASE: "override", ADDED: "added" });

    const untouched = await bound(node, printEnv);
    expect(JSON.parse(untouched.stdout)).toEqual({ BASE: "base", DROPPED: "present" });
  });

  it("inherits the process environment without a base environment", async () => {
    vi.stubEnv("INHERITED", "from-process");
    vi.stubEnv("DROPPED", "from-process");
    const inherited = await exec(node, printEnv);
    expect(JSON.parse(inherited.stdout)).toEqual({
      INHERITED: "from-process",
      DROPPED: "from-process",
    });
    const overridden = await exec(node, printEnv, { env: { ADDED: "1", DROPPED: undefined } });
    expect(JSON.parse(overridden.stdout)).toEqual({ INHERITED: "from-process", ADDED: "1" });
  });

  it("writes input to stdin and leaves stdin empty otherwise", async () => {
    const echo = script(
      "let text = ''; process.stdin.on('data', (c) => (text += c)).on('end', () => process.stdout.write('[' + text.toUpperCase() + ']'))",
    );
    expect((await exec(node, echo, { input: "hello\nworld" })).stdout).toBe("[HELLO\nWORLD]");
    expect((await exec(node, echo)).stdout).toBe("[]");
  });

  it("ignores input the child never reads", async () => {
    const result = await exec(node, script("process.exit(0)"), { input: "x".repeat(1_000_000) });
    expect(result.status).toBe("succeeded");
  });

  it("captures stdout and stderr separately and strips one final newline", async () => {
    const result = await exec(
      node,
      script("process.stdout.write('out\\n\\n'); process.stderr.write('err\\r\\n')"),
    );
    expect(result).toEqual({
      status: "succeeded",
      command: expect.objectContaining({ file: node }),
      stdout: "out\n",
      stderr: "err",
      exitCode: 0,
    });
  });
});

describe("exec failures", () => {
  it("reports a non-zero exit as a result and as an error", async () => {
    const code =
      "process.stdout.write('secret' + '-out'); process.stderr.write('secret' + '-err'); process.exit(3)";
    const result = await exec(node, script(code), { reject: false });
    expect(result).toMatchObject({
      status: "failed",
      reason: "exit-code",
      exitCode: 3,
      stdout: "secret-out",
      stderr: "secret-err",
    });

    const error = await rejection(exec(node, script(code)));
    expect(error.name).toBe("HackshExecError");
    expect(error.message).toContain("exit code 3");
    expect(error.message).toContain(JSON.stringify(code));
    expect(error.message).not.toContain("secret-out");
    expect(error.message).not.toContain("secret-err");
    expect(error.result).toMatchObject({ reason: "exit-code", exitCode: 3, stdout: "secret-out" });
  });

  it("reports a missing executable as a spawn failure", async () => {
    const result = await exec("hacksh-missing-executable", ["a b"], { reject: false });
    expect(result).toMatchObject({ status: "failed", reason: "spawn", stdout: "", stderr: "" });
    if (result.status === "failed" && result.reason === "spawn") {
      expect(result.error).toMatchObject({ code: "ENOENT" });
    }

    const error = await rejection(exec("hacksh-missing-executable", ["a b"]));
    expect(error.message).toContain("ENOENT");
    expect(error.message).toContain('hacksh-missing-executable "a b"');
    expect(error.result.reason).toBe("spawn");
    if (error.result.reason === "spawn") expect(error.cause).toBe(error.result.error);
  });

  it("reports a missing cwd as a spawn failure", async () => {
    const cwd = join(await temporaryDirectory(), "missing");
    const result = await exec(node, script(""), { cwd, reject: false });
    expect(result).toMatchObject({ status: "failed", reason: "spawn" });
    expect((await rejection(exec(node, script(""), { cwd }))).result.reason).toBe("spawn");
  });

  it.each(["SIGTERM", "SIGKILL"])(
    "reports a child killed by %s as a signal failure",
    async (signal) => {
      const code = `process.kill(process.pid, ${JSON.stringify(signal)}); setInterval(() => {}, 1000)`;
      const result = await exec(node, script(code), { reject: false });
      expect(result).toMatchObject({ status: "failed", reason: "signal", signal });

      const error = await rejection(exec(node, script(code)));
      expect(error.message).toContain(signal);
      expect(error.result).toMatchObject({ reason: "signal", signal });
    },
  );

  it("does not expose child output in the error summary", async () => {
    const error = await rejection(
      exec(
        node,
        script(
          "process.stdout.write('leak' + '-out'); process.stderr.write('leak' + '-err'); process.exit(1)",
        ),
      ),
    );
    expect(Object.keys(error)).not.toContain("result");
    const summary = JSON.stringify(summarizeError(error));
    expect(summary).not.toContain("leak-out");
    expect(summary).not.toContain("leak-err");
    expect(summarizeError(error)).toMatchObject({ kind: "error", name: "HackshExecError" });
  });
});

describe("exec programming errors", () => {
  const cases: [string, unknown, unknown, unknown][] = [
    ["empty file", "", [], {}],
    ["non-string file", 1, [], {}],
    ["NUL in file", "no\0de", [], {}],
    ["non-array args", node, "arg", {}],
    ["non-string arg", node, [1], {}],
    ["NUL in arg", node, ["a\0"], {}],
    ["non-object options", node, [], "options"],
    ["empty cwd", node, [], { cwd: "" }],
    ["non-string cwd", node, [], { cwd: 1 }],
    ["NUL in cwd", node, [], { cwd: "/tmp\0" }],
    ["non-string input", node, [], { input: 1 }],
    ["non-boolean reject", node, [], { reject: "false" }],
    ["non-object env", node, [], { env: "A=1" }],
    ["non-string env value", node, [], { env: { A: 1 } }],
    ["NUL in env value", node, [], { env: { A: "a\0" } }],
    ["empty env key", node, [], { env: { "": "a" } }],
    ["= in env key", node, [], { env: { "A=B": "a" } }],
    ["NUL in env key", node, [], { env: { "A\0": "a" } }],
    ["zero timeout", node, [], { timeout: 0 }],
    ["fractional timeout", node, [], { timeout: 1.5 }],
    ["zero maxBuffer", node, [], { maxBuffer: 0 }],
    ["negative forceKillAfterDelay", node, [], { forceKillAfterDelay: -1 }],
    ["non-AbortSignal signal", node, [], { signal: {} }],
    ["unknown option", node, [], { rejct: false }],
    ["unknown option next to a valid one", node, [], { cwd: ".", dryrun: true }],
    ["dryRun is not a boolean", node, [], { dryRun: "yes" }],
    [
      "input combined with inherited stdin during dry-run",
      node,
      [],
      { input: "x", stdin: "inherit", dryRun: true },
    ],
    ["stdin is not pipe or inherit", node, [], { stdin: "input" }],
    ["stdout is not pipe or inherit", node, [], { stdout: "ignore" }],
    ["stderr is not pipe or inherit", node, [], { stderr: true }],
    ["interactive is not a boolean", node, [], { interactive: "yes" }],
    ["display is not a boolean", node, [], { display: 0 }],
    ["redact is not an array", node, [], { redact: "secret" }],
    ["redact contains an empty string", node, [], { redact: [""] }],
    ["redact contains a non-string", node, [], { redact: [1] }],
    ["redact contains NUL", node, [], { redact: ["a\0"] }],
    ["input combined with inherited stdin", node, [], { input: "x", stdin: "inherit" }],
  ];

  it.each(cases)(
    "rejects %s with TypeError and spawns nothing",
    async (_name, file, args, options) => {
      const marker = join(await temporaryDirectory(), "spawned");
      const spawnArgs =
        Array.isArray(args) && args.length === 0
          ? script(`require('node:fs').writeFileSync(${JSON.stringify(marker)}, '')`)
          : args;
      const call = createTestExec() as (...input: unknown[]) => Promise<ExecResult>;
      const effective =
        typeof options === "object" && options !== null ? { reject: false, ...options } : options;
      await expect(call(file, spawnArgs, effective)).rejects.toBeInstanceOf(TypeError);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(existsSync(marker)).toBe(false);
    },
  );
});

describe("exec termination", () => {
  it("stops at maxBuffer with truncated output", async () => {
    const result = await exec(
      node,
      script(
        `process.stderr.write(String(process.pid)); const chunk = 'x'.repeat(65536); const write = () => process.stdout.write(chunk, write); write();`,
      ),
      { maxBuffer: 1000, reject: false },
    );
    expect(result).toMatchObject({ status: "failed", reason: "output-limit" });
    expect(result.stdout).toBe("x".repeat(1000));
    expectGone(Number(result.stderr));

    const error = await rejection(
      exec(node, script("process.stdout.write('y'.repeat(5000))"), { maxBuffer: 10 }),
    );
    expect(error.message).toContain("10 bytes");
    expect(error.result.stdout).toBe("y".repeat(10));
  });

  it("keeps output that is exactly maxBuffer bytes", async () => {
    const result = await exec(node, script("process.stdout.write('z'.repeat(10))"), {
      maxBuffer: 10,
    });
    expect(result.stdout).toBe("z".repeat(10));
  });

  it("terminates a child that outlives the timeout", async () => {
    const result = await exec(node, script(printPidThenWait), { timeout: 300, reject: false });
    expect(result).toMatchObject({ status: "failed", reason: "timeout" });
    expectGone(Number(result.stderr));

    const error = await rejection(exec(node, script(printPidThenWait), { timeout: 300 }));
    expect(error.message).toContain("timed out after 300 ms");
  });

  it("does not spawn when the signal is already aborted", async () => {
    const marker = join(await temporaryDirectory(), "spawned");
    const signal = AbortSignal.abort();
    const result = await exec(
      node,
      script(`require('node:fs').writeFileSync(${JSON.stringify(marker)}, '')`),
      { signal, reject: false },
    );
    expect(result).toMatchObject({ status: "failed", reason: "aborted", stdout: "", stderr: "" });
    expect((await rejection(exec(node, [], { signal }))).result.reason).toBe("aborted");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(existsSync(marker)).toBe(false);
    expect(getEventListeners(signal, "abort")).toHaveLength(0);
  });

  it("terminates the child when the signal aborts mid-run", async () => {
    const controller = new AbortController();
    const pending = exec(node, script(printPidThenWait), {
      signal: controller.signal,
      reject: false,
    });
    setTimeout(() => controller.abort(), 300);
    const result = await pending;
    expect(result).toMatchObject({ status: "failed", reason: "aborted" });
    expectGone(Number(result.stderr));
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  });

  it("removes the abort listener after a normal exit", async () => {
    const controller = new AbortController();
    await exec(node, script(""), { signal: controller.signal });
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  });

  it("sends SIGKILL after forceKillAfterDelay when SIGTERM is ignored", async () => {
    const startedAt = Date.now();
    const result = await exec(
      node,
      script(`process.on('SIGTERM', () => {}); ${printPidThenWait}`),
      { timeout: 300, forceKillAfterDelay: 100, reject: false },
    );
    expect(result).toMatchObject({ status: "failed", reason: "timeout" });
    expect(Date.now() - startedAt).toBeLessThan(3_000);
    expectGone(Number(result.stderr));
  });

  it("settles after a timeout while a grandchild holds the pipes", async () => {
    const grandchild = `setTimeout(() => {}, 10000)`;
    const code =
      `const { spawn } = require('node:child_process');` +
      `const child = spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { stdio: 'inherit' });` +
      `process.stderr.write(JSON.stringify([process.pid, child.pid]));` +
      `setInterval(() => {}, 1000);`;
    const startedAt = Date.now();
    const result = await exec(node, script(code), { timeout: 500, reject: false });
    const [pid, grandchildPid] = JSON.parse(result.stderr) as [number, number];
    try {
      expect(result).toMatchObject({ status: "failed", reason: "timeout" });
      expect(Date.now() - startedAt).toBeLessThan(5_000);
      expectGone(pid);
    } finally {
      process.kill(grandchildPid, "SIGKILL");
    }
  });
});

describe("context exec", () => {
  it("is available on the run context through runCommand", async () => {
    const command = defineCommand({
      async run({ exec }) {
        const { stdout } = await exec(node, script("process.stdout.write('from child\\n')"));
        return stdout;
      },
    });
    await expect(
      runCommand(command, [], { output: "json", stderr: { write: () => undefined } }),
    ).resolves.toBe("from child");
  });

  it("binds each invocation to its own env option", async () => {
    const command = defineCommand({
      async run({ exec }) {
        const { stdout } = await exec(
          node,
          script("setTimeout(() => process.stdout.write(process.env.INVOCATION ?? 'unset'), 100)"),
        );
        return stdout;
      },
    });
    const results = await Promise.all([
      runCommand(command, [], {
        output: "json",
        env: { INVOCATION: "first" },
        stderr: { write: () => undefined },
      }),
      runCommand(command, [], {
        output: "json",
        env: { INVOCATION: "second" },
        stderr: { write: () => undefined },
      }),
    ]);
    expect(results).toEqual(["first", "second"]);
  });

  it("propagates a thrown HackshExecError from runCommand", async () => {
    const command = defineCommand({
      async run({ exec }) {
        await exec(node, script("process.exit(7)"));
      },
    });
    const error = await rejection(
      runCommand(command, [], { output: "json", stderr: { write: () => undefined } }),
    );
    expect(error.result).toMatchObject({ reason: "exit-code", exitCode: 7 });
  });

  it("terminates the child when the invocation signal aborts", async () => {
    const invocation = new AbortController();
    const own = new AbortController();
    const command = defineCommand({
      run: ({ exec }) => exec(node, script(printPidThenWait), { signal: own.signal }),
    });
    const pending = runCommand(command, [], {
      output: "json",
      stderr: { write: () => undefined },
      signal: invocation.signal,
    });
    setTimeout(() => invocation.abort(), 300);
    const error = await rejection(pending);
    expect(error.result.reason).toBe("aborted");
    expectGone(Number(error.result.stderr));
    expect(getEventListeners(invocation.signal, "abort")).toHaveLength(0);
    expect(getEventListeners(own.signal, "abort")).toHaveLength(0);
  });
});

describe("exec dry-run", () => {
  function boundExec(options?: {
    signal?: AbortSignal;
    events?: ExecPrintEvent[];
    interactive?: boolean;
  }) {
    return createExec({
      env: undefined,
      mode: { format: "pretty", interactive: options?.interactive ?? false },
      print: (event) => void options?.events?.push(event),
      terminal: new TerminalLock(),
      signal: options?.signal ?? new AbortController().signal,
    });
  }

  it("fetches state, branches on failure, and dry-runs only the later write", async () => {
    const directory = await temporaryDirectory();
    const target = join(directory, "target");
    writeFileSync(target, "main\n");
    const events: ExecPrintEvent[] = [];
    const bound = boundExec({ events });
    const fetched = await bound(
      node,
      script(
        `process.stdout.write(require("node:fs").readFileSync(${JSON.stringify(target)}, "utf8").trim()); process.exit(1)`,
      ),
      { reject: false },
    );
    expect(fetched).toMatchObject({
      status: "failed",
      reason: "exit-code",
      exitCode: 1,
      stdout: "main",
    });
    if (fetched.status !== "failed") return;

    const secret = "s3cret";
    const write = `require("node:fs").writeFileSync(${JSON.stringify(target)}, "changed\\n")`;
    const skipped = await bound(node, script(write, `--token=${secret}`), {
      dryRun: true,
      cwd: directory,
      input: "not-written",
      redact: [secret],
      stdout: "inherit",
      interactive: true,
    });
    expect(skipped).toEqual({
      status: "skipped",
      command: {
        file: node,
        args: script(write, "--token=***"),
        cwd: directory,
      },
    });
    expect(skipped).not.toHaveProperty("stdout");
    expect(skipped).not.toHaveProperty("stderr");
    expect(skipped).not.toHaveProperty("exitCode");
    expect(readFileSync(target, "utf8")).toBe("main\n");
    expect(events.map((event) => event.phase)).toEqual(["start", "skip"]);
    expect(events[1]).toEqual({
      type: "exec",
      phase: "skip",
      command: skipped.command,
      stdio: { stdin: "input", stdout: "inherit", stderr: "pipe" },
      interactive: true,
    });
  });

  it("writes the target when the same call is not a dry-run", async () => {
    const directory = await temporaryDirectory();
    const target = join(directory, "target");
    writeFileSync(target, "main\n");
    const write = `require("node:fs").writeFileSync(${JSON.stringify(target)}, "changed\\n")`;
    const ran = await boundExec()(node, script(write), { dryRun: false, cwd: directory });
    expect(ran).toMatchObject({ status: "succeeded", stdout: "", stderr: "" });
    expect(readFileSync(target, "utf8")).toBe("changed\n");
  });

  it("returns a skip for both reject settings and hides it when display is false", async () => {
    const directory = await temporaryDirectory();
    const marker = join(directory, "spawned");
    const events: ExecPrintEvent[] = [];
    const bound = boundExec({ events });
    const args = script(`require("node:fs").writeFileSync(${JSON.stringify(marker)}, "x")`);
    await expect(bound(node, args, { dryRun: true, reject: true })).resolves.toMatchObject({
      status: "skipped",
    });
    await expect(bound(node, args, { dryRun: true, reject: false })).resolves.toMatchObject({
      status: "skipped",
    });
    events.length = 0;
    const hidden = await bound(node, args, { dryRun: true, display: false });
    expect(hidden.status).toBe("skipped");
    expect(events).toEqual([]);
    expect(existsSync(marker)).toBe(false);
  });

  it("fails as aborted before a skip when the signal is already aborted", async () => {
    const directory = await temporaryDirectory();
    const marker = join(directory, "spawned");
    const args = script(`require("node:fs").writeFileSync(${JSON.stringify(marker)}, "x")`);
    const events: ExecPrintEvent[] = [];
    const invocation = new AbortController();
    invocation.abort();
    const bound = boundExec({ events, signal: invocation.signal });
    const thrown = await rejection(
      bound(node, args, { dryRun: true, stdout: "inherit", interactive: true }),
    );
    expect(thrown.result).toMatchObject({
      status: "failed",
      reason: "aborted",
      stdout: "",
      stderr: "",
    });
    const returned = await bound(node, args, { dryRun: true, reject: false });
    expect(returned).toMatchObject({ status: "failed", reason: "aborted" });
    expect(returned).not.toMatchObject({ status: "skipped" });
    const own = new AbortController();
    own.abort();
    const fresh = boundExec({ events });
    const fromOption = await fresh(node, args, { dryRun: true, reject: false, signal: own.signal });
    expect(fromOption).toMatchObject({ status: "failed", reason: "aborted" });
    expect(events).toEqual([]);
    expect(existsSync(marker)).toBe(false);
  });
});
