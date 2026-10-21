import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { summarizeError } from "./errors.ts";
import { createExec } from "./exec.ts";
import { defineCommand, HackshExecError, runCommand, type PrintEvent } from "./index.ts";
import { TerminalLock } from "./terminal.ts";

const node = process.execPath;
const temporaryDirectories: string[] = [];

class TtyInput extends PassThrough {
  readonly isTTY = true;
  isRaw = false;

  setRawMode(mode: boolean): this {
    this.isRaw = mode;
    return this;
  }
}

afterEach(async () => {
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

function markerScript(marker: string, rest = ""): readonly string[] {
  return script(`require("node:fs").writeFileSync(${JSON.stringify(marker)}, "x");${rest}`);
}

async function expectUnspawned(marker: string): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(existsSync(marker)).toBe(false);
}

async function rejection(promise: Promise<unknown>): Promise<HackshExecError> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(HackshExecError);
  return error as HackshExecError;
}

async function waitForFile(path: string): Promise<string> {
  const started = Date.now();
  for (;;) {
    if (existsSync(path)) return readFileSync(path, "utf8");
    if (Date.now() - started > 5_000) throw new Error("timed out waiting for a child to start");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function recordPrinter(events: PrintEvent[]) {
  return { print: (event: PrintEvent) => void events.push(event) };
}

function pipedInput(): PassThrough & { isTTY: false } {
  return Object.assign(new PassThrough(), { isTTY: false as const });
}

async function run(
  command: Parameters<typeof runCommand>[0],
  options: Parameters<typeof runCommand>[2] = {},
): Promise<unknown> {
  return runCommand(command, [], {
    output: "pretty",
    env: {},
    stdin: pipedInput(),
    stdout: { isTTY: false, write: () => undefined },
    stderr: { write: () => undefined },
    ...options,
  });
}

describe("exec display", () => {
  it("emits one redacted start event before the child runs", async () => {
    const directory = await temporaryDirectory();
    const marker = join(directory, "spawned");
    const events: PrintEvent[] = [];
    let releasePrint: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releasePrint = resolve;
    });
    const exec = createExec({
      env: undefined,
      mode: { format: "pretty", interactive: false },
      terminal: new TerminalLock(),
      signal: new AbortController().signal,
      print: async (event) => {
        events.push(event);
        expect(existsSync(marker)).toBe(false);
        await gate;
      },
    });

    const pending = exec(node, markerScript(marker), { cwd: directory });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(events).toEqual([
      {
        type: "exec",
        phase: "start",
        command: {
          file: node,
          args: markerScript(marker),
          cwd: directory,
        },
        stdio: { stdin: "ignore", stdout: "pipe", stderr: "pipe" },
        interactive: false,
      },
    ]);
    expect(existsSync(marker)).toBe(false);
    releasePrint();
    await expect(pending).resolves.toMatchObject({ status: "succeeded", stdout: "", stderr: "" });
    expect(existsSync(marker)).toBe(true);
  });

  it("reports the start event through a capturing printer and a JSON printer", async () => {
    const directory = await temporaryDirectory();
    const events: PrintEvent[] = [];
    const stdout: string[] = [];
    const stderr: string[] = [];
    const args = script("process.stdout.write('child-marker')");
    const command = defineCommand({
      async run({ exec }) {
        const captured = await exec(node, args, { cwd: directory, input: "hello" });
        return captured.stdout;
      },
    });

    await expect(run(command, { printer: recordPrinter(events) })).resolves.toBe("child-marker");
    expect(events).toEqual([
      {
        type: "exec",
        phase: "start",
        command: { file: node, args, cwd: directory },
        stdio: { stdin: "input", stdout: "pipe", stderr: "pipe" },
        interactive: false,
      },
    ]);

    const jsonCommand = defineCommand({
      async run({ exec }) {
        const captured = await exec(node, args);
        return captured.stdout;
      },
    });
    await expect(
      run(jsonCommand, {
        output: "json",
        stdout: { write: (text: string) => void stdout.push(text) },
        stderr: { write: (text: string) => void stderr.push(text) },
      }),
    ).resolves.toBe("child-marker");
    expect(stdout).toEqual([]);
    expect(stderr).toHaveLength(1);
    expect(JSON.parse(stderr[0]!)).toEqual({
      type: "exec",
      phase: "start",
      command: { file: node, args },
      stdio: { stdin: "ignore", stdout: "pipe", stderr: "pipe" },
      interactive: false,
    });
  });

  it("emits nothing when display is false", async () => {
    const events: PrintEvent[] = [];
    const command = defineCommand({
      async run({ exec }) {
        const result = await exec(node, script("process.stdout.write('quiet')"), {
          display: false,
        });
        return result.stdout;
      },
    });

    await expect(run(command, { printer: recordPrinter(events) })).resolves.toBe("quiet");
    expect(events).toEqual([]);
  });
});

