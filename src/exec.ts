import { spawn, type ChildProcess } from "node:child_process";
import type { Readable } from "node:stream";
import { HackshExecError } from "./errors.ts";
import type { ExecPrintEvent, OutputFormat } from "./printer.ts";
import { TerminalLock } from "./terminal.ts";

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
  stdin?: "pipe" | "inherit";
  stdout?: "pipe" | "inherit";
  stderr?: "pipe" | "inherit";
  interactive?: boolean;
  display?: boolean;
  redact?: readonly string[];
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
  | { reason: "json-output" | "non-interactive" | "overlapping" }
);

export type ExecFailureReason = ExecFailure["reason"];

export type ExecResult = ExecSuccess | ExecFailure;

export type ExecReturn<O extends ExecOptions> = "reject" extends keyof O
  ? false extends O["reject"]
    ? ExecResult
    : ExecSuccess
  : ExecSuccess;

type RejectInheritedInput<O> = O extends { input: string; stdin: "inherit" } ? never : unknown;

export type Exec = <const O extends ExecOptions = {}>(
  file: string,
  args?: readonly string[],
  options?: O & { [K in Exclude<keyof O, keyof ExecOptions>]: never } & RejectInheritedInput<O>,
) => Promise<ExecReturn<O>>;

export interface ExecContext {
  env: Environment | undefined;
  mode: { format: OutputFormat; interactive: boolean };
  print(event: ExecPrintEvent): void | Promise<void>;
  terminal: TerminalLock;
}

const OPTION_KEYS: ReadonlySet<string> = new Set([
  "cwd",
  "env",
  "input",
  "reject",
  "timeout",
  "signal",
  "maxBuffer",
  "forceKillAfterDelay",
  "stdin",
  "stdout",
  "stderr",
  "interactive",
  "display",
  "redact",
] satisfies (keyof ExecOptions)[]);

type TerminationCause = "timeout" | "aborted" | "output-limit";
type StreamMode = "pipe" | "inherit";
type ExecStdio = ExecPrintEvent["stdio"];
type RefusalReason = "aborted" | "json-output" | "non-interactive" | "overlapping";

interface SpawnError extends NodeJS.ErrnoException {
  spawnargs?: readonly string[];
}

interface ExecPlan {
  command: ExecCommand;
  reported: ExecCommand;
  env: NodeJS.ProcessEnv | undefined;
  input: string | undefined;
  reject: boolean;
  timeout: number | undefined;
  signal: AbortSignal | undefined;
  maxBuffer: number;
  forceKillAfterDelay: number;
  stdin: StreamMode;
  stdout: StreamMode;
  stderr: StreamMode;
  interactive: boolean;
  display: boolean;
  redact: readonly string[];
}

interface Outcome {
  cause: TerminationCause | undefined;
  spawnError: Error | undefined;
  exit: { code: number | null; signal: string | null } | undefined;
}

const MAX_DELAY = 2_147_483_647;
const REFUSAL_MESSAGE = {
  "json-output": "Command cannot use the terminal in JSON output mode",
  "non-interactive": "Command requires an interactive terminal",
  overlapping: "Command cannot use the terminal while it is in use",
} as const;

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

function readEnum<const T extends string>(value: unknown, label: string, allowed: readonly T[]): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value))
    return value as T;
  throw new TypeError(
    `Exec option \`${label}\` must be ${allowed.map((item) => JSON.stringify(item)).join(" or ")}`,
  );
}

function readBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`Exec option \`${label}\` must be a boolean`);
  return value;
}

