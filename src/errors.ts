import type { $ZodIssue } from "zod/v4/core";
import type { AnyCommandDef } from "./command.ts";
import type { ExecFailure } from "./exec.ts";

export interface HackshIssue {
  arg: string;
  message: string;
  issue?: $ZodIssue;
}

export class HackshUsageError extends Error {
  readonly command: AnyCommandDef;

  constructor(message: string, command: AnyCommandDef, options?: ErrorOptions) {
    super(message, options);
    this.name = "HackshUsageError";
    this.command = command;
  }
}

export class HackshValidationError extends HackshUsageError {
  readonly issues: ReadonlyArray<HackshIssue>;

  constructor(command: AnyCommandDef, issues: ReadonlyArray<HackshIssue>) {
    super(
      `Invalid arguments:\n${issues.map(({ arg, message }) => `  ${arg}: ${message}`).join("\n")}`,
      command,
    );
    this.name = "HackshValidationError";
    this.issues = issues;
  }
}

export type PromptKind = "select" | "confirm" | "text";

export type HackshPromptErrorReason =
  | "non-interactive"
  | "cancelled"
  | "eof"
  | "overlapping"
  | "invalid-options"
  | "input-error"
  | "printer-error";

export interface PromptErrorDetails {
  kind: PromptKind;
  message: string;
  choices?: readonly string[];
}

/** An input request that could not be completed safely. */
export class HackshPromptError extends Error {
  readonly reason: HackshPromptErrorReason;
  readonly prompt: PromptErrorDetails;

  constructor(
    reason: HackshPromptErrorReason,
    prompt: PromptErrorDetails,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "HackshPromptError";
    this.reason = reason;
    this.prompt = prompt;
  }
}

/** An external command that did not succeed; `result` is not enumerable so error summaries omit child output. */
export class HackshExecError extends Error {
  readonly #result: ExecFailure;

  constructor(message: string, result: ExecFailure, options?: ErrorOptions) {
    super(message, options);
    this.name = "HackshExecError";
    this.#result = result;
  }

  get result(): ExecFailure {
    return this.#result;
  }
}

export type HackshErrorKind = "error" | "prompt" | "usage" | "validation" | "thrown";

export interface ValidationIssueSummary {
  arg: string;
  message: string;
  code?: string;
  path?: readonly PropertyKey[];
  details?: Readonly<Record<string, unknown>>;
}

export interface HackshErrorSummary {
  kind: HackshErrorKind;
  name: string;
  message: string;
  stack?: string;
  cause?: unknown;
  issues?: readonly ValidationIssueSummary[];
  properties?: Readonly<Record<string, unknown>>;
  value?: unknown;
}

function safeString(value: unknown, fallback: string): string {
  try {
    return String(value);
  } catch {
    return fallback;
  }
}

function readProperty(value: object, key: PropertyKey): unknown {
  try {
    return Reflect.get(value, key);
  } catch {
    return "[Unserializable]";
  }
}

function enumerableKeys(value: object): string[] {
  try {
    return Object.keys(value);
  } catch {
    return [];
  }
}

function hasToJSON(value: object): boolean {
  try {
    return typeof Reflect.get(value, "toJSON") === "function";
  } catch {
    return false;
  }
}