describe("exec redaction", () => {
  it("masks the event, result, and error message while leaving child output intact", async () => {
    const directory = await temporaryDirectory();
    const secret = "s3cr3t-token";
    const longer = `${secret}-tail`;
    const cwd = join(directory, secret);
    await mkdir(cwd);
    const events: PrintEvent[] = [];
    const command = defineCommand({
      async run({ exec }) {
        await exec(
          node,
          script(
            "process.stdout.write(process.cwd() + '\\n' + process.argv.slice(1).join('\\n')); process.exit(2)",
            longer,
            secret,
          ),
          { cwd, redact: [secret, longer] },
        );
      },
    });

    const error = await rejection(run(command, { printer: recordPrinter(events) }));
    expect(error.message.startsWith("Command failed with exit code 2: ")).toBe(true);
    expect(error.message).not.toContain(secret);
    expect(error.result.stdout).toContain(secret);
    expect(error.result.stdout).toContain(longer);
    expect(JSON.stringify(error.result.command)).not.toContain(secret);
    expect(error.result.command.cwd).toBe(join(directory, "***"));
    expect(error.result.command.args).toContain("***");
    expect(error.result.command.args.join(" ")).not.toContain("***-tail");
    expect(JSON.stringify(events)).not.toContain(secret);
    expect(events[0]).toMatchObject({ type: "exec", command: error.result.command });
  });

  it("replaces a spawn error when redact is non-empty and keeps the original when it is empty", async () => {
    const directory = await temporaryDirectory();
    const secret = "s3cr3t-token";
    const events: PrintEvent[] = [];
    const missing = join(directory, secret);
    const command = defineCommand({
      async run({ exec }) {
        return exec(missing, [`--token=${secret}`], { redact: [secret], cwd: directory });
      },
    });

    const error = await rejection(run(command, { printer: recordPrinter(events) }));
    expect(error.message).toContain("ENOENT");
    expect(error.message).not.toContain(secret);
    expect(error.result).toMatchObject({ reason: "spawn", stdout: "", stderr: "" });
    expect(JSON.stringify(error.result.command)).not.toContain(secret);
    expect(JSON.stringify(events)).not.toContain(secret);
    if (error.result.reason !== "spawn") throw new Error("expected a spawn failure");
    expect(error.cause).toBe(error.result.error);
    const spawnError = error.result.error as NodeJS.ErrnoException & { spawnargs?: string[] };
    expect(spawnError.code).toBe("ENOENT");
    expect(spawnError.syscall).not.toContain(secret);
    expect(spawnError.message).not.toContain(secret);
    expect(spawnError.stack).not.toContain(secret);
    expect(spawnError.path).not.toContain(secret);
    expect(JSON.stringify(spawnError.spawnargs)).not.toContain(secret);
    expect(JSON.stringify(summarizeError(error))).not.toContain(secret);

    const kept = await rejection(
      run(
        defineCommand({
          async run({ exec }) {
            await exec("hacksh-missing-executable", ["plain"], { redact: [] });
          },
        }),
      ),
    );
    if (kept.result.reason !== "spawn") throw new Error("expected a spawn failure");
    expect(kept.cause).toBe(kept.result.error);
    expect(kept.result.error).toMatchObject({ code: "ENOENT" });
  });
});

