import { describe, expect, expectTypeOf, it, vi } from "vite-plus/test";
import { z } from "zod";
import * as mini from "zod/mini";
import {
  defineCommand,
  parseArgs,
  renderUsage,
  showUsage,
  ZittyValidationError,
  type Printer,
  type RunCommandOptions,
  type RunMainOptions,
} from "./index.ts";

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
  it("emits direct usage through a typed printer", async () => {
    const print = vi.fn<Printer["print"]>();
    const printer: Printer = { print };
    const command = defineCommand({ name: "tool" });

    expectTypeOf<RunCommandOptions["printer"]>().toEqualTypeOf<Printer | undefined>();
    expectTypeOf<RunMainOptions["printer"]>().toEqualTypeOf<Printer | undefined>();
    await showUsage(command, { printer, stream: "stderr" });

    expect(print).toHaveBeenCalledWith({
      type: "usage",
      command,
      text: expect.stringContaining("USAGE tool"),
      stream: "stderr",
    });
  });

  it("omits hidden subcommands from parent and nested listings", async () => {
    const group = defineCommand({
      subCommands: {
        nestedVisible: defineCommand({ description: "Nested public command" }),
        nestedHidden: defineCommand({
          description: "Nested implementation detail",
          hidden: true,
        }),
      },
    });
    const command = defineCommand({
      name: "tool",
      subCommands: {
        visible: defineCommand({ description: "Shown by default" }),
        explicit: defineCommand({ description: "Explicitly shown", hidden: false }),
        internal: defineCommand({ description: "Implementation detail", hidden: true }),
        group,
      },
    });

    const usage = await renderUsage(command);
    expect(usage).toContain("USAGE tool [OPTIONS] <COMMAND>");
    expect(usage).toContain("visible  Shown by default");
    expect(usage).toContain("explicit  Explicitly shown");
    expect(usage).toContain("group");
    expect(usage).not.toContain("internal");

    const written: string[] = [];
    await showUsage(command, {
      write(text) {
        written.push(text);
      },
    });
    expect(written).toEqual([usage]);

    const nestedUsage = await renderUsage(group);
    expect(nestedUsage).toContain("nestedVisible  Nested public command");
    expect(nestedUsage).not.toContain("nestedHidden");
  });

  it("keeps command syntax but omits an empty listing when every child is hidden", async () => {
    const command = defineCommand({
      name: "tool",
      subCommands: {
        internal: defineCommand({ description: "Implementation detail", hidden: true }),
      },
    });

    const usage = await renderUsage(command);
    expect(usage).toContain("USAGE tool [OPTIONS] <COMMAND>");
    expect(usage).not.toContain("COMMANDS");
    expect(usage).not.toContain("internal");
  });

  it.each([
    [
      "zod",
      z.object({
        _: z.tuple(
          [z.enum(["small", "large"]).describe("Item size").meta({ title: "SIZE" })],
          z.enum(["txt", "md"]).describe("Input files").meta({ title: "INPUT" }),
        ),
        format: z.enum(["json", "yaml"]).optional().describe("Output format"),
        overwrite: z.boolean().default(false).describe("Replace existing files"),
      }),
    ],
    [
      "zod/mini",
      mini.object({
        _: mini.tuple(
          [
            mini
              .enum(["small", "large"])
              .check(mini.describe("Item size"), mini.meta({ title: "SIZE" })),
          ],
          mini
            .enum(["txt", "md"])
            .check(mini.describe("Input files"), mini.meta({ title: "INPUT" })),
        ),
        format: mini.optional(mini.enum(["json", "yaml"])).check(mini.describe("Output format")),
        overwrite: mini
          ._default(mini.boolean(), false)
          .check(mini.describe("Replace existing files")),
      }),
    ],
  ])("renders enum choices and display metadata with %s", async (_name, args) => {
    const command = defineCommand({
      name: "convert",
      args,
      argOptions: {
        format: { valueName: "FORMAT" },
        overwrite: { negatedDescription: "Keep existing files" },
      },
    });
    const usage = await renderUsage(command);
    expect(usage).toContain("USAGE convert [OPTIONS] <SIZE> [INPUT...]");
    expect(usage).toContain("SIZE  Item size (Choices: small, large) (Required)");
    expect(usage).toContain("INPUT...  Input files (Choices: txt, md)");
    expect(usage).toContain("--format=<FORMAT>  Output format (Choices: json, yaml)");
    expect(usage).toContain("--no-overwrite  Keep existing files");
  });

  it.each([
    ["zod", z.object({ level: z.enum({ A: 0, B: 1, 0: "A", 1: "B" }) })],
    ["zod/mini", mini.object({ level: mini.enum({ A: 0, B: 1, 0: "A", 1: "B" }) })],
  ])("omits numeric enum reverse mappings from %s help", async (_name, args) => {
    const usage = await renderUsage(defineCommand({ name: "tool", args }));
    expect(usage).toContain("--level=<level>  (Choices: 0, 1) (Required)");
    expect(usage).not.toContain("A, B");
  });

  it("renders a variadic argument as trailing and not as a named option", async () => {
    const command = defineCommand({
      name: "copy",
      args: z.object({
        _: z.tuple(
          [z.string().describe("Output directory").meta({ title: "DESTINATION" })],
          z.string().describe("Input files").meta({ title: "FILES" }),
        ),
      }),
    });
    const usage = await renderUsage(command);
    expect(usage).toContain("USAGE copy [OPTIONS] <DESTINATION> [FILES...]");
    expect(usage).toContain("FILES...  Input files");
    expect(usage).not.toContain("OPTIONS\n");
    expect(usage).not.toContain("--_");
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
