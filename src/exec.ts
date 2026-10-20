import { spawn, type ChildProcess } from "node:child_process";
import type { Readable } from "node:stream";
import { HackshExecError } from "./errors.ts";

type Environment = Readonly<Record<string, string | undefined>>;

export interface ExecOptions {
  cwd?: string;
  env?: Environment;
  input?: string;
  reject?: boolean;
  timeout?: number;
  signal?: AbortSignal;
  maxBuffer?: number;
  forceKillAfterDelay?: number;
}

export interface ExecCommand {
  file: string;
  args: readonly string[];
  cwd: string | undefined;
}

export interface ExecSuccess {
  status: "succeeded";
  command: ExecCommand;
  stdout: string;
  stderr: string;
  exitCode: 0;
}

export type ExecFailure = {
  status: "failed";
  command: ExecCommand;
  stdout: string;
  stderr: string;
} & (
  | { reason: "exit-code"; exitCode: number }
  | { reason: "signal"; signal: string }
  | { reason: "spawn"; error: Error }
  | { reason: "timeout" | "aborted" | "output-limit" }
);

export type ExecFailureReason = ExecFailure["reason"];

export type ExecResult = ExecSuccess | ExecFailure;

export type ExecReturn<O extends ExecOptions> = "reject" extends keyof O
  ? false extends O["reject"]
    ? ExecResult
    : ExecSuccess
  : ExecSuccess;

export type Exec = <const O extends ExecOptions = {}>(
  file: string,
  args?: readonly string[],
  options?: O & { [K in Exclude<keyof O, keyof ExecOptions>]: never },
) => Promise<ExecReturn<O>>;

const OPTION_KEYS: ReadonlySet<string> = new Set([
  "cwd",
  "env",
  "input",
  "reject",
  "timeout",
  "signal",
  "maxBuffer",
  "forceKillAfterDelay",
] satisfies (keyof ExecOptions)[]);

type TerminationCause = "timeout" | "aborted" | "output-limit";

interface ExecPlan {
  command: ExecCommand;
  env: NodeJS.ProcessEnv | undefined;
  input: string | undefined;
  reject: boolean;
  timeout: number | undefined;
  signal: AbortSignal | undefined;
  maxBuffer: number;
  forceKillAfterDelay: number;
}

interface Outcome {
  cause: TerminationCause | undefined;
  spawnError: Error | undefined;
  exit: { code: number | null; signal: string | null } | undefined;
}

const MAX_DELAY = 2_147_483_647;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNoNul(value: string, label: string): void {
  if (value.includes("\0")) throw new TypeError(`${label} must not contain NUL characters`);
}

function readInteger(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function mergeEnvironment(
  base: Environment | undefined,
  overrides: unknown,
): NodeJS.ProcessEnv | undefined {
  if (overrides === undefined && base === undefined) return undefined;
  if (overrides !== undefined && !isRecord(overrides)) {
    throw new TypeError("Exec option `env` must be an object");
  }
  const merged: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(base ?? process.env)) {
    if (value !== undefined) merged[key] = value;
  }
  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (key === "" || key.includes("=") || key.includes("\0")) {
      throw new TypeError(`Invalid environment variable name ${JSON.stringify(key)}`);
    }
    if (value === undefined) {
      delete merged[key];
      continue;
    }
    if (typeof value !== "string") {
      throw new TypeError(`Environment variable ${key} must be a string or undefined`);
    }
    assertNoNul(value, `Environment variable ${key}`);
    merged[key] = value;
  }
  return merged;
}

function parsePlan(
  file: unknown,
  args: unknown,
  options: unknown,
  baseEnv: Environment | undefined,
): ExecPlan {
  if (typeof file !== "string" || file === "") {
    throw new TypeError("Exec file must be a non-empty string");
  }
  assertNoNul(file, "Exec file");
  const argv = args === undefined ? [] : args;
  if (!Array.isArray(argv) || !argv.every((arg) => typeof arg === "string")) {
    throw new TypeError("Exec args must be an array of strings");
  }
  for (const arg of argv) assertNoNul(arg, "Exec args");
  const raw = options === undefined ? {} : options;
  if (!isRecord(raw)) throw new TypeError("Exec options must be an object");
  for (const key of Object.keys(raw)) {
    if (!OPTION_KEYS.has(key)) throw new TypeError(`Unknown exec option \`${key}\``);
  }

  const { cwd, input, reject, timeout, signal, maxBuffer, forceKillAfterDelay } = raw;
  if (cwd !== undefined) {
    if (typeof cwd !== "string" || cwd === "") {
      throw new TypeError("Exec option `cwd` must be a non-empty string");
    }
    assertNoNul(cwd, "Exec option `cwd`");
  }
  if (input !== undefined && typeof input !== "string") {
    throw new TypeError("Exec option `input` must be a string");
  }
  if (reject !== undefined && typeof reject !== "boolean") {
    throw new TypeError("Exec option `reject` must be a boolean");
  }
  if (signal !== undefined && !(signal instanceof AbortSignal)) {
    throw new TypeError("Exec option `signal` must be an AbortSignal");
  }
  return {
    command: { file, args: [...argv], cwd },
    env: mergeEnvironment(baseEnv, raw.env),
    input,
    reject: reject ?? true,
    timeout:
      timeout === undefined
        ? undefined
        : readInteger(timeout, "Exec option `timeout`", 1, MAX_DELAY),
    signal,
    maxBuffer:
      maxBuffer === undefined
        ? 100_000_000
        : readInteger(maxBuffer, "Exec option `maxBuffer`", 1, Number.MAX_SAFE_INTEGER),
    forceKillAfterDelay:
      forceKillAfterDelay === undefined
        ? 5_000
        : readInteger(forceKillAfterDelay, "Exec option `forceKillAfterDelay`", 0, MAX_DELAY),
  };
}

