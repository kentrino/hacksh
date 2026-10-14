import { parseArgs } from "node:util";
import { safeParseAsync, type $ZodIssue, type output } from "zod/v4/core";
import type { AnyCommandDef, CommandDef } from "./command.ts";
import { ZittyValidationError, type ZittyIssue } from "./errors.ts";
import { aliasList, kebabCase } from "./options.ts";
import { readArgInfo, schemaShape, type ArgsSchema } from "./schema.ts";

export interface ParsedCommand<S extends ArgsSchema> {
  args: output<S>;
  passthrough: string[];
  extraArgs: string[];
}

interface OptionDefinition {
  readonly key: string;
  readonly kebabName: string;
  readonly aliases: readonly string[];
  readonly takesValue: boolean;
}

interface OptionModel {
  readonly byInputName: Map<string, OptionDefinition>;
  readonly byParserName: Map<string, OptionDefinition>;
  readonly parserOptions: Record<string, { type: "string" | "boolean"; short?: string }>;
  readonly aliases: Set<string>;
}

interface KnownOptionToken {
  readonly kind: "known-option";
  readonly index: number;
  readonly definition: OptionDefinition;
  readonly value: string | boolean;
}

interface UnknownOptionToken {
  readonly kind: "unknown-option";
  readonly index: number;
  readonly value: string;
}

interface PositionalToken {
  readonly kind: "positional";
  readonly index: number;
  readonly value: string;
}

type CommandToken = KnownOptionToken | UnknownOptionToken | PositionalToken;

export interface TokenizedCommandArgs {
  readonly tokens: readonly CommandToken[];
  readonly passthrough: string[];
  readonly missingValue: ZittyIssue | undefined;
  readonly help: boolean;
  readonly version: boolean;
}

function optionModel(command: AnyCommandDef): OptionModel {
  const byInputName = new Map<string, OptionDefinition>();
  const byParserName = new Map<string, OptionDefinition>();
  const parserOptions: OptionModel["parserOptions"] = {};
  const allAliases = new Set<string>();
  const positional = new Set<string>(command.positional ?? []);

  if (command.args) {
    for (const [key, schema] of Object.entries(schemaShape(command.args))) {
      if (positional.has(key)) continue;
      const aliases = command.alias?.[key] ? aliasList(command.alias[key]!) : [];
      const definition: OptionDefinition = {
        key,
        kebabName: kebabCase(key),
        aliases,
        takesValue: readArgInfo(schema).takesValue,
      };
      const type = definition.takesValue ? "string" : "boolean";
      for (const name of new Set([key, definition.kebabName])) {
        byInputName.set(name, definition);
        byParserName.set(name, definition);
        parserOptions[name] = { type };
      }
      for (const alias of aliases) {
        allAliases.add(alias);
        byInputName.set(alias, definition);
        byParserName.set(alias, definition);
        parserOptions[alias] = { type, short: alias };
      }
    }
  }
  return { byInputName, byParserName, parserOptions, aliases: allAliases };
}

function displayName(command: AnyCommandDef, key: string): string {
  return command.positional?.includes(key) ? `<${key.toUpperCase()}>` : `--${kebabCase(key)}`;
}

export function tokenizeCommandArgs(
  command: AnyCommandDef,
  rawArgs: readonly string[],
): TokenizedCommandArgs {
  const model = optionModel(command);
  const separator = rawArgs.indexOf("--");
  const beforeSeparator = separator === -1 ? [...rawArgs] : rawArgs.slice(0, separator);
  const passthrough = separator === -1 ? [] : rawArgs.slice(separator + 1);
  const negativeIndexes = new Set<number>();
  let missingValue: ZittyIssue | undefined;
  const parserArgs = beforeSeparator.map((raw, index) => {
    if (!raw.startsWith("--no-")) return raw;
    const definition = model.byInputName.get(raw.slice(5));
    if (!definition || definition.takesValue) return raw;
    negativeIndexes.add(index);
    return `--${definition.key}`;
  });

  const parsed = parseArgs({
    args: parserArgs,
    options: model.parserOptions,
    allowPositionals: true,
    strict: false,
    tokens: true,
  });
  const tokens: CommandToken[] = [];
  const unknownIndexes = new Set<number>();
  let help = false;
  let version = false;
  for (const token of parsed.tokens) {
    if (token.kind === "positional") {
      tokens.push({ kind: "positional", index: token.index, value: token.value });
      continue;
    }
    if (token.kind !== "option") continue;
    help ||= token.rawName === "--help" || (token.rawName === "-h" && !model.aliases.has("h"));
    version ||=
      token.rawName === "--version" || (token.rawName === "-v" && !model.aliases.has("v"));
    const definition = model.byParserName.get(token.name);
    if (definition) {
      if (
        definition.takesValue &&
        (token.value === undefined ||
          (!token.inlineValue && token.value.startsWith("-") && token.value !== "-"))
      ) {
        missingValue ??= { arg: `--${definition.kebabName}`, message: "requires a value" };
      }
      tokens.push({
        kind: "known-option",
        index: token.index,
        definition,
        value: definition.takesValue ? (token.value ?? "") : !negativeIndexes.has(token.index),
      });
    } else if (!unknownIndexes.has(token.index)) {
      unknownIndexes.add(token.index);
      tokens.push({
        kind: "unknown-option",
        index: token.index,
        value: beforeSeparator[token.index]!,
      });
    }
  }

  return {
    tokens,
    passthrough,
    missingValue,
    help,
    version,
  };
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
  const tokenized = tokenizeCommandArgs(command, rawArgs);
  if (tokenized.missingValue) {
    throw new ZittyValidationError(command, [tokenized.missingValue]);
  }

  const input: Record<string, string | boolean | undefined> = {};
  const extraArgs: string[] = [];
  let positionalIndex = 0;
  for (const token of tokenized.tokens) {
    if (token.kind === "known-option") input[token.definition.key] = token.value;
    else if (token.kind === "unknown-option") extraArgs.push(token.value);
    else {
      const key = command.positional?.[positionalIndex];
      if (key) {
        input[key] = token.value;
        positionalIndex += 1;
      } else extraArgs.push(token.value);
    }
  }

  if (!command.args)
    return { args: input as output<S>, passthrough: tokenized.passthrough, extraArgs };
  const result = await safeParseAsync(command.args, input);
  if (!result.success)
    throw new ZittyValidationError(command, zodIssues(command, result.error.issues));
  return { args: result.data, passthrough: tokenized.passthrough, extraArgs };
}
