import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import { defineCommand, ZittyValidationError } from "./index.ts";
import { parseCommandArgs } from "./parser.ts";

describe("argument parsing and validation", () => {
  const command = defineCommand({
    args: z.object({
      repo: z.string(),
      dryRun: z.boolean().default(false),
      verbose: z.boolean().default(true),
      first: z.string(),
      second: z.string().optional(),
    }),
    alias: { repo: "R", dryRun: ["d", "D"] },
    positional: ["first", "second"],
  });

  it("parses names, kebab names, aliases, equals values, flags, and negation", async () => {
    await expect(
      parseCommandArgs(command, ["-R", "a/b", "--dry-run", "--no-verbose", "one"]),
    ).resolves.toMatchObject({
      args: { repo: "a/b", dryRun: true, verbose: false, first: "one" },
    });
    await expect(
      parseCommandArgs(command, ["--repo=a/b", "--dryRun", "one"]),
    ).resolves.toMatchObject({ args: { repo: "a/b", dryRun: true, first: "one" } });
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
    expect(result.args).toMatchObject({ first: "one", second: "two" });
  });

  it("reports missing values without consuming the following option", async () => {
    const error = await parseCommandArgs(command, ["--repo", "--dry-run", "one"]).catch(
      (caught: unknown) => caught,
    );
    expect(error).toMatchObject({ issues: [{ arg: "--repo", message: "requires a value" }] });
    expect((error as ZittyValidationError).issues[0]).not.toHaveProperty("issue");
  });

  it("runs async validation and maps every issue to CLI names", async () => {
    const validated = defineCommand({
      args: z.object({
        repo: z.string().regex(/^[^/]+\/[^/]+$/),
        pr: z.coerce
          .number()
          .int()
          .refine(async (value) => value > 0, "must be positive"),
      }),
      positional: ["pr"],
    });
    const error = await parseCommandArgs(validated, ["--repo", "bad", "0"]).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ZittyValidationError);
    expect((error as ZittyValidationError).issues).toEqual([
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
});
