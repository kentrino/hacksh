import type { $ZodIssue } from "zod/v4/core";
import type { AnyCommandDef } from "./command.ts";

export interface ZittyIssue {
  arg: string;
  message: string;
  issue?: $ZodIssue;
}

export class ZittyUsageError extends Error {
  readonly command: AnyCommandDef;

  constructor(message: string, command: AnyCommandDef, options?: ErrorOptions) {
    super(message, options);
    this.name = "ZittyUsageError";
    this.command = command;
  }
}

export class ZittyValidationError extends ZittyUsageError {
  readonly issues: ReadonlyArray<ZittyIssue>;

  constructor(command: AnyCommandDef, issues: ReadonlyArray<ZittyIssue>) {
    super(
      `Invalid arguments:\n${issues.map(({ arg, message }) => `  ${arg}: ${message}`).join("\n")}`,
      command,
    );
    this.name = "ZittyValidationError";
    this.issues = issues;
  }
}

export interface ValidationIssueSummary {
  arg: string;
  message: string;
  code?: string;
  path?: readonly PropertyKey[];
  details?: Readonly<Record<string, unknown>>;
}

export interface HackshErrorSummary {
  name: string;
  message: string;
  stack?: string;
  cause?: unknown;
  issues?: readonly ValidationIssueSummary[];
  properties?: Readonly<Record<string, unknown>>;
  value?: unknown;
}

function summarizeIssue({ arg, message, issue }: ZittyIssue): ValidationIssueSummary {
  if (!issue) return { arg, message };
  const details: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(issue)) {
    if (["code", "path", "message", "inst"].includes(key)) continue;
    details[key] = value;
  }
  return {
    arg,
    message,
    ...(typeof issue.code === "string" ? { code: issue.code } : {}),
    ...(Array.isArray(issue.path) ? { path: issue.path } : {}),
    ...(Object.keys(details).length === 0 ? {} : { details }),
  };
}

/** Convert any thrown value into a command- and schema-free error description. */
export function summarizeError(error: unknown): HackshErrorSummary {
  if (!(error instanceof Error)) {
    let message: string;
    try {
      message = String(error);
    } catch {
      message = "[Unserializable thrown value]";
    }
    return { name: "NonErrorThrown", message, value: error };
  }
  const reserved = new Set(["name", "message", "stack", "cause", "command", "issues"]);
  const properties: Record<string, unknown> = {};
  for (const key of Object.keys(error)) {
    if (reserved.has(key)) continue;
    try {
      properties[key] = (error as unknown as Record<string, unknown>)[key];
    } catch {
      properties[key] = "[Unserializable]";
    }
  }
  return {
    name: error.name,
    message: error.message,
    ...(error.stack === undefined ? {} : { stack: error.stack }),
    ...(error.cause === undefined ? {} : { cause: error.cause }),
    ...(error instanceof ZittyValidationError ? { issues: error.issues.map(summarizeIssue) } : {}),
    ...(Object.keys(properties).length === 0 ? {} : { properties }),
  };
}
