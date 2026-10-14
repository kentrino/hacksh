import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import * as mini from "zod/mini";
import type { $ZodType } from "zod/v4/core";
import { readArgInfo } from "./schema.ts";

type TestApi = {
  string: () => $ZodType;
  boolean: () => $ZodType;
  optional: (schema: $ZodType) => $ZodType;
  nullable: (schema: $ZodType) => $ZodType;
  default: (schema: $ZodType) => $ZodType;
  pipe: (schema: $ZodType) => $ZodType;
  transform: (schema: $ZodType) => $ZodType;
  catch: (schema: $ZodType) => $ZodType;
  describe: (schema: $ZodType) => $ZodType;
};

const implementations: ReadonlyArray<[string, TestApi]> = [
  [
    "zod",
    {
      string: () => z.string(),
      boolean: () => z.boolean(),
      optional: (schema) => (schema as z.ZodType).optional(),
      nullable: (schema) => (schema as z.ZodType).nullable(),
      default: (schema) => (schema as z.ZodType).default("fallback"),
      pipe: (schema) => (schema as z.ZodType).pipe(z.string()),
      transform: (schema) => (schema as z.ZodType).transform(String),
      catch: (schema) => (schema as z.ZodType).catch("caught"),
      describe: (schema) => (schema as z.ZodType).describe("described"),
    },
  ],
  [
    "zod/mini",
    {
      string: () => mini.string(),
      boolean: () => mini.boolean(),
      optional: (schema) => mini.optional(schema),
      nullable: (schema) => mini.nullable(schema),
      default: (schema) => mini._default(schema, "fallback"),
      pipe: (schema) => mini.pipe(schema, mini.string()),
      transform: (schema) => mini.pipe(schema, mini.transform(String)),
      catch: (schema) => mini.catch(schema, "caught"),
      describe: (schema) => (schema as mini.ZodMiniType).check(mini.describe("described")),
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
    });
    expect(readArgInfo(api.catch(api.describe(api.string())))).toMatchObject({
      required: true,
      description: "described",
    });
    expect(readArgInfo(api.optional(api.describe(api.string())))).toMatchObject({
      required: false,
      description: "described",
    });
  });
});