describe("exec terminal use", () => {
  it("returns captured stdout for an interactive command that reads input", async () => {
    const input = new TtyInput();
    const command = defineCommand({
      async run({ exec }) {
        const result = await exec(
          node,
          script(
            "let text = ''; process.stdin.on('data', (chunk) => { text += chunk; }).on('end', () => process.stdout.write(text.split('\\n')[0] ?? ''))",
          ),
          { input: "beta\nalpha\n", interactive: true },
        );
        return result.stdout;
      },
    });

    await expect(
      run(command, {
        stdin: input,
        stdout: { isTTY: true, write: () => undefined },
        stderr: { write: () => undefined },
      }),
    ).resolves.toBe("beta");
  });

  it("inherits every stdio stream and still reports the exit code", async () => {
    const directory = await temporaryDirectory();
    const marker = join(directory, "ran");
    const command = defineCommand({
      async run({ exec }) {
        return exec(node, markerScript(marker, "process.exit(0)"), {
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
        });
      },
    });

    await expect(run(command)).resolves.toMatchObject({
      status: "succeeded",
      exitCode: 0,
      stdout: "",
      stderr: "",
    });
    expect(existsSync(marker)).toBe(true);
  });

  it("captures stdout while inheriting stdin and stderr", async () => {
    const command = defineCommand({
      async run({ exec }) {
        return exec(node, script("process.stdout.write('captured-out')"), {
          stdin: "inherit",
          stderr: "inherit",
        });
      },
    });

    await expect(run(command)).resolves.toMatchObject({
      status: "succeeded",
      stdout: "captured-out",
      stderr: "",
      exitCode: 0,
    });
  });

  it("refuses inherited streams in JSON mode without spawning", async () => {
    const directory = await temporaryDirectory();
    const marker = join(directory, "spawned");
    const stderr: string[] = [];
    const command = defineCommand({
      async run({ exec }) {
        return exec(node, markerScript(marker), {
          stdout: "inherit",
          interactive: true,
          reject: false,
        });
      },
    });

    await expect(
      run(command, {
        output: "json",
        stdout: { write: () => undefined },
        stderr: { write: (text: string) => void stderr.push(text) },
      }),
    ).resolves.toMatchObject({
      status: "failed",
      reason: "json-output",
      stdout: "",
      stderr: "",
    });
    expect(stderr).toEqual([]);
    await expectUnspawned(marker);

    const thrown = await rejection(
      run(
        defineCommand({
          async run({ exec }) {
            await exec(node, markerScript(marker), { stdin: "inherit" });
          },
        }),
        { output: "json" },
      ),
    );
    expect(thrown.message.startsWith("Command cannot use the terminal in JSON output mode: ")).toBe(
      true,
    );
    expect(thrown.result).toMatchObject({ reason: "json-output", stdout: "", stderr: "" });
  });

  it("refuses an already aborted signal before a JSON terminal refusal", async () => {
    const directory = await temporaryDirectory();
    const marker = join(directory, "spawned");
    const events: PrintEvent[] = [];
    const command = defineCommand({
      async run({ exec }) {
        return exec(node, markerScript(marker), {
          signal: AbortSignal.abort(),
          stdout: "inherit",
          interactive: true,
          reject: false,
        });
      },
    });

    await expect(
      run(command, { output: "json", printer: recordPrinter(events) }),
    ).resolves.toMatchObject({ status: "failed", reason: "aborted", stdout: "", stderr: "" });
    expect(events).toEqual([]);
    await expectUnspawned(marker);
  });

  it("refuses interactive commands when the invocation is not interactive", async () => {
    const directory = await temporaryDirectory();
    const marker = join(directory, "spawned");
    const events: PrintEvent[] = [];
    const command = defineCommand({
      async run({ exec }) {
        return exec(node, markerScript(marker), { interactive: true, reject: false });
      },
    });

    await expect(run(command, { printer: recordPrinter(events) })).resolves.toMatchObject({
      status: "failed",
      reason: "non-interactive",
      stdout: "",
      stderr: "",
    });
    expect(events).toEqual([]);
    await expectUnspawned(marker);

    const thrown = await rejection(
      run(
        defineCommand({
          async run({ exec }) {
            await exec(node, markerScript(marker), { interactive: true });
          },
        }),
      ),
    );
    expect(thrown.message.startsWith("Command requires an interactive terminal: ")).toBe(true);
    expect(thrown.result).toMatchObject({ reason: "non-interactive", stdout: "", stderr: "" });
  });

  it("prefers a non-interactive refusal over an overlapping terminal command", async () => {
    const directory = await temporaryDirectory();
    const pidFile = join(directory, "pid");
    const marker = join(directory, "spawned");
    const command = defineCommand({
      async run({ exec }) {
        const first = exec(
          node,
          script(
            `require("node:fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000);`,
          ),
          { stdout: "inherit", reject: false, timeout: 10_000 },
        );
        const pid = Number(await waitForFile(pidFile));
        try {
          const second = await exec(node, markerScript(marker), {
            interactive: true,
            reject: false,
          });
          expect(second).toMatchObject({
            status: "failed",
            reason: "non-interactive",
            stdout: "",
            stderr: "",
          });
        } finally {
          process.kill(pid, "SIGKILL");
        }
        await first;
      },
    });

    await run(command);
    await expectUnspawned(marker);
  });

  it("shares the terminal lock with prompts and other terminal commands", async () => {
    const directory = await temporaryDirectory();
    const pidFile = join(directory, "pid");
    const marker = join(directory, "spawned");
    const input = new TtyInput();
    const events: PrintEvent[] = [];
    const command = defineCommand({
      async run({ exec, logger }) {
        const pendingPrompt = logger.text({ message: "Name" });
        const captured = await exec(node, script("process.stdout.write('beside-prompt')"));
        expect(captured.stdout).toBe("beside-prompt");
        const duringPrompt = await exec(node, markerScript(marker), {
          stdin: "inherit",
          reject: false,
        });
        expect(duringPrompt).toMatchObject({
          status: "failed",
          reason: "overlapping",
          stdout: "",
          stderr: "",
        });
        input.write("ok\r");
        await expect(pendingPrompt).resolves.toBe("ok");

        const holding = exec(
          node,
          script(
            `require("node:fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000);`,
          ),
          { stderr: "inherit", reject: false, timeout: 10_000 },
        );
        const pid = Number(await waitForFile(pidFile));
        try {
          await expect(logger.text({ message: "Later" })).rejects.toMatchObject({
            name: "HackshPromptError",
            reason: "overlapping",
            message: "A command is using the terminal",
          });
          const second = await exec(node, markerScript(join(directory, "other")), {
            stdout: "inherit",
            reject: false,
          });
          expect(second).toMatchObject({
            status: "failed",
            reason: "overlapping",
            stdout: "",
            stderr: "",
          });
          const thrown = await rejection(
            exec(node, script("process.exit(0)"), { stdin: "inherit" }),
          );
          expect(
            thrown.message.startsWith("Command cannot use the terminal while it is in use: "),
          ).toBe(true);
          expect(thrown.result).toMatchObject({ reason: "overlapping", stdout: "", stderr: "" });
          expect(events.filter((event) => event.type === "exec")).toHaveLength(2);
          const beside = await exec(node, script("process.stdout.write('beside-exec')"));
          expect(beside.stdout).toBe("beside-exec");
        } finally {
          process.kill(pid, "SIGKILL");
        }
        await holding;

        const after = join(directory, "after");
        await exec(node, markerScript(after), { stdout: "inherit" });
        expect(existsSync(after)).toBe(true);
      },
    });

    await run(command, {
      stdin: input,
      stdout: { isTTY: true, write: () => undefined },
      stderr: { write: () => undefined },
      printer: recordPrinter(events),
    });
    await expectUnspawned(marker);
    expect(existsSync(join(directory, "other"))).toBe(false);
    expect(events.filter((event) => event.type === "exec")).toHaveLength(4);
  });
});

