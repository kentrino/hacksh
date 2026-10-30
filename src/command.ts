import type { output } from "zod/v4/core";
import type { Output } from "./command-output.ts";
import type { Exec } from "./exec.ts";
import type { Logger } from "./logger.ts";
import type { Prompter } from "./prompts.ts";
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
} from "./schema.ts";

export interface CommandContext<S extends ArgsSchema> {
  command: CommandDef<S>;
  args: output<S>;
  input: {
    argv: string[];
    unknown: string[];
    passthrough: string[];
  };
  output: Output;
  logger: Logger;
  prompt: Prompter;
  exec: Exec;
  signal: AbortSignal;
}

export interface CommandDef<
  S extends ArgsSchema = EmptyArgs,
  Children extends Record<string, AnyCommandDef> = Record<string, AnyCommandDef>,
> {
  name?: string;
  version?: string;
  description?: string;
  hidden?: boolean;
  /** Keep unknown options and excess positionals in input.unknown. Inherits from the parent; defaults to false. */
  allowUnknownArgs?: boolean;
  args?: S;
  subCommands?: Children;
  run?(context: CommandContext<S>): number | void | Promise<number | void>;
}

export type AnyCommandDef = CommandDef<ArgsSchema>;

export function defineCommand<
  S extends ArgsSchema = EmptyArgs,
  Children extends Record<string, AnyCommandDef> = {},
>(def: CommandDef<S, Children>): NoInfer<CommandDef<S, Children>> {
  if (def.allowUnknownArgs !== undefined && typeof def.allowUnknownArgs !== "boolean") {
    throw new TypeError("allowUnknownArgs must be a boolean");
  }
  const shape = def.args ? schemaShape(def.args) : {};
  const positionals = readPositionals(shape);

  if (positionals) {
    let sawOptional = false;
    for (const { schema, label } of positionals.items) {
      const info = readArgInfo(schema);
      if (info.alias !== undefined || info.env !== undefined || info.valueName !== undefined) {
        throw new TypeError(
          `Positional argument \`${label}\` cannot have alias, env, or valueName metadata`,
        );
      }
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
    if (positionals.rest) {
      const info = readArgInfo(positionals.rest.schema);
      if (info.alias !== undefined || info.env !== undefined || info.valueName !== undefined) {
        throw new TypeError(
          `Positional argument \`${positionals.rest.label}\` cannot have alias, env, or valueName metadata`,
        );
      }
    }
    if (def.subCommands && Object.keys(def.subCommands).length > 0) {
      throw new TypeError("A command cannot define both positional arguments and subcommands");
    }
  }

  const usedAliases = new Set<string>();
  for (const [key, schema] of Object.entries(shape)) {
    const options = readArgInfo(schema);
    if (key === POSITIONALS_KEY) {
      if (
        options.alias !== undefined ||
        options.env !== undefined ||
        options.valueName !== undefined
      ) {
        throw new TypeError("Positional arguments cannot have alias, env, or valueName metadata");
      }
      continue;
    }
    if (options.env !== undefined) {
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
    if (options.alias === undefined) continue;
    for (const alias of aliasList(options.alias)) {
      if (alias.length !== 1)
        throw new TypeError(`Alias \`${alias}\` must be exactly one character`);
      if (usedAliases.has(alias)) throw new TypeError(`Duplicate alias \`${alias}\``);
      usedAliases.add(alias);
    }
  }

  for (const key of Object.keys(shape)) {
    if (key === "help" || key === "version") {
      throw new TypeError(`Option \`${key}\` conflicts with the builtin --${key}`);
    }
    if (key !== POSITIONALS_KEY && /^no[-A-Z]/.test(key)) {
      throw new TypeError(`Option \`${key}\` conflicts with --no- negation`);
    }
  }

  return def;
}
