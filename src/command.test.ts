import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import { z } from "zod";
import { defineCommand } from "./index.ts";

describe("defineCommand", () => {
  it("infers mutable zod output and supports omitted args", () => {
    defineCommand({
      args: z.object({ positionals: z.tuple([z.coerce.number()]), label: z.string().optional() }),
      run({ args }) {
        expectTypeOf(args).toEqualTypeOf<{ positionals: [number]; label?: string }>();
        args.positionals[0] += 1;
      },
    });
    defineCommand({ run: ({ args }) => expectTypeOf(args).toBeObject() });
  });

  it("accepts optional boolean hidden metadata without changing output inference", () => {
    const command = defineCommand({
      hidden: true,
      args: z.object({ count: z.coerce.number() }),
      run({ args }) {
        expectTypeOf(args).toEqualTypeOf<{ count: number }>();
      },
    });
    const visible = defineCommand({ hidden: false });
    const defaultVisibility = defineCommand({});

    expect(command.hidden).toBe(true);
    expect(visible.hidden).toBe(false);
    expect(defaultVisibility.hidden).toBeUndefined();
  });

  it.each([
    ["non-tuple positionals", { args: z.object({ positionals: z.string() }) }],
    [
      "optional before required",
      { args: z.object({ positionals: z.tuple([z.string().optional(), z.string()]) }) },
    ],
    ["boolean positional", { args: z.object({ positionals: z.tuple([z.boolean()]) }) }],
    ["array positional", { args: z.object({ positionals: z.tuple([z.array(z.string())]) }) }],
    [
      "positional alias metadata",
      { args: z.object({ positionals: z.tuple([z.string()]).meta({ alias: "x" }) }) },
    ],
    ["invalid alias", { args: z.object({ x: z.string().meta({ alias: "xx" }) }) }],
    [
      "duplicate alias",
      {
        args: z.object({ x: z.string().meta({ alias: "a" }), y: z.string().meta({ alias: "a" }) }),
      },
    ],
    ["negation collision", { args: z.object({ noFocus: z.boolean() }) }],
    ["builtin help collision", { args: z.object({ help: z.boolean() }) }],
    ["value-option negation collision", { args: z.object({ "no-focus": z.string() }) }],
    ["empty environment name", { args: z.object({ x: z.string().meta({ env: "" }) }) }],
    [
      "array environment name",
      { args: z.object({ x: z.array(z.string()).meta({ env: "TAGS" }) }) },
    ],
    [
      "array environment disable",
      { args: z.object({ x: z.array(z.string()).meta({ env: false }) }) },
    ],
    [
      "object environment name",
      {
        args: z.object({ x: z.object({ a: z.string() }).meta({ env: "META" }) }),
      },
    ],
    [
      "positional and subcommands",
      { args: z.object({ positionals: z.tuple([z.string()]) }), subCommands: { sub: {} } },
    ],
    [
      "positional and hidden-only subcommands",
      {
        args: z.object({ positionals: z.tuple([z.string()]) }),
        subCommands: { sub: { hidden: true } },
      },
    ],
    [
      "variadic and subcommands",
      { args: z.object({ positionals: z.array(z.string()) }), subCommands: { sub: {} } },
    ],
  ])("rejects invalid definitions: %s", (_name, input) => {
    expect(() => defineCommand(input as never)).toThrow();
  });

  it.each([
    { alias: 1 },
    { alias: null },
    { alias: {} },
    { alias: ["a", 1] },
    { alias: "" },
    { alias: ["a", "a"] },
    { env: true },
    { env: 1 },
    { env: null },
    { valueName: 1 },
    { title: false },
    { description: [] },
  ])("rejects malformed schema metadata %j", (metadata) => {
    const schema = z
      .string()
      .meta(metadata as never)
      .optional();
    expect(() => defineCommand({ args: z.object({ value: schema }) })).toThrow(TypeError);
  });

  it.each([{ alias: "a" }, { env: "VALUE" }, { valueName: "VALUE" }])(
    "rejects option metadata on positional items and rest schemas %j",
    (metadata) => {
      const value = z.string().meta(metadata);
      expect(() => defineCommand({ args: z.object({ positionals: z.tuple([value]) }) })).toThrow(
        TypeError,
      );
      expect(() => defineCommand({ args: z.object({ positionals: z.array(value) }) })).toThrow(
        TypeError,
      );
    },
  );

  it.each(["help", "version"])("reserves the %s option on every command", (key) => {
    expect(() => defineCommand({ args: z.object({ [key]: z.string() }) })).toThrow(TypeError);
    expect(() =>
      defineCommand({
        subCommands: { child: defineCommand({ args: z.object({ [key]: z.string() }) }) },
      }),
    ).toThrow(TypeError);
  });
});

const typedSchema = z.object({
  positionals: z.tuple([z.string().meta({ title: "REPOSITORY" })]),
  verbose: z.boolean().meta({ alias: "v" }),
});
defineCommand({
  args: typedSchema,
});
defineCommand({
  args: z.object({ positionals: z.tuple([z.string()], z.string()) }),
  run({ args }) {
    expectTypeOf(args).toEqualTypeOf<{ positionals: [string, ...string[]] }>();
  },
});

if (process.env.HACKSH_TYPE_TESTS) {
  // @ts-expect-error hidden must be boolean
  defineCommand({ hidden: "yes" });
}
