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
