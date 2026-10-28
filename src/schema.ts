import { globalRegistry, type $ZodObject, type $ZodType, type JSONSchemaMeta } from "zod/v4/core";
import type {} from "zod";
import type {} from "zod/v4";

interface ArgumentMeta extends JSONSchemaMeta {
  alias?: string | readonly string[];
  env?: string | false;
  valueName?: string;
}

declare module "zod" {
  interface GlobalMeta extends ArgumentMeta {}
}

declare module "zod/v4" {
  interface GlobalMeta extends ArgumentMeta {}
}

export type ArgsSchema = $ZodObject;
export type EmptyArgs = $ZodObject<{}>;

export const POSITIONALS_KEY = "positionals";

export interface ArgInfo {
  readonly takesValue: boolean;
  readonly required: boolean;
  readonly defaultValue: unknown;
  readonly description: string | undefined;
  readonly title: string | undefined;
  readonly alias: string | readonly string[] | undefined;
  readonly valueName: string | undefined;
  readonly env: string | false | undefined;
  readonly choices: readonly string[] | undefined;
}

export interface Positional {
  readonly schema: $ZodType;
  readonly label: string;
}

export interface Positionals {
  readonly items: readonly Positional[];
  readonly rest: Positional | undefined;
}

type ZodDef = Record<string, unknown> & { type: string };

function definition(schema: $ZodType): ZodDef {
  return schema._zod.def as ZodDef;
}

function innerSchema(def: ZodDef): $ZodType | undefined {
  switch (def.type) {
    case "optional":
    case "nonoptional":
    case "nullable":
    case "default":
    case "prefault":
    case "catch":
    case "readonly":
      return def.innerType as $ZodType;
    case "pipe":
      return def.in as $ZodType;
    default:
      return undefined;
  }
}

/** Read only the common zod/v4/core definition and registry structures. */
export function readArgInfo(schema: $ZodType): ArgInfo {
  let current: $ZodType | undefined = schema;
  let required = true;
  let defaultValue: unknown;
  let description: string | undefined;
  let title: string | undefined;
  let alias: string | readonly string[] | undefined;
  let valueName: string | undefined;
  let env: string | false | undefined;

  while (current) {
    const metadata = globalRegistry.get(current);
    if (metadata) {
      if (
        metadata.alias !== undefined &&
        typeof metadata.alias !== "string" &&
        !(
          Array.isArray(metadata.alias) &&
          metadata.alias.every((value) => typeof value === "string")
        )
      ) {
        throw new TypeError("Argument metadata `alias` must be a string or an array of strings");
      }
      if (
        metadata.env !== undefined &&
        typeof metadata.env !== "string" &&
        metadata.env !== false
      ) {
        throw new TypeError("Argument metadata `env` must be a string or false");
      }
      for (const key of ["valueName", "title", "description"] as const) {
        if (metadata[key] !== undefined && typeof metadata[key] !== "string") {
          throw new TypeError(`Argument metadata \`${key}\` must be a string`);
        }
      }
      alias ??= metadata.alias;
      valueName ??= metadata.valueName;
      env ??= metadata.env;
    }
    description ??= metadata?.description;
    title ??= metadata?.title;

    const def = definition(current);
    if (def.type === "optional" || def.type === "default" || def.type === "prefault") {
      required = false;
    }
    if (def.type === "default" && defaultValue === undefined) defaultValue = def.defaultValue;
    current = innerSchema(def);
  }

  const base = unwrapInput(schema);
  return {
    takesValue: definition(base).type !== "boolean",
    required,
    defaultValue,
    description,
    title,
    alias,
    valueName,
    env,
    choices: enumChoices(base),
  };
}

/** Read the `positionals` tuple or array schema that declares positional arguments. */
export function readPositionals(shape: Record<string, $ZodType>): Positionals | undefined {
  const field = shape[POSITIONALS_KEY];
  if (!field) return undefined;
  const def = definition(unwrapInput(field));
  let items: readonly $ZodType[];
  let rest: $ZodType | undefined;
  if (def.type === "tuple") {
    items = def.items as readonly $ZodType[];
    rest = (def.rest as $ZodType | null) ?? undefined;
  } else if (def.type === "array") {
    items = [];
    rest = def.element as $ZodType;
  } else {
    throw new TypeError("Positional arguments `positionals` must use a tuple or array schema");
  }
  return {
    items: items.map((schema, index) => ({
      schema,
      label: readArgInfo(schema).title ?? `ARG${index + 1}`,
    })),
    rest: rest && { schema: rest, label: readArgInfo(rest).title ?? "ARGS" },
  };
}

function enumChoices(schema: $ZodType): readonly string[] | undefined {
  const def = definition(schema);
  const candidate = def.type === "array" ? unwrapInput(def.element as $ZodType) : schema;
  const candidateDef = definition(candidate);
  if (candidateDef.type !== "enum") return undefined;
  const values = candidate._zod.values;
  return values ? [...values].map(String) : undefined;
}

/** Whether the schema accepts an array after removing supported input wrappers. */
export function isArrayInput(schema: $ZodType): boolean {
  return definition(unwrapInput(schema)).type === "array";
}

/** Whether the schema accepts an object after removing supported input wrappers. */
export function isObjectInput(schema: $ZodType): boolean {
  return definition(unwrapInput(schema)).type === "object";
}

function unwrapInput(schema: $ZodType): $ZodType {
  let current = schema;
  for (;;) {
    const inner = innerSchema(definition(current));
    if (!inner) return current;
    current = inner;
  }
}

export function schemaShape(schema: ArgsSchema): Record<string, $ZodType> {
  return schema._zod.def.shape as Record<string, $ZodType>;
}
