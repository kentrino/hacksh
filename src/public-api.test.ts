import { describe, expect, expectTypeOf, it, vi } from "vite-plus/test";
import { z } from "zod";
import * as mini from "zod/mini";
import { defineCommand, parseArgs, renderUsage, showUsage, ZittyValidationError } from "./index.ts";

describe("public parsing API", () => {
  it("returns only validated zod output and awaits async validation", async () => {
    const command = defineCommand({
      args: z.object({
        count: z.coerce.number().transform(async (value) => value * 2),
        label: z.string().default("default"),
      }),
    });
    const parsed = parseArgs(command, ["--count", "3"]);
    expectTypeOf(parsed).toEqualTypeOf<Promise<{ count: number; label: string }>>();
    await expect(parsed).resolves.toEqual({ count: 6, label: "default" });
  });

  it("infers zod/mini output and throws existing validation errors", async () => {
    const command = defineCommand({
      args: mini.object({ value: mini._default(mini.string(), "mini") }),
    });
    const parsed = parseArgs(command, []);
    expectTypeOf(parsed).toEqualTypeOf<Promise<{ value: string }>>();
    await expect(parsed).resolves.toEqual({ value: "mini" });

    const invalid = defineCommand({ args: z.object({ count: z.coerce.number() }) });
    await expect(parseArgs(invalid, ["--count", "bad"])).rejects.toBeInstanceOf(
      ZittyValidationError,
    );
  });

  it("does not write output or exit", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exit = vi.spyOn(process, "exit");
    const command = defineCommand({ args: z.object({ value: z.string() }) });

    await expect(parseArgs(command, [])).rejects.toBeInstanceOf(ZittyValidationError);
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it("parses only the supplied command segment without subcommand routing", async () => {
    const childRun = vi.fn();
    const child = defineCommand({
      args: z.object({ value: z.string() }),
      run: childRun,
    });
    const root = defineCommand({
      args: z.object({ rootValue: z.string().default("root") }),
      subCommands: { child },
    });

    await expect(parseArgs(root, ["child", "--value", "selected"])).resolves.toEqual({
      rootValue: "root",
    });
    await expect(parseArgs(root, ["unknown", "--value", "ignored"])).resolves.toEqual({
      rootValue: "root",
    });
    await expect(parseArgs(child, ["--value", "selected"])).resolves.toEqual({
      value: "selected",
    });
    expect(childRun).not.toHaveBeenCalled();
  });

  it("does not treat help or version tokens as validation bypasses", async () => {
    const command = defineCommand({
      version: "1.0.0",
      args: z.object({ value: z.string() }),
    });

    await expect(parseArgs(command, ["--help"])).rejects.toBeInstanceOf(ZittyValidationError);
    await expect(parseArgs(command, ["--version"])).rejects.toBeInstanceOf(ZittyValidationError);
  });

  it("honors the separator while returning only schema output", async () => {
    const command = defineCommand({ args: z.object({ value: z.string() }) });

    await expect(
      parseArgs(command, ["--value", "before", "--", "--value", "after"]),
    ).resolves.toEqual({ value: "before" });
    await expect(parseArgs(command, ["--", "--value", "after"])).rejects.toBeInstanceOf(
      ZittyValidationError,
    );
  });
});

describe("public usage API", () => {
  it.each([
    [
      "zod",
      z.object({
        size: z.enum(["small", "large"]).describe("Item size"),
        format: z.enum(["json", "yaml"]).optional().describe("Output format"),
        overwrite: z.boolean().default(false).describe("Replace existing files"),
        files: z.array(z.enum(["txt", "md"])).describe("Input files"),
      }),
    ],
    [
      "zod/mini",
      mini.object({
        size: mini.enum(["small", "large"]).check(mini.describe("Item size")),
        format: mini.optional(mini.enum(["json", "yaml"])).check(mini.describe("Output format")),
        overwrite: mini
          ._default(mini.boolean(), false)
          .check(mini.describe("Replace existing files")),
        files: mini.array(mini.enum(["txt", "md"])).check(mini.describe("Input files")),
      }),
    ],
  ])("renders enum choices and display metadata with %s", async (_name, args) => {
    const command = defineCommand({
      name: "convert",
      args,
      positional: ["size"],
      variadic: "files",
      argDisplay: {
        size: { name: "SIZE" },
        format: { valueName: "FORMAT" },
        overwrite: { negatedDescription: "Keep existing files" },
        files: { name: "INPUT" },
      },
    });
    const usage = await renderUsage(command);
    expect(usage).toContain("USAGE convert [OPTIONS] <SIZE> [INPUT...]");
    expect(usage).toContain("SIZE  Item size (Choices: small, large) (Required)");
    expect(usage).toContain("INPUT...  Input files (Choices: txt, md)");
    expect(usage).toContain("--format=<FORMAT>  Output format (Choices: json, yaml)");
    expect(usage).toContain("--no-overwrite  Keep existing files");
  });

  it("renders a variadic argument as trailing and not as a named option", async () => {
    const command = defineCommand({
      name: "copy",
      args: z.object({
        destination: z.string().describe("Output directory"),
        files: z.array(z.string()).describe("Input files"),
      }),
      positional: ["destination"],
      variadic: "files",
    });
    const usage = await renderUsage(command);
    expect(usage).toContain("USAGE copy [OPTIONS] <DESTINATION> [FILES...]");
    expect(usage).toContain("FILES...  Input files");
    expect(usage).not.toContain("--files");
  });

  it("shares rendering, supports async writers, and keeps rendering side-effect free", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exit = vi.spyOn(process, "exit");
    const command = defineCommand({
      name: "tool",
      args: z.object({ value: z.string().describe("A value") }),
    });

    const rendered = renderUsage(command);
    expectTypeOf(rendered).toEqualTypeOf<Promise<string>>();
    const text = await rendered;
    expect(text).toContain("USAGE tool [OPTIONS]");
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();

    const written: string[] = [];
    const result = showUsage(command, {
      async write(value) {
        await Promise.resolve();
        written.push(value);
      },
    });
    expectTypeOf(result).toEqualTypeOf<Promise<void>>();
    await result;
    expect(written).toEqual([text]);
  });

  it("writes to console.log by default", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await showUsage(defineCommand({ name: "tool" }));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("USAGE tool"));
  });

  it.each(["NO_COLOR", "CI"])(
    "keeps rendered and emitted usage ANSI-free under %s",
    async (key) => {
      vi.stubEnv(key, "1");
      const command = defineCommand({
        name: "tool",
        args: z.object({ value: z.string().describe("A value") }),
      });
      const rendered = await renderUsage(command);
      const written: string[] = [];
      await showUsage(command, {
        write(text) {
          written.push(text);
        },
      });
      expect(rendered).not.toContain(`${String.fromCodePoint(27)}[`);
      expect(written).toEqual([rendered]);
    },
  );
});
