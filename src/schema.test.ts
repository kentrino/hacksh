import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import * as mini from "zod/mini";
import type { $ZodType } from "zod/v4/core";
import { isArrayInput, readArgInfo } from "./schema.ts";

type TestApi = {
  string: () => $ZodType;
  boolean: () => $ZodType;
  enum: () => $ZodType;
  numericEnum: () => $ZodType;
  array: (schema: $ZodType) => $ZodType;
  optional: (schema: $ZodType) => $ZodType;
  nullable: (schema: $ZodType) => $ZodType;
  default: (schema: $ZodType) => $ZodType;
  pipe: (schema: $ZodType) => $ZodType;
  transform: (schema: $ZodType) => $ZodType;
  catch: (schema: $ZodType) => $ZodType;
  describe: (schema: $ZodType) => $ZodType;
  meta: (schema: $ZodType, metadata: Record<string, unknown>) => $ZodType;
};

const implementations: ReadonlyArray<[string, TestApi]> = [
  [
    "zod",
    {
      string: () => z.string(),
      boolean: () => z.boolean(),
      enum: () => z.enum(["small", "large"]),
      numericEnum: () => z.enum({ A: 0, B: 1, 0: "A", 1: "B" }),
      array: (schema) => z.array(schema as z.ZodType),
      optional: (schema) => (schema as z.ZodType).optional(),
      nullable: (schema) => (schema as z.ZodType).nullable(),
      default: (schema) => (schema as z.ZodType).default("fallback"),
      pipe: (schema) => (schema as z.ZodType).pipe(z.string()),
      transform: (schema) => (schema as z.ZodType).transform(String),
      catch: (schema) => (schema as z.ZodType).catch("caught"),
      describe: (schema) => (schema as z.ZodType).describe("described"),
      meta: (schema, metadata) => (schema as z.ZodType).meta(metadata),
    },
  ],
  [
    "zod/mini",
    {
      string: () => mini.string(),
      boolean: () => mini.boolean(),
      enum: () => mini.enum(["small", "large"]),
      numericEnum: () => mini.enum({ A: 0, B: 1, 0: "A", 1: "B" }),
      array: (schema) => mini.array(schema),
      optional: (schema) => mini.optional(schema),
      nullable: (schema) => mini.nullable(schema),
      default: (schema) => mini._default(schema, "fallback"),
      pipe: (schema) => mini.pipe(schema, mini.string()),
      transform: (schema) => mini.pipe(schema, mini.transform(String)),
      catch: (schema) => mini.catch(schema, "caught"),
      describe: (schema) => (schema as mini.ZodMiniType).check(mini.describe("described")),
      meta: (schema, metadata) => (schema as mini.ZodMiniType).check(mini.meta(metadata)),
    },
  ],
];

describe.each(implementations)("schema reading with %s", (_name, api) => {
  it("distinguishes flags from value options through wrappers", () => {
    expect(readArgInfo(api.optional(api.boolean()))).toMatchObject({
      takesValue: false,
      required: false,
    });
    expect(readArgInfo(api.pipe(api.string()))).toMatchObject({ takesValue: true });
    expect(readArgInfo(api.transform(api.string()))).toMatchObject({ takesValue: true });
    expect(readArgInfo(z.union([z.boolean(), z.string()]))).toMatchObject({ takesValue: true });
  });

  it("collects requiredness, defaults, and descriptions across wrappers", () => {
    const schema = api.nullable(api.describe(api.default(api.string())));
    expect(readArgInfo(schema)).toEqual({
      takesValue: true,
      required: false,
      defaultValue: "fallback",
      description: "described",
      title: undefined,
      alias: undefined,
      valueName: undefined,
      env: undefined,
      choices: undefined,
    });
    expect(readArgInfo(api.catch(api.describe(api.string())))).toMatchObject({
      required: true,
      description: "described",
    });
    expect(readArgInfo(api.optional(api.describe(api.string())))).toMatchObject({
      required: false,
      description: "described",
    });
    expect(readArgInfo(api.pipe(api.describe(api.string())))).toMatchObject({
      description: "described",
    });
    expect(readArgInfo(api.transform(api.describe(api.string())))).toMatchObject({
      description: "described",
    });
  });

  it("reads all argument metadata through wrappers and prefers outer metadata", () => {
    const metadata = {
      alias: ["a", "A"],
      valueName: "VALUE",
      env: "TOOL_VALUE",
      title: "VALUE",
      description: "A value",
    };
    const inner = api.meta(api.string(), metadata);
    for (const wrap of [
      api.optional,
      api.nullable,
      api.default,
      api.catch,
      api.pipe,
      api.transform,
    ]) {
      expect(readArgInfo(wrap(inner))).toMatchObject(metadata);
    }
    const outer = api.meta(api.optional(inner), {
      alias: "b",
      valueName: "OTHER",
      env: false,
      title: "OTHER",
      description: "Outer description",
    });
    expect(readArgInfo(outer)).toMatchObject({
      alias: "b",
      valueName: "OTHER",
      env: false,
      title: "OTHER",
      description: "Outer description",
    });
  });

  it("recognizes array inputs only through the schema reader", () => {
    expect(isArrayInput(api.array(api.string()))).toBe(true);
    expect(isArrayInput(api.optional(api.array(api.string())))).toBe(true);
    expect(isArrayInput(api.default(api.array(api.string())))).toBe(true);
    expect(isArrayInput(api.transform(api.array(api.string())))).toBe(true);
    expect(isArrayInput(api.string())).toBe(false);
  });

  it("reads enum choices through wrappers and from variadic array elements", () => {
    expect(readArgInfo(api.optional(api.enum()))).toMatchObject({
      choices: ["small", "large"],
    });
    expect(readArgInfo(api.array(api.default(api.enum())))).toMatchObject({
      choices: ["small", "large"],
    });
    expect(readArgInfo(api.numericEnum())).toMatchObject({ choices: ["0", "1"] });
  });
});

it("does not infer choices from unions, literals, or refinements", () => {
  expect(readArgInfo(z.union([z.literal("small"), z.literal("large")])).choices).toBeUndefined();
  expect(readArgInfo(z.literal(["small", "large"])).choices).toBeUndefined();
  expect(readArgInfo(z.string().refine((value) => value === "small")).choices).toBeUndefined();
});
