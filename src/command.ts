import type { output } from "zod/v4/core";
import { aliasList } from "./options.ts";
import {
  isArrayInput,
  readArgInfo,
  schemaShape,
  type ArgKey,
  type ArgsSchema,
  type EmptyArgs,
} from "./schema.ts";

export type AliasMap<S extends ArgsSchema> = Partial<Record<ArgKey<S>, string | readonly string[]>>;

export interface ArgDisplay {
  name?: string;
  valueName?: string;
  negatedDescription?: string;
}

export type ArgDisplayMap<S extends ArgsSchema> = Partial<Record<ArgKey<S>, ArgDisplay>>;

export interface CommandContext<S extends ArgsSchema> {
  cmd: CommandDef<S>;
  args: output<S>;
  rawArgs: string[];
  passthrough: string[];
  extraArgs: string[];
}

export interface CommandDef<S extends ArgsSchema = EmptyArgs> {
  name?: string;
  version?: string;
  description?: string;
  hidden?: boolean;
  args?: S;
  alias?: AliasMap<S>;
  argDisplay?: ArgDisplayMap<S>;
  positional?: readonly ArgKey<S>[];
  variadic?: ArgKey<S>;
  subCommands?: Record<string, CommandDef<ArgsSchema>>;
  run?(context: CommandContext<S>): unknown;
}

export type AnyCommandDef = CommandDef<ArgsSchema>;

export function defineCommand<S extends ArgsSchema = EmptyArgs>(def: CommandDef<S>): CommandDef<S> {
  const shape = def.args ? schemaShape(def.args) : {};
  const positional = def.positional ?? [];
  const positionalSet = new Set<string>();
  const rawVariadic: unknown = def.variadic;
  if (rawVariadic !== undefined && typeof rawVariadic !== "string") {
    throw new TypeError("Variadic must be exactly one schema key");
  }
  const variadic = rawVariadic as string | undefined;
  let sawOptional = false;

  for (const key of Object.keys(def.argDisplay ?? {})) {
    if (!shape[key]) throw new TypeError(`Unknown argument display key \`${key}\``);
  }

  for (const key of positional) {
    const field = shape[key];
    if (!field) throw new TypeError(`Unknown positional key \`${key}\``);
    if (positionalSet.has(key)) throw new TypeError(`Duplicate positional key \`${key}\``);
    positionalSet.add(key);

    const info = readArgInfo(field);
    if (isArrayInput(field)) {
      throw new TypeError(`Array argument \`${key}\` must be declared as variadic`);
    }
    if (!info.takesValue) throw new TypeError(`Boolean argument \`${key}\` cannot be positional`);
    if (sawOptional && info.required) {
      throw new TypeError(`Required positional \`${key}\` cannot follow an optional positional`);
    }
    sawOptional ||= !info.required;
  }

  if (variadic !== undefined) {
    const field = shape[variadic];
    if (!field) throw new TypeError(`Unknown variadic key \`${variadic}\``);
    if (positionalSet.has(variadic)) {
      throw new TypeError(`Variadic argument \`${variadic}\` cannot also be positional`);
    }
    if (!isArrayInput(field)) {
      throw new TypeError(`Variadic argument \`${variadic}\` must use an array schema`);
    }
  }

  if (
    (positional.length > 0 || variadic !== undefined) &&
    def.subCommands &&
    Object.keys(def.subCommands).length > 0
  ) {
    throw new TypeError("A command cannot define both positional arguments and subcommands");
  }

  const usedAliases = new Set<string>();
  for (const [key, value] of Object.entries(def.alias ?? {})) {
    if (!shape[key]) throw new TypeError(`Unknown alias key \`${key}\``);
    if (positionalSet.has(key) || key === variadic)
      throw new TypeError(`Positional argument \`${key}\` cannot have aliases`);
    for (const alias of aliasList(value as string | readonly string[])) {
      if (alias.length !== 1)
        throw new TypeError(`Alias \`${alias}\` must be exactly one character`);
      if (usedAliases.has(alias)) throw new TypeError(`Duplicate alias \`${alias}\``);
      usedAliases.add(alias);
    }
  }

  for (const key of Object.keys(shape)) {
    if (!positionalSet.has(key) && key !== variadic && /^no[-A-Z]/.test(key)) {
      throw new TypeError(`Option \`${key}\` conflicts with --no- negation`);
    }
  }

  return def;
}