function readRedact(value: unknown): readonly string[] {
  if (!Array.isArray(value)) throw new TypeError("Exec option `redact` must be an array");
  for (const item of value) {
    if (typeof item !== "string" || item === "") {
      throw new TypeError("Exec option `redact` must contain only non-empty strings");
    }
    assertNoNul(item, "Exec option `redact`");
  }
  return value as readonly string[];
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

function redactValue(value: string, secrets: readonly string[]): string {
  let redacted = value;
  for (const secret of [...secrets].sort((left, right) => right.length - left.length)) {
    redacted = redacted.split(secret).join("***");
  }
  return redacted;
}

function redactCommand(command: ExecCommand, secrets: readonly string[]): ExecCommand {
  if (secrets.length === 0) return command;
  return {
    file: redactValue(command.file, secrets),
    args: command.args.map((arg) => redactValue(arg, secrets)),
    cwd: command.cwd === undefined ? undefined : redactValue(command.cwd, secrets),
  };
}

function redactError(error: Error, secrets: readonly string[]): Error {
  const source = error as SpawnError;
  const redacted = new Error(redactValue(error.message, secrets)) as SpawnError;
  if (typeof error.stack === "string") redacted.stack = redactValue(error.stack, secrets);
  if (source.code !== undefined) redacted.code = source.code;
  if (source.errno !== undefined) redacted.errno = source.errno;
  if (typeof source.syscall === "string") redacted.syscall = redactValue(source.syscall, secrets);
  if (typeof source.path === "string") redacted.path = redactValue(source.path, secrets);
  if (Array.isArray(source.spawnargs)) {
    redacted.spawnargs = source.spawnargs.map((arg) =>
      typeof arg === "string" ? redactValue(arg, secrets) : arg,
    );
  }
  return redacted;
}

function observedError(plan: ExecPlan, error: Error): Error {
  return plan.redact.length === 0 ? error : redactError(error, plan.redact);
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
  const stdin =
    raw.stdin === undefined ? "pipe" : readEnum(raw.stdin, "stdin", ["pipe", "inherit"]);
  const stdout =
    raw.stdout === undefined ? "pipe" : readEnum(raw.stdout, "stdout", ["pipe", "inherit"]);
  const stderr =
    raw.stderr === undefined ? "pipe" : readEnum(raw.stderr, "stderr", ["pipe", "inherit"]);
  if (input !== undefined && stdin === "inherit") {
    throw new TypeError("Exec option `input` cannot be combined with stdin inherit");
  }
  const command = { file, args: [...argv], cwd };
  const redact = raw.redact === undefined ? [] : readRedact(raw.redact);
  return {
    command,
    reported: redactCommand(command, redact),
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
    stdin,
    stdout,
    stderr,
    interactive:
      raw.interactive === undefined ? false : readBoolean(raw.interactive, "interactive"),
    display: raw.display === undefined ? true : readBoolean(raw.display, "display"),
    redact,
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

function commandStdio(plan: ExecPlan): ExecStdio {
  return {
    stdin: plan.stdin === "inherit" ? "inherit" : plan.input === undefined ? "ignore" : "input",
    stdout: plan.stdout,
    stderr: plan.stderr,
  };
}

function usesTerminal(plan: ExecPlan, stdio: ExecStdio): boolean {
  return (
    plan.interactive ||
    stdio.stdin === "inherit" ||
    stdio.stdout === "inherit" ||
    stdio.stderr === "inherit"
  );
}

function startChild(plan: ExecPlan): ChildProcess | Error {
  const stdio = commandStdio(plan);
  try {
    return spawn(plan.command.file, plan.command.args, {
      cwd: plan.command.cwd,
      env: plan.env,
      shell: false,
      windowsHide: true,
      stdio: [
        stdio.stdin === "inherit" ? "inherit" : stdio.stdin === "input" ? "pipe" : "ignore",
        stdio.stdout,
        stdio.stderr,
      ],
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
    return Promise.resolve(toResult(plan.reported, outcome, "", ""));
  }
  const child = startChild(plan);
  if (child instanceof Error) {
    outcome.spawnError = observedError(plan, child);
    return Promise.resolve(toResult(plan.reported, outcome, "", ""));
  }

  return new Promise((resolve) => {
    const stdout = child.stdout;
    const stderr = child.stderr;
    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;

    const settle = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      clearTimeout(killTimer);
      plan.signal?.removeEventListener("abort", onAbort);
      resolve(toResult(plan.reported, outcome, readStdout(), readStderr()));
    };
    const release = () => {
      stdout?.destroy();
      stderr?.destroy();
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

    const readStdout = stdout
      ? collect(stdout, plan.maxBuffer, () => terminate("output-limit"))
      : () => "";
    const readStderr = stderr
      ? collect(stderr, plan.maxBuffer, () => terminate("output-limit"))
      : () => "";
    const timeoutTimer =
      plan.timeout === undefined ? undefined : setTimeout(() => terminate("timeout"), plan.timeout);
    plan.signal?.addEventListener("abort", onAbort, { once: true });

    child.on("error", (error) => {
      if (child.pid !== undefined) return;
      outcome.spawnError = observedError(plan, error);
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

export function formatExecCommand(command: ExecCommand): string {
  return [command.file, ...command.args].map(formatArgument).join(" ");
}

function failureMessage(plan: ExecPlan, result: ExecFailure): string {
  const display = formatExecCommand(plan.reported);
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
    case "json-output":
    case "non-interactive":
    case "overlapping":
      return `${REFUSAL_MESSAGE[result.reason]}: ${display}`;
  }
}

function emptyFailure(plan: ExecPlan, reason: RefusalReason): ExecFailure {
  return { status: "failed", command: plan.reported, stdout: "", stderr: "", reason };
}

function complete(plan: ExecPlan, result: ExecResult): ExecResult {
  if (result.status === "failed" && plan.reject) {
    throw new HackshExecError(
      failureMessage(plan, result),
      result,
      result.reason === "spawn" ? { cause: result.error } : undefined,
    );
  }
  return result;
}

function blockedReason(
  plan: ExecPlan,
  context: ExecContext,
  stdio: ExecStdio,
): "json-output" | "non-interactive" | undefined {
  const inherited =
    stdio.stdin === "inherit" || stdio.stdout === "inherit" || stdio.stderr === "inherit";
  if (context.mode.format === "json" && inherited) return "json-output";
  if (plan.interactive && !context.mode.interactive) return "non-interactive";
  return undefined;
}

async function execute(
  file: unknown,
  args: unknown,
  options: unknown,
  context: ExecContext,
): Promise<ExecResult> {
  const plan = parsePlan(file, args, options, context.env);
  if (plan.signal?.aborted) return complete(plan, emptyFailure(plan, "aborted"));

  const stdio = commandStdio(plan);
  const blocked = blockedReason(plan, context, stdio);
  if (blocked) return complete(plan, emptyFailure(plan, blocked));

  const holdTerminal = usesTerminal(plan, stdio);
  if (holdTerminal && !context.terminal.acquire("exec")) {
    return complete(plan, emptyFailure(plan, "overlapping"));
  }
  try {
    if (plan.display) {
      await context.print({
        type: "exec",
        phase: "start",
        command: plan.reported,
        stdio,
        interactive: plan.interactive,
      });
    }
    return complete(plan, await runPlan(plan));
  } finally {
    if (holdTerminal) context.terminal.release();
  }
}

export function createExec(context: ExecContext): Exec {
  return ((file, args, options) => execute(file, args, options, context)) as Exec;
}
