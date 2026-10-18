import type { output } from "zod/v4/core";
import type { Logger } from "./logger.ts";
import { aliasList } from "./options.ts";
import {
  isArrayInput,
  isObjectInput,
  POSITIONALS_KEY,
  readArgInfo,
  readPositionals,
  schemaShape,
  type ArgsSchema,
  type EmptyArgs,
  type OptionKey,
} from "./schema.ts";

export interface ArgOptions {
  alias?: string | readonly string[];
  valueName?: string;
  env?: string | false;
}

export type ArgOptionsMap<S extends ArgsSchema> = Partial<Record<OptionKey<S>, ArgOptions>>;

export interface CommandContext<S extends ArgsSchema> {
  cmd: CommandDef<S>;
  args: output<S>;
  rawArgs: string[];
  passthrough: string[];
  extraArgs: string[];
  logger: Logger;
}

export interface CommandDef<S extends ArgsSchema = EmptyArgs> {
  name?: string;
  version?: string;
  description?: string;
  hidden?: boolean;
  args?: S;
  argOptions?: ArgOptionsMap<S>;
  subCommands?: Record<string, CommandDef<ArgsSchema>>;
  run?(context: CommandContext<S>): unknown;
}

export type AnyCommandDef = CommandDef<ArgsSchema>;

export function defineCommand<S extends ArgsSchema = EmptyArgs>(def: CommandDef<S>): CommandDef<S> {
  const shape = def.args ? schemaShape(def.args) : {};
  const positionals = readPositionals(shape);

  if (positionals) {
    let sawOptional = false;
    for (const { schema, label } of positionals.items) {
      const info = readArgInfo(schema);
      if (isArrayInput(schema)) {
        throw new TypeError(
          `Positional argument \`${label}\` cannot be an array; use a tuple rest`,
        );
      }
      if (!info.takesValue) {
        throw new TypeError(`Boolean argument \`${label}\` cannot be positional`);
      }
      if (sawOptional && info.required) {
        throw new TypeError(
          `Required positional \`${label}\` cannot follow an optional positional`,
        );
      }
      sawOptional ||= !info.required;
    }
    if (def.subCommands && Object.keys(def.subCommands).length > 0) {
      throw new TypeError("A command cannot define both positional arguments and subcommands");
    }
  }

  const usedAliases = new Set<string>();
  for (const [key, options] of Object.entries(def.argOptions ?? {})) {
    if (key === POSITIONALS_KEY) {
      throw new TypeError("Positional arguments cannot have argument options");
    }
    const schema = shape[key];
    if (!schema) throw new TypeError(`Unknown argument options key \`${key}\``);
    if (options?.env !== undefined) {
      if (options.env === "") {
        throw new TypeError(`Environment variable name for \`${key}\` cannot be empty`);
      }
      if (isArrayInput(schema)) {
        throw new TypeError(
          `Option \`${key}\` cannot use an environment variable because it accepts an array`,
        );
      }
      if (isObjectInput(schema)) {
        throw new TypeError(
          `Option \`${key}\` cannot use an environment variable because it accepts an object`,
        );
      }
    }
    if (options?.alias === undefined) continue;
    for (const alias of aliasList(options.alias)) {
      if (alias.length !== 1)
        throw new TypeError(`Alias \`${alias}\` must be exactly one character`);
      if (usedAliases.has(alias)) throw new TypeError(`Duplicate alias \`${alias}\``);
      usedAliases.add(alias);
    }
  }

  for (const key of Object.keys(shape)) {
    if (key !== POSITIONALS_KEY && /^no[-A-Z]/.test(key)) {
      throw new TypeError(`Option \`${key}\` conflicts with --no- negation`);
    }
  }

  return def;
}
