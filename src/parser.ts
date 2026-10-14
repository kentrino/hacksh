import { parseArgs } from "node:util";
import { safeParseAsync, type $ZodIssue, type output } from "zod/v4/core";
import type { AnyCommandDef, CommandDef } from "./command.ts";
import { ZittyValidationError, type ZittyIssue } from "./errors.ts";
import { readArgInfo, schemaShape, type ArgsSchema } from "./schema.ts";

export interface ParsedCommand<S extends ArgsSchema> {
  args: output<S>;
  passthrough: string[];
  extraArgs: string[];
}

interface OptionDefinition {
  key: string;
  takesValue: boolean;
}

function kebabCase(value: string): string {
  return value.replaceAll(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function aliasList(value: string | readonly string[]): readonly string[] {
  return typeof value === "string" ? [value] : value;
}

export function optionDefinitions(command: AnyCommandDef): Map<string, OptionDefinition> {
  const definitions = new Map<string, OptionDefinition>();
  if (!command.args) return definitions;
  const positional = new Set<string>(command.positional ?? []);

  for (const [key, schema] of Object.entries(schemaShape(command.args))) {
    if (positional.has(key)) continue;
    const definition = { key, takesValue: readArgInfo(schema).takesValue };
    definitions.set(key, definition);
    definitions.set(kebabCase(key), definition);
    const aliases = command.alias?.[key];
    if (aliases) {
      for (const alias of aliasList(aliases)) definitions.set(alias, definition);
    }
  }
  return definitions;
}

function parserOptions(
  command: AnyCommandDef,
): Record<string, { type: "string" | "boolean"; short?: string }> {
  const options: Record<string, { type: "string" | "boolean"; short?: string }> = {};
  if (!command.args) return options;
  const definitions = optionDefinitions(command);
  for (const [name, definition] of definitions) {
    if (name.length === 1) continue;
    const aliases = command.alias?.[definition.key];
    const short = aliases ? aliasList(aliases)[0] : undefined;
    options[name] = short
      ? { type: definition.takesValue ? "string" : "boolean", short }
      : { type: definition.takesValue ? "string" : "boolean" };
  }
  return options;
}

function optionName(raw: string): string {
  const withoutEquals = raw.slice(0, raw.indexOf("=") === -1 ? undefined : raw.indexOf("="));
  return withoutEquals.startsWith("--") ? withoutEquals.slice(2) : withoutEquals.slice(1, 2);
}

function missingValueIssue(
  command: AnyCommandDef,
  rawArgs: readonly string[],
): ZittyIssue | undefined {
  const definitions = optionDefinitions(command);
  for (let index = 0; index < rawArgs.length; index += 1) {
    const raw = rawArgs[index]!;
    if (raw === "--") break;
    if (!raw.startsWith("-") || raw === "-") continue;
    const definition = definitions.get(optionName(raw));
    if (!definition?.takesValue || raw.includes("=")) continue;
    const next = rawArgs[index + 1];
    if (next === undefined || (next.startsWith("-") && next !== "-")) {
      return { arg: `--${kebabCase(definition.key)}`, message: "requires a value" };
    }
    index += 1;
  }
  return undefined;
}

function displayName(command: AnyCommandDef, key: string): string {
  return command.positional?.includes(key) ? `<${key.toUpperCase()}>` : `--${kebabCase(key)}`;
}

function zodIssues(command: AnyCommandDef, issues: readonly $ZodIssue[]): ZittyIssue[] {
  return issues.map((issue) => {
    const first = issue.path[0];
    return {
      arg: typeof first === "string" ? displayName(command, first) : "arguments",
      message: issue.message,
      issue,
    };
  });
}

export async function parseCommandArgs<S extends ArgsSchema>(
  command: CommandDef<S>,
  rawArgs: string[],
): Promise<ParsedCommand<S>> {
  const separator = rawArgs.indexOf("--");
  const argsToParse = separator === -1 ? rawArgs : rawArgs.slice(0, separator);
  const passthrough = separator === -1 ? [] : rawArgs.slice(separator + 1);
  const missing = missingValueIssue(command, argsToParse);
  if (missing) throw new ZittyValidationError(command, [missing]);

  const parsed = parseArgs({
    args: argsToParse,
    options: parserOptions(command),
    allowPositionals: true,
    strict: false,
    tokens: true,
    allowNegative: true,
  });
  const definitions = optionDefinitions(command);
  const input: Record<string, string | boolean | undefined> = {};
  const extra: Array<{ index: number; value: string }> = [];
  let positionalIndex = 0;

  for (const token of parsed.tokens) {
    if (token.kind === "option") {
      const definition = definitions.get(token.name);
      if (definition) input[definition.key] = token.value ?? !token.rawName.startsWith("--no-");
      else extra.push({ index: token.index, value: argsToParse[token.index]! });
      continue;
    }
    if (token.kind === "positional") {
      const key = command.positional?.[positionalIndex];
      if (key) {
        input[key] = token.value;
        positionalIndex += 1;
      } else {
        extra.push({ index: token.index, value: token.value });
      }
    }
  }

  if (!command.args)
    return { args: input as output<S>, passthrough, extraArgs: extra.map((x) => x.value) };
  const result = await safeParseAsync(command.args, input);
  if (!result.success)
    throw new ZittyValidationError(command, zodIssues(command, result.error.issues));
  return {
    args: result.data,
    passthrough,
    extraArgs: extra.sort((a, b) => a.index - b.index).map((item) => item.value),
  };
}