describe("exec dry-run display", () => {
  it("shows the plan in pretty output when the environment is not interactive", async () => {
    const directory = await temporaryDirectory();
    const marker = join(directory, "spawned");
    const stderr: string[] = [];
    const command = defineCommand({
      async run({ exec }) {
        const fetched = await exec(node, script("process.stdout.write('main'); process.exit(2)"), {
          reject: false,
        });
        if (fetched.status !== "failed") return fetched;
        return exec(node, markerScript(marker), { dryRun: true, cwd: directory });
      },
    });

    const skipped = await run(command, {
      stderr: { write: (text: string) => void stderr.push(text) },
    });
    expect(skipped).toMatchObject({ status: "skipped", command: { cwd: directory } });
    const text = stderr.join("");
    expect(text).toContain("$  ");
    expect(text).toContain("#  ");
    expect(text).toContain(directory);
    await expectUnspawned(marker);
  });

  it("emits phase skip in JSON mode for a terminal dry-run", async () => {
    const directory = await temporaryDirectory();
    const marker = join(directory, "spawned");
    const stderr: string[] = [];
    const args = markerScript(marker);
    const command = defineCommand({
      async run({ exec }) {
        return exec(node, args, {
          dryRun: true,
          cwd: directory,
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
          interactive: true,
        });
      },
    });

    const skipped = await run(command, {
      output: "json",
      stdout: { write: () => undefined },
      stderr: { write: (text: string) => void stderr.push(text) },
    });
    expect(skipped).toEqual({
      status: "skipped",
      command: { file: node, args, cwd: directory },
    });
    expect(stderr).toHaveLength(1);
    expect(JSON.parse(stderr[0]!)).toEqual({
      type: "exec",
      phase: "skip",
      command: { file: node, args, cwd: directory },
      stdio: { stdin: "inherit", stdout: "inherit", stderr: "inherit" },
      interactive: true,
    });
    await expectUnspawned(marker);
  });

  it("does not take the terminal lock for a dry-run", async () => {
    const directory = await temporaryDirectory();
    const marker = join(directory, "spawned");
    const terminal = new TerminalLock();
    expect(terminal.acquire("prompt")).toBe(true);
    const bound = createExec({
      env: undefined,
      mode: { format: "pretty", interactive: true },
      print: () => undefined,
      terminal,
      signal: new AbortController().signal,
    });
    await expect(
      bound(node, markerScript(marker), {
        dryRun: true,
        interactive: true,
        stdout: "inherit",
      }),
    ).resolves.toMatchObject({ status: "skipped" });
    await expectUnspawned(marker);
    terminal.release();
  });
});
