import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import { z } from "zod";
import { defineCommand } from "./index.ts";

describe("defineCommand", () => {
  it("infers mutable zod output and supports omitted args", () => {
    defineCommand({
      args: z.object({ _: z.tuple([z.coerce.number()]), label: z.string().optional() }),
      run({ args }) {
        expectTypeOf(args).toEqualTypeOf<{ _: [number]; label?: string }>();
        args._[0] += 1;
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
    ["non-tuple positionals", { args: z.object({ _: z.string() }) }],
    [
      "optional before required",
      { args: z.object({ _: z.tuple([z.string().optional(), z.string()]) }) },
    ],
    ["boolean positional", { args: z.object({ _: z.tuple([z.boolean()]) }) }],
    ["array positional", { args: z.object({ _: z.tuple([z.array(z.string())]) }) }],
    [
      "positional argument options",
      { args: z.object({ _: z.tuple([z.string()]) }), argOptions: { _: { alias: "x" } } },
    ],
    ["invalid alias", { args: z.object({ x: z.string() }), argOptions: { x: { alias: "xx" } } }],
    [
      "duplicate alias",
      {
        args: z.object({ x: z.string(), y: z.string() }),
        argOptions: { x: { alias: "a" }, y: { alias: "a" } },
      },
    ],
    ["negation collision", { args: z.object({ noFocus: z.boolean() }) }],
    ["builtin help collision", { args: z.object({ help: z.boolean() }) }],
    ["value-option negation collision", { args: z.object({ "no-focus": z.string() }) }],
    ["unknown argument options", { args: z.object({ x: z.string() }), argOptions: { y: {} } }],
    [
      "empty environment name",
      { args: z.object({ x: z.string() }), argOptions: { x: { env: "" } } },
    ],
    [
      "array environment name",
      { args: z.object({ x: z.array(z.string()) }), argOptions: { x: { env: "TAGS" } } },
    ],
    [
      "array environment disable",
      { args: z.object({ x: z.array(z.string()) }), argOptions: { x: { env: false } } },
    ],
    [
      "object environment name",
      {
        args: z.object({ x: z.object({ a: z.string() }) }),
        argOptions: { x: { env: "META" } },
      },
    ],
    [
      "positional and subcommands",
      { args: z.object({ _: z.tuple([z.string()]) }), subCommands: { sub: {} } },
    ],
    [
      "positional and hidden-only subcommands",
      { args: z.object({ _: z.tuple([z.string()]) }), subCommands: { sub: { hidden: true } } },
    ],
    [
      "variadic and subcommands",
      { args: z.object({ _: z.array(z.string()) }), subCommands: { sub: {} } },
    ],
  ])("rejects invalid definitions: %s", (_name, input) => {
    expect(() => defineCommand(input as never)).toThrow();
  });
});

const typedSchema = z.object({
  _: z.tuple([z.string().meta({ title: "REPOSITORY" })]),
  verbose: z.boolean(),
});
defineCommand({
  args: typedSchema,
  argOptions: { verbose: { alias: "v" } },
});
defineCommand({
  args: z.object({ _: z.tuple([z.string()], z.string()) }),
  run({ args }) {
    expectTypeOf(args).toEqualTypeOf<{ _: [string, ...string[]] }>();
  },
});

if (process.env.HACKSH_TYPE_TESTS) {
  // @ts-expect-error hidden must be boolean
  defineCommand({ hidden: "yes" });
  // @ts-expect-error argument options keys must exist in the schema
  defineCommand({ args: typedSchema, argOptions: { missing: { alias: "m" } } });
  // @ts-expect-error positional arguments cannot have argument options
  defineCommand({ args: typedSchema, argOptions: { _: { alias: "r" } } });
  // @ts-expect-error env must be a string or false
  defineCommand({ args: typedSchema, argOptions: { verbose: { env: 1 } } });
}
