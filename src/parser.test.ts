import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import * as mini from "zod/mini";
import { defineCommand, HackshValidationError } from "./index.ts";
import { parseCommandArgs } from "./parser.ts";

describe("argument parsing and validation", () => {
  const command = defineCommand({
    args: z.object({
      repo: z.string(),
      dryRun: z.boolean().default(false),
      verbose: z.boolean().default(true),
      _: z.tuple([z.string(), z.string().optional()]),
    }),
    argOptions: { repo: { alias: ["R", "Q"] }, dryRun: { alias: ["d", "D"] } },
  });

  it("parses names, kebab names, aliases, equals values, flags, and negation", async () => {
    await expect(
      parseCommandArgs(command, ["-R", "a/b", "--dry-run", "--no-verbose", "one"]),
    ).resolves.toMatchObject({
      args: { repo: "a/b", dryRun: true, verbose: false, _: ["one"] },
    });
    await expect(
      parseCommandArgs(command, ["--repo=a/b", "--dryRun", "one"]),
    ).resolves.toMatchObject({ args: { repo: "a/b", dryRun: true, _: ["one"] } });
    await expect(parseCommandArgs(command, ["-Q", "a/b", "-D", "one"])).resolves.toMatchObject({
      args: { repo: "a/b", dryRun: true, _: ["one"] },
    });
    await expect(parseCommandArgs(command, ["-Rowner/repo", "one"])).resolves.toMatchObject({
      args: { repo: "owner/repo", _: ["one"] },
    });
    await expect(parseCommandArgs(command, ["-Qowner/repo", "one"])).resolves.toMatchObject({
      args: { repo: "owner/repo", _: ["one"] },
    });
  });

  it("keeps unknown options and positional overflow in original order", async () => {
    const result = await parseCommandArgs(command, [
      "--model",
      "one",
      "--repo=a/b",
      "two",
      "overflow",
      "--temperature=1",
      "--",
      "--sandbox",
    ]);
    expect(result.extraArgs).toEqual(["--model", "overflow", "--temperature=1"]);
    expect(result.passthrough).toEqual(["--sandbox"]);
    expect(result.args).toMatchObject({ _: ["one", "two"] });
  });

  it("collects trailing values after fixed positionals and preserves boundaries", async () => {
    const variadic = defineCommand({
      args: z.object({
        _: z.tuple(
          [z.string().optional()],
          z.string().transform((value) => value.toUpperCase()),
        ),
      }),
    });
    await expect(
      parseCommandArgs(variadic, ["dest", "a", "--unknown", "b", "--", "c"]),
    ).resolves.toEqual({
      args: { _: ["dest", "A", "B"] },
      extraArgs: ["--unknown"],
      passthrough: ["c"],
    });
    await expect(parseCommandArgs(variadic, [])).resolves.toEqual({
      args: { _: [] },
      extraArgs: [],
      passthrough: [],
    });
    await expect(parseCommandArgs(variadic, ["--_", "one"])).resolves.toEqual({
      args: { _: ["one"] },
      extraArgs: ["--_"],
      passthrough: [],
    });
  });

  it("supplies an empty array through optional and default wrappers", async () => {
    const optional = defineCommand({ args: z.object({ _: z.array(z.string()).optional() }) });
    const defaulted = defineCommand({
      args: z.object({ _: z.array(z.string()).default(["fallback"]) }),
    });
    await expect(parseCommandArgs(optional, [])).resolves.toMatchObject({ args: { _: [] } });
    await expect(parseCommandArgs(defaulted, [])).resolves.toMatchObject({ args: { _: [] } });
  });

  it("reports positional labels while retaining the full element path", async () => {
    const variadic = defineCommand({
      args: z.object({
        _: z.tuple(
          [z.coerce.number().meta({ title: "COUNT" })],
          z.coerce.number().int().positive().meta({ title: "VALUE" }),
        ),
      }),
    });
    const error = await parseCommandArgs(variadic, ["x", "1", "bad", "0"]).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(HackshValidationError);
    expect((error as HackshValidationError).issues).toHaveLength(3);
    expect((error as HackshValidationError).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          arg: "<COUNT>",
          issue: expect.objectContaining({ path: ["_", 0] }),
        }),
        expect.objectContaining({
          arg: "<VALUE...>",
          issue: expect.objectContaining({ path: ["_", 2] }),
        }),
        expect.objectContaining({
          arg: "<VALUE...>",
          issue: expect.objectContaining({ path: ["_", 3] }),
        }),
      ]),
    );
  });

  it("labels untitled positionals by position", async () => {
    const untitled = defineCommand({
      args: z.object({ _: z.tuple([z.string(), z.coerce.number()], z.coerce.number()) }),
    });
    const error = await parseCommandArgs(untitled, ["a", "x", "y"]).catch(
      (caught: unknown) => caught,
    );
    expect((error as HackshValidationError).issues.map(({ arg }) => arg).sort()).toEqual([
      "<ARG2>",
      "<ARGS...>",
    ]);
  });

  it("supports zod/mini variadic arrays", async () => {
    const variadic = defineCommand({
      args: mini.object({
        _: mini.array(
          mini.pipe(
            mini.string(),
            mini.transform((value) => value.toUpperCase()),
          ),
        ),
      }),
    });
    await expect(parseCommandArgs(variadic, ["a", "b"])).resolves.toEqual({
      args: { _: ["A", "B"] },
      extraArgs: [],
      passthrough: [],
    });
  });

  it("preserves grouped unknown options once, including mixed groups", async () => {
    const grouped = defineCommand({
      args: z.object({ alpha: z.boolean().default(false) }),
      argOptions: { alpha: { alias: "a" } },
    });
    await expect(parseCommandArgs(grouped, ["-ab", "-xy", "tail"])).resolves.toEqual({
      args: { alpha: true },
      extraArgs: ["-ab", "-xy", "tail"],
      passthrough: [],
    });
  });

  it("negates only known boolean options and preserves unknown --no-* options", async () => {
    const negated = defineCommand({ args: z.object({ enabled: z.boolean().default(true) }) });
    await expect(parseCommandArgs(negated, ["--no-enabled", "--no-mystery"])).resolves.toEqual({
      args: { enabled: false },
      extraArgs: ["--no-mystery"],
      passthrough: [],
    });
  });

  it("accepts explicit true and false only for inline boolean values", async () => {
    const flags = defineCommand({
      args: z.object({ execute: z.boolean().default(false), mode: z.string().optional() }),
    });
    await expect(parseCommandArgs(flags, ["--execute"])).resolves.toMatchObject({
      args: { execute: true },
    });
    await expect(parseCommandArgs(flags, ["--no-execute"])).resolves.toMatchObject({
      args: { execute: false },
    });
    await expect(parseCommandArgs(flags, ["--execute=false"])).resolves.toMatchObject({
      args: { execute: false },
    });
    await expect(parseCommandArgs(flags, ["--execute=true"])).resolves.toMatchObject({
      args: { execute: true },
    });
    await expect(parseCommandArgs(flags, ["--mode=false"])).resolves.toMatchObject({
      args: { execute: false, mode: "false" },
    });
    await expect(parseCommandArgs(flags, ["--execute=no"])).rejects.toMatchObject({
      issues: [expect.objectContaining({ arg: "--execute" })],
    });
    for (const value of ["false", "true", "no", ""]) {
      await expect(parseCommandArgs(flags, [`--no-execute=${value}`])).rejects.toMatchObject({
        issues: [
          expect.objectContaining({
            arg: "--no-execute",
            message: "does not accept a value",
          }),
        ],
      });
    }
  });

  it("reports boolean syntax before schema catches and later assignments", async () => {
    const flags = defineCommand({
      args: z.object({
        caught: z.boolean().catch(true),
        enabled: z.boolean().default(false),
      }),
    });
    await expect(parseCommandArgs(flags, ["--caught=no"])).rejects.toMatchObject({
      issues: [{ arg: "--caught", message: "expects true or false" }],
    });
    await expect(parseCommandArgs(flags, ["--no-caught=false"])).rejects.toMatchObject({
      issues: [{ arg: "--no-caught", message: "does not accept a value" }],
    });
    await expect(
      parseCommandArgs(flags, ["--enabled=no", "--enabled", "--no-caught=", "--caught"]),
    ).rejects.toMatchObject({
      issues: [
        { arg: "--enabled", message: "expects true or false" },
        { arg: "--no-caught", message: "does not accept a value" },
      ],
    });
  });

  it("reports missing values without consuming the following option", async () => {
    const error = await parseCommandArgs(command, ["--repo", "--dry-run", "one"]).catch(
      (caught: unknown) => caught,
    );
    expect(error).toMatchObject({ issues: [{ arg: "--repo", message: "requires a value" }] });
    expect((error as HackshValidationError).issues[0]).not.toHaveProperty("issue");
    await expect(parseCommandArgs(command, ["--repo"])).rejects.toMatchObject({
      issues: [{ arg: "--repo", message: "requires a value" }],
    });
  });

  it("runs async validation and maps every issue to CLI names", async () => {
    const validated = defineCommand({
      args: z.object({
        repo: z.string().regex(/^[^/]+\/[^/]+$/),
        _: z.tuple([
          z.coerce
            .number()
            .int()
            .refine(async (value) => value > 0, "must be positive")
            .meta({ title: "PR" }),
        ]),
      }),
      argOptions: { repo: { valueName: "OWNER/REPO" } },
    });
    const error = await parseCommandArgs(validated, ["--repo", "bad", "0"]).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(HackshValidationError);
    expect((error as HackshValidationError).issues).toEqual([
      expect.objectContaining({ arg: "--repo" }),
      expect.objectContaining({ arg: "<PR>", message: "must be positive" }),
    ]);
  });

  it("returns mutable schema output with defaults and transformations", async () => {
    const transformed = defineCommand({
      args: z.object({
        count: z.coerce.number().default(2),
        tag: z.string().transform((x) => x.toUpperCase()),
      }),
    });
    const result = await parseCommandArgs(transformed, ["--tag", "ok"]);
    expect(result.args).toEqual({ count: 2, tag: "OK" });
    result.args.count = 3;
    expect(result.args.count).toBe(3);
  });

  it("accepts single-character long option names", async () => {
    const shortName = defineCommand({ args: z.object({ n: z.coerce.number() }) });
    await expect(parseCommandArgs(shortName, ["--n", "21"])).resolves.toMatchObject({
      args: { n: 21 },
    });
  });
});
