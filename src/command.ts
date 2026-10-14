import type { output } from "zod/v4/core";
import {
  readArgInfo,
  schemaShape,
  type ArgKey,
  type ArgsSchema,
  type EmptyArgs,
} from "./schema.ts";

export type AliasMap<S extends ArgsSchema> = Partial<Record<ArgKey<S>, string | readonly string[]>>;

export interface CommandContext<S extends ArgsSchema> {
  args: output<S>;
  rawArgs: string[];
  passthrough: string[];
  extraArgs: string[];
}

export interface CommandDef<S extends ArgsSchema = EmptyArgs> {
  name?: string;
  version?: string;
  description?: string;
  args?: S;
  alias?: AliasMap<S>;
  positional?: readonly ArgKey<S>[];
  subCommands?: Record<string, CommandDef<ArgsSchema>>;
  run?: (context: CommandContext<S>) => unknown;
}

export type AnyCommandDef = CommandDef<ArgsSchema>;

function aliases(value: string | readonly string[]): readonly string[] {
  return typeof value === "string" ? [value] : value;
}

export function defineCommand<S extends ArgsSchema = EmptyArgs>(def: CommandDef<S>): CommandDef<S> {
  const shape = def.args ? schemaShape(def.args) : {};
  const positional = def.positional ?? [];
  const positionalSet = new Set<string>();
  let sawOptional = false;

  for (const key of positional) {
    const field = shape[key];
    if (!field) throw new TypeError(`Unknown positional key \`${key}\``);
    if (positionalSet.has(key)) throw new TypeError(`Duplicate positional key \`${key}\``);
    positionalSet.add(key);

    const info = readArgInfo(field);
    if (!info.takesValue) throw new TypeError(`Boolean argument \`${key}\` cannot be positional`);
    if (sawOptional && info.required) {
      throw new TypeError(`Required positional \`${key}\` cannot follow an optional positional`);
    }
    sawOptional ||= !info.required;
  }

  if (positional.length > 0 && def.subCommands && Object.keys(def.subCommands).length > 0) {
    throw new TypeError("A command cannot define both positional arguments and subcommands");
  }

  const usedAliases = new Set<string>();
  for (const [key, value] of Object.entries(def.alias ?? {})) {
    if (!shape[key]) throw new TypeError(`Unknown alias key \`${key}\``);
    if (positionalSet.has(key))
      throw new TypeError(`Positional argument \`${key}\` cannot have aliases`);
    for (const alias of aliases(value as string | readonly string[])) {
      if (alias.length !== 1)
        throw new TypeError(`Alias \`${alias}\` must be exactly one character`);
      if (usedAliases.has(alias)) throw new TypeError(`Duplicate alias \`${alias}\``);
      usedAliases.add(alias);
    }
  }

  for (const key of Object.keys(shape)) {
    if (!positionalSet.has(key) && /^no[-A-Z]/.test(key)) {
      throw new TypeError(`Option \`${key}\` conflicts with --no- negation`);
    }
  }

  return def;
}
