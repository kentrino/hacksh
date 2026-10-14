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
    alias: { repo: ["R", "Q"], dryRun: ["d", "D"] },
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
    await expect(parseCommandArgs(command, ["-Q", "a/b", "-D", "one"])).resolves.toMatchObject({
      args: { repo: "a/b", dryRun: true, first: "one" },
    });
    await expect(parseCommandArgs(command, ["-Rowner/repo", "one"])).resolves.toMatchObject({
      args: { repo: "owner/repo", first: "one" },
    });
    await expect(parseCommandArgs(command, ["-Qowner/repo", "one"])).resolves.toMatchObject({
      args: { repo: "owner/repo", first: "one" },
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
    expect(result.args).toMatchObject({ first: "one", second: "two" });
  });

  it("preserves grouped unknown options once, including mixed groups", async () => {
    const grouped = defineCommand({
      args: z.object({ alpha: z.boolean().default(false) }),
      alias: { alpha: "a" },
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

  it("rejects inline boolean values instead of silently enabling the flag", async () => {
    const flags = defineCommand({ args: z.object({ execute: z.boolean().default(false) }) });
    await expect(parseCommandArgs(flags, ["--execute"])).resolves.toMatchObject({
      args: { execute: true },
    });
    await expect(parseCommandArgs(flags, ["--no-execute"])).resolves.toMatchObject({
      args: { execute: false },
    });
    await expect(parseCommandArgs(flags, ["--execute=false"])).rejects.toMatchObject({
      issues: [expect.objectContaining({ arg: "--execute" })],
    });
    await expect(parseCommandArgs(flags, ["--execute=no"])).rejects.toMatchObject({
      issues: [expect.objectContaining({ arg: "--execute" })],
    });
  });

  it("reports missing values without consuming the following option", async () => {
    const error = await parseCommandArgs(command, ["--repo", "--dry-run", "one"]).catch(
      (caught: unknown) => caught,
    );
    expect(error).toMatchObject({ issues: [{ arg: "--repo", message: "requires a value" }] });
    expect((error as ZittyValidationError).issues[0]).not.toHaveProperty("issue");
    await expect(parseCommandArgs(command, ["--repo"])).rejects.toMatchObject({
      issues: [{ arg: "--repo", message: "requires a value" }],
    });
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

  it("accepts single-character long option names", async () => {
    const shortName = defineCommand({ args: z.object({ n: z.coerce.number() }) });
    await expect(parseCommandArgs(shortName, ["--n", "21"])).resolves.toMatchObject({
      args: { n: 21 },
    });
  });
});
