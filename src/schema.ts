import { globalRegistry, type $ZodObject, type $ZodType } from "zod/v4/core";

export type ArgsSchema = $ZodObject;
export type EmptyArgs = $ZodObject<{}>;
export type ShapeOf<S extends ArgsSchema> = S["_zod"]["def"]["shape"];
export type ArgKey<S extends ArgsSchema> = Extract<keyof ShapeOf<S>, string>;

export interface ArgInfo {
  readonly takesValue: boolean;
  readonly required: boolean;
  readonly defaultValue: unknown;
  readonly description: string | undefined;
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

  while (current) {
    const metadata = globalRegistry.get(current);
    description ??= metadata?.description;

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
  };
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