function stripFinalNewline(text: string): string {
  if (text.endsWith("\r\n")) return text.slice(0, -2);
  if (text.endsWith("\n")) return text.slice(0, -1);
  return text;
}

function collect(stream: Readable, limit: number, onLimit: () => void): () => string {
  const chunks: Buffer[] = [];
  let length = 0;
  let exceeded = false;
  stream.on("data", (chunk: Buffer) => {
    if (exceeded) return;
    const remaining = limit - length;
    if (chunk.length <= remaining) {
      chunks.push(chunk);
      length += chunk.length;
      return;
    }
    chunks.push(chunk.subarray(0, remaining));
    length = limit;
    exceeded = true;
    onLimit();
  });
  return () => stripFinalNewline(Buffer.concat(chunks).toString("utf8"));
}

function toResult(
  command: ExecCommand,
  outcome: Outcome,
  stdout: string,
  stderr: string,
): ExecResult {
  const failed = { status: "failed", command, stdout, stderr } as const;
  if (outcome.cause) return { ...failed, reason: outcome.cause };
  if (outcome.spawnError) return { ...failed, reason: "spawn", error: outcome.spawnError };
  const { code, signal } = outcome.exit ?? { code: null, signal: null };
  if (signal !== null) return { ...failed, reason: "signal", signal };
  if (code !== 0) return { ...failed, reason: "exit-code", exitCode: code ?? 1 };
  return { status: "succeeded", command, stdout, stderr, exitCode: 0 };
}

function isSpawnErrno(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "syscall" in error;
}

function startChild(plan: ExecPlan): ChildProcess | Error {
  try {
    return spawn(plan.command.file, plan.command.args, {
      cwd: plan.command.cwd,
      env: plan.env,
      shell: false,
      windowsHide: true,
      stdio: [plan.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
  } catch (error) {
    if (isSpawnErrno(error)) return error;
    throw error;
  }
}

function runPlan(plan: ExecPlan): Promise<ExecResult> {
  const outcome: Outcome = { cause: undefined, spawnError: undefined, exit: undefined };
  if (plan.signal?.aborted) {
    outcome.cause = "aborted";
    return Promise.resolve(toResult(plan.command, outcome, "", ""));
  }
  const child = startChild(plan);
  if (child instanceof Error) {
    outcome.spawnError = child;
    return Promise.resolve(toResult(plan.command, outcome, "", ""));
  }

  return new Promise((resolve) => {
    const stdout = child.stdout!;
    const stderr = child.stderr!;
    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;

    const settle = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      clearTimeout(killTimer);
      plan.signal?.removeEventListener("abort", onAbort);
      resolve(toResult(plan.command, outcome, readStdout(), readStderr()));
    };
    const release = () => {
      stdout.destroy();
      stderr.destroy();
      settle();
    };
    const terminate = (cause: TerminationCause) => {
      if (settled || outcome.cause) return;
      outcome.cause = cause;
      if (outcome.exit) {
        release();
        return;
      }
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), plan.forceKillAfterDelay);
    };
    const onAbort = () => terminate("aborted");

    const readStdout = collect(stdout, plan.maxBuffer, () => terminate("output-limit"));
    const readStderr = collect(stderr, plan.maxBuffer, () => terminate("output-limit"));
    const timeoutTimer =
      plan.timeout === undefined ? undefined : setTimeout(() => terminate("timeout"), plan.timeout);
    plan.signal?.addEventListener("abort", onAbort, { once: true });

    child.on("error", (error) => {
      if (child.pid !== undefined) return;
      outcome.spawnError = error;
      release();
    });
    child.on("exit", (code, signal) => {
      outcome.exit = { code, signal };
      clearTimeout(killTimer);
      // A grandchild may keep the pipes open after hacksh terminates the direct child.
      if (outcome.cause) release();
    });
    child.on("close", settle);

    if (child.stdin) {
      child.stdin.on("error", () => undefined);
      child.stdin.end(plan.input);
    }
  });
}

function formatArgument(value: string): string {
  return value === "" || /[\s"'\\$`;|&<>*?()[\]{}~#!]/.test(value) ? JSON.stringify(value) : value;
}

function failureMessage(plan: ExecPlan, result: ExecFailure): string {
  const display = [plan.command.file, ...plan.command.args].map(formatArgument).join(" ");
  switch (result.reason) {
    case "exit-code":
      return `Command failed with exit code ${result.exitCode}: ${display}`;
    case "signal":
      return `Command was terminated by ${result.signal}: ${display}`;
    case "spawn": {
      const code = (result.error as NodeJS.ErrnoException).code;
      return `Command could not be started (${code ?? result.error.message}): ${display}`;
    }
    case "timeout":
      return `Command timed out after ${plan.timeout} ms: ${display}`;
    case "aborted":
      return `Command was aborted: ${display}`;
    case "output-limit":
      return `Command output exceeded ${plan.maxBuffer} bytes: ${display}`;
  }
}

async function execute(
  file: unknown,
  args: unknown,
  options: unknown,
  baseEnv: Environment | undefined,
): Promise<ExecResult> {
  const plan = parsePlan(file, args, options, baseEnv);
  const result = await runPlan(plan);
  if (result.status === "failed" && plan.reject) {
    throw new HackshExecError(
      failureMessage(plan, result),
      result,
      result.reason === "spawn" ? { cause: result.error } : undefined,
    );
  }
  return result;
}

/** Bind exec to an invocation environment; `undefined` lets children inherit `process.env`. */
export function createExec(baseEnv: Environment | undefined): Exec {
  return ((file, args, options) => execute(file, args, options, baseEnv)) as Exec;
}
