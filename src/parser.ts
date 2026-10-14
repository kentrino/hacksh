import { parseArgs as parseNodeArgs } from "node:util";
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
  readonly takesValue: boolean;
}

interface OptionModel {
  readonly definitions: Map<string, OptionDefinition>;
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
  readonly missingValueIndex: number | undefined;
  readonly help: boolean;
  readonly helpIndex: number | undefined;
  readonly version: boolean;
  readonly versionIndex: number | undefined;
}

function optionModel(command: AnyCommandDef): OptionModel {
  const definitions = new Map<string, OptionDefinition>();
  const parserOptions: OptionModel["parserOptions"] = {};
  const allAliases = new Set<string>();
  const positional = new Set<string>(command.positional ?? []);
  if (command.variadic) positional.add(command.variadic);

  if (command.args) {
    for (const [key, schema] of Object.entries(schemaShape(command.args))) {
      if (positional.has(key)) continue;
      const aliases = command.alias?.[key] ? aliasList(command.alias[key]!) : [];
      const definition: OptionDefinition = {
        key,
        kebabName: kebabCase(key),
        takesValue: readArgInfo(schema).takesValue,
      };
      const type = definition.takesValue ? "string" : "boolean";
      for (const name of new Set([key, definition.kebabName])) {
        definitions.set(name, definition);
        parserOptions[name] = { type };
      }
      for (const alias of aliases) {
        allAliases.add(alias);
        definitions.set(alias, definition);
        parserOptions[alias] = { type, short: alias };
      }
    }
  }
  return { definitions, parserOptions, aliases: allAliases };
}

function displayName(command: AnyCommandDef, key: string): string {
  if (command.variadic === key) return `<${key.toUpperCase()}...>`;
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
  let missingValueIndex: number | undefined;
  const parserArgs = beforeSeparator.map((raw, index) => {
    if (!raw.startsWith("--no-")) return raw;
    const definition = model.definitions.get(raw.slice(5));
    if (!definition || definition.takesValue) return raw;
    negativeIndexes.add(index);
    return `--${definition.key}`;
  });

  const parsed = parseNodeArgs({
    args: parserArgs,
    options: model.parserOptions,
    allowPositionals: true,
    strict: false,
    tokens: true,
  });
  const tokens: CommandToken[] = [];
  const unknownIndexes = new Set<number>();
  let help = false;
  let helpIndex: number | undefined;
  let version = false;
  let versionIndex: number | undefined;
  for (const token of parsed.tokens) {
    if (token.kind === "positional") {
      tokens.push({ kind: "positional", index: token.index, value: token.value });
      continue;
    }
    if (token.kind !== "option") continue;
    const isHelp =
      token.rawName === "--help" || (token.rawName === "-h" && !model.aliases.has("h"));
    const isVersion =
      token.rawName === "--version" || (token.rawName === "-v" && !model.aliases.has("v"));
    if (isHelp) {
      help = true;
      helpIndex ??= token.index;
    }
    if (isVersion) {
      version = true;
      versionIndex ??= token.index;
    }
    const definition = model.definitions.get(token.name);
    if (definition) {
      if (
        definition.takesValue &&
        (token.value === undefined ||
          (!token.inlineValue && token.value.startsWith("-") && token.value !== "-"))
      ) {
        if (!missingValue) {
          missingValue = { arg: `--${definition.kebabName}`, message: "requires a value" };
          missingValueIndex = token.index;
        }
      }
      tokens.push({
        kind: "known-option",
        index: token.index,
        definition,
        value: definition.takesValue
          ? (token.value ?? "")
          : negativeIndexes.has(token.index)
            ? false
            : (token.value ?? true),
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
    missingValueIndex,
    help,
    helpIndex,
    version,
    versionIndex,
  };
}

export function tokenizedBefore(
  tokenized: TokenizedCommandArgs,
  endIndex: number,
): TokenizedCommandArgs {
  const missingValue =
    tokenized.missingValueIndex !== undefined && tokenized.missingValueIndex < endIndex
      ? tokenized.missingValue
      : undefined;
  const help = tokenized.helpIndex !== undefined && tokenized.helpIndex < endIndex;
  const version = tokenized.versionIndex !== undefined && tokenized.versionIndex < endIndex;
  return {
    tokens: tokenized.tokens.filter((token) => token.index < endIndex),
    passthrough: [],
    missingValue,
    missingValueIndex: missingValue ? tokenized.missingValueIndex : undefined,
    help,
    helpIndex: help ? tokenized.helpIndex : undefined,
    version,
    versionIndex: version ? tokenized.versionIndex : undefined,
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
  tokenized: TokenizedCommandArgs = tokenizeCommandArgs(command, rawArgs),
): Promise<ParsedCommand<S>> {
  if (tokenized.missingValue) {
    throw new ZittyValidationError(command, [tokenized.missingValue]);
  }

  const input: Record<string, string | boolean | string[] | undefined> = {};
  if (command.variadic) input[command.variadic] = [];
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
      } else if (command.variadic) {
        (input[command.variadic] as string[]).push(token.value);
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

/**
 * Parse and validate one command segment without routing, builtin handling, or output.
 */
export async function parseArgs<S extends ArgsSchema>(
  command: CommandDef<S>,
  argv: string[],
): Promise<output<S>> {
  return (await parseCommandArgs(command, argv)).args;
}
