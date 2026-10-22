import { describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";
import { defineCommand, HackshValidationError, parseArgs, runCommand } from "./index.ts";

const printer = { print: () => undefined };

describe("unknown argument policy", () => {
  it.each(["--typo", "--typo=value", "-x", "-xy", "overflow"])(
    "rejects %s before schema transforms and the handler",
    async (token) => {
      const transform = vi.fn((value: string) => value);
      const run = vi.fn();
      const command = defineCommand({
        args: z.object({ _: z.tuple([z.string().transform(transform)]) }),
        run,
      });
      await expect(runCommand(command, ["one", token], { printer })).rejects.toMatchObject({
        issues: [{ arg: token, message: "unexpected argument" }],
      });
      expect(transform).not.toHaveBeenCalled();
      expect(run).not.toHaveBeenCalled();
    },
  );

  it("rejects unknown input without a schema and preserves every offending token", async () => {
    const run = vi.fn();
    const command = defineCommand({ run });
    const error = await runCommand(command, ["--typo", "value", "-x"], { printer }).catch(
      (error: unknown) => error,
    );
    expect(error).toBeInstanceOf(HackshValidationError);
    expect(error).toMatchObject({
      issues: [
        { arg: "--typo", message: "unexpected argument" },
        { arg: "value", message: "unexpected argument" },
        { arg: "-x", message: "unexpected argument" },
      ],
    });
    expect(run).not.toHaveBeenCalled();
  });

  it("keeps passthrough independent of the policy, including builtin spellings", async () => {
    for (const allowUnknownArgs of [undefined, false, true]) {
      const command = defineCommand({
        allowUnknownArgs,
        run: ({ extraArgs, passthrough }) => ({ extraArgs, passthrough }),
      });
      await expect(
        runCommand(command, ["--", "--help", "--version", "a b", "--"], { printer }),
      ).resolves.toEqual({ extraArgs: [], passthrough: ["--help", "--version", "a b", "--"] });
    }
  });

  it("allows unknown input in order without guessing which option takes a value", async () => {
    const command = defineCommand({
      allowUnknownArgs: true,
      args: z.object({ _: z.tuple([z.string()]), known: z.boolean().default(false) }),
      run: ({ args, extraArgs, passthrough }) => ({ args, extraArgs, passthrough }),
    });
    await expect(
      runCommand(command, ["--unknown", "first", "--known", "tail", "-x", "--", "last"], {
        printer,
      }),
    ).resolves.toEqual({
      args: { _: ["first"], known: true },
      extraArgs: ["--unknown", "tail", "-x"],
      passthrough: ["last"],
    });
  });

  it("inherits through several levels and allows children to override without mutation", async () => {
    const leaf = defineCommand({ run: ({ extraArgs }) => extraArgs });
    const strict = defineCommand({ allowUnknownArgs: false, subCommands: { leaf } });
    const root = defineCommand({
      allowUnknownArgs: true,
      subCommands: { middle: defineCommand({ subCommands: { leaf } }), strict },
    });
    await expect(runCommand(root, ["middle", "leaf", "--extra"], { printer })).resolves.toEqual([
      "--extra",
    ]);
    await expect(runCommand(root, ["strict", "leaf", "--extra"], { printer })).rejects.toThrow(
      HackshValidationError,
    );
    await expect(runCommand(leaf, ["--extra"], { printer })).rejects.toThrow(HackshValidationError);
    expect(leaf.allowUnknownArgs).toBeUndefined();
  });

  it("validates parents independently of a permissive child", async () => {
    const run = vi.fn(({ extraArgs }) => extraArgs);
    const root = defineCommand({
      subCommands: { child: defineCommand({ allowUnknownArgs: true, run }) },
    });
    await expect(runCommand(root, ["--typo", "child"], { printer })).rejects.toMatchObject({
      issues: [{ arg: "--typo", message: "unexpected argument" }],
    });
    expect(run).not.toHaveBeenCalled();
    await expect(runCommand(root, ["child", "--typo"], { printer })).resolves.toEqual(["--typo"]);
  });

  it("gives routed help and root version precedence over unknown argument validation", async () => {
    const run = vi.fn();
    const command = defineCommand({
      version: "1.0.0",
      subCommands: { child: defineCommand({ run }) },
    });
    for (const argv of [
      ["--typo", "--version"],
      ["--typo", "--help"],
      ["--typo", "child", "--other", "--help"],
    ]) {
      await expect(runCommand(command, argv, { printer })).resolves.toBeUndefined();
    }
    expect(run).not.toHaveBeenCalled();
  });

  it("applies the same policy to standalone parseArgs", async () => {
    const command = defineCommand({ args: z.object({ value: z.string().default("ok") }) });
    await expect(parseArgs(command, ["--typo"])).rejects.toThrow(HackshValidationError);
    await expect(parseArgs({ ...command, allowUnknownArgs: true }, ["--typo"])).resolves.toEqual({
      value: "ok",
    });
    await expect(parseArgs(command, ["--", "--typo"])).resolves.toEqual({ value: "ok" });
  });

  it("rejects invalid policy definitions", () => {
    // @ts-expect-error policy must be boolean, including for untyped consumers
    expect(() => defineCommand({ allowUnknownArgs: "true" })).toThrow(TypeError);
  });
});
