import { globalRegistry, type $ZodObject, type $ZodType } from "zod/v4/core";

export type ArgsSchema = $ZodObject;
export type EmptyArgs = $ZodObject<{}>;
export type ShapeOf<S extends ArgsSchema> = S["_zod"]["def"]["shape"];
export type ArgKey<S extends ArgsSchema> = Extract<keyof ShapeOf<S>, string>;
export type OptionKey<S extends ArgsSchema> = Exclude<ArgKey<S>, typeof POSITIONALS_KEY>;

export const POSITIONALS_KEY = "_";

export interface ArgInfo {
  readonly takesValue: boolean;
  readonly required: boolean;
  readonly defaultValue: unknown;
  readonly description: string | undefined;
  readonly title: string | undefined;
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

  while (current) {
    const metadata = globalRegistry.get(current);
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
    choices: enumChoices(base),
  };
}

/** Read the `_` tuple or array schema that declares positional arguments. */
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
    throw new TypeError("Positional arguments `_` must use a tuple or array schema");
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
