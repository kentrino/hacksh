import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import { z } from "zod";
import { defineCommand } from "./index.ts";

describe("defineCommand", () => {
  it("infers mutable zod output and supports omitted args", () => {
    const command = defineCommand({
      args: z.object({ count: z.coerce.number(), label: z.string().optional() }),
      positional: ["count"],
      run({ args }) {
        expectTypeOf(args).toEqualTypeOf<{ count: number; label?: string }>();
        args.count += 1;
      },
    });
    expect(command.positional).toEqual(["count"]);
    defineCommand({ run: ({ args }) => expectTypeOf(args).toBeObject() });
  });

  it.each([
    ["unknown positional", { args: z.object({ x: z.string() }), positional: ["y"] }],
    ["duplicate positional", { args: z.object({ x: z.string() }), positional: ["x", "x"] }],
    [
      "optional before required",
      {
        args: z.object({ x: z.string().optional(), y: z.string() }),
        positional: ["x", "y"],
      },
    ],
    ["boolean positional", { args: z.object({ x: z.boolean() }), positional: ["x"] }],
    [
      "positional alias",
      {
        args: z.object({ x: z.string() }),
        positional: ["x"],
        alias: { x: "x" },
      },
    ],
    ["invalid alias", { args: z.object({ x: z.string() }), alias: { x: "xx" } }],
    [
      "duplicate alias",
      {
        args: z.object({ x: z.string(), y: z.string() }),
        alias: { x: "a", y: "a" },
      },
    ],
    ["negation collision", { args: z.object({ noFocus: z.boolean() }) }],
    ["value-option negation collision", { args: z.object({ "no-focus": z.string() }) }],
    [
      "positional and subcommands",
      {
        args: z.object({ x: z.string() }),
        positional: ["x"],
        subCommands: { sub: {} },
      },
    ],
  ])("rejects invalid definitions: %s", (_name, input) => {
    expect(() => defineCommand(input as never)).toThrow();
  });
});

const typedSchema = z.object({ repo: z.string(), verbose: z.boolean() });
defineCommand({ args: typedSchema, positional: ["repo"], alias: { verbose: "v" } });

if (process.env.ZITTY_TYPE_TESTS) {
  // @ts-expect-error positional keys must exist in the schema
  defineCommand({ args: typedSchema, positional: ["missing"] });
  // @ts-expect-error alias keys must exist in the schema
  defineCommand({ args: typedSchema, alias: { missing: "m" } });
}