function isPlainObject(value: object): boolean {
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function summarizeIssue(
  { arg, message, issue }: HackshIssue,
  seen: WeakMap<object, unknown>,
): ValidationIssueSummary {
  if (!issue) return { arg, message };
  const details: Record<string, unknown> = {};
  for (const key of enumerableKeys(issue)) {
    if (["code", "path", "message", "inst"].includes(key)) continue;
    details[key] = summarizeErrors(readProperty(issue, key), seen);
  }
  const code = readProperty(issue, "code");
  const path = readProperty(issue, "path");
  return {
    arg,
    message,
    ...(typeof code === "string" ? { code } : {}),
    ...(Array.isArray(path) ? { path } : {}),
    ...(Object.keys(details).length === 0 ? {} : { details }),
  };
}

function errorKind(error: Error): HackshErrorKind {
  if (error instanceof HackshPromptError) return "prompt";
  if (error instanceof HackshValidationError) return "validation";
  if (error instanceof HackshUsageError) return "usage";
  return "error";
}

function summarizeErrorWithSeen(error: Error, seen: WeakMap<object, unknown>): HackshErrorSummary {
  const summary: HackshErrorSummary = {
    kind: errorKind(error),
    name: safeString(readProperty(error, "name"), "Error"),
    message: safeString(readProperty(error, "message"), "[Unserializable error message]"),
  };
  seen.set(error, summary);

  const stack = readProperty(error, "stack");
  const cause = readProperty(error, "cause");
  if (typeof stack === "string") summary.stack = stack;
  if (cause !== undefined) summary.cause = summarizeErrors(cause, seen);
  if (error instanceof HackshValidationError) {
    summary.issues = error.issues.map((issue) => summarizeIssue(issue, seen));
  }

  const reserved = new Set(["name", "message", "stack", "cause", "command", "issues"]);
  const properties: Record<string, unknown> = {};
  for (const key of enumerableKeys(error)) {
    if (reserved.has(key)) continue;
    properties[key] = summarizeErrors(readProperty(error, key), seen);
  }
  if (Object.keys(properties).length > 0) summary.properties = properties;
  return summary;
}

/** Recursively replace Error values with command- and schema-free summaries. */
export function summarizeErrors(
  value: unknown,
  seen: WeakMap<object, unknown> = new WeakMap(),
): unknown {
  if (typeof value !== "object" || value === null) return value;
  const existing = seen.get(value);
  if (existing !== undefined) return existing;
  if (value instanceof Error) return summarizeErrorWithSeen(value, seen);

  if (Array.isArray(value)) {
    const result: unknown[] = [];
    seen.set(value, result);
    let changed = false;
    for (const item of value) {
      const summarized = summarizeErrors(item, seen);
      result.push(summarized);
      changed ||= summarized !== item;
    }
    if (changed) return result;
    seen.set(value, value);
    return value;
  }
  if (value instanceof Map) {
    const result = new Map<unknown, unknown>();
    seen.set(value, result);
    let changed = false;
    for (const [key, item] of value) {
      const summarizedKey = summarizeErrors(key, seen);
      const summarizedItem = summarizeErrors(item, seen);
      result.set(summarizedKey, summarizedItem);
      changed ||= summarizedKey !== key || summarizedItem !== item;
    }
    if (changed) return result;
    seen.set(value, value);
    return value;
  }
  if (value instanceof Set) {
    const result = new Set<unknown>();
    seen.set(value, result);
    let changed = false;
    for (const item of value) {
      const summarized = summarizeErrors(item, seen);
      result.add(summarized);
      changed ||= summarized !== item;
    }
    if (changed) return result;
    seen.set(value, value);
    return value;
  }
  if (ArrayBuffer.isView(value) || hasToJSON(value) || !isPlainObject(value)) return value;

  const result: Record<string, unknown> = {};
  seen.set(value, result);
  let changed = false;
  for (const key of enumerableKeys(value)) {
    const original = readProperty(value, key);
    const summarized = summarizeErrors(original, seen);
    result[key] = summarized;
    changed ||= summarized !== original;
  }
  if (changed) return result;
  seen.set(value, value);
  return value;
}

/** Convert any thrown value into a canonical error description. */
export function summarizeError(error: unknown): HackshErrorSummary {
  if (error instanceof Error) return summarizeErrorWithSeen(error, new WeakMap());
  return {
    kind: "thrown",
    name: "NonErrorThrown",
    message: safeString(error, "[Unserializable thrown value]"),
    value: summarizeErrors(error),
  };
}
