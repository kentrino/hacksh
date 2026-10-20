import { describe, expect, expectTypeOf, it, vi } from "vite-plus/test";
import { z } from "zod";
import * as mini from "zod/mini";
import {
  defineCommand,
  HackshPromptError,
  createPrettyPrinter,
  parseArgs,
  renderUsage,
  showUsage,
  summarizeUsage,
  HackshValidationError,
  type HackshExecError,
  type Exec,
  type ExecCommand,
  type ExecPrintEvent,
  type ExecFailure,
  type ExecFailureReason,
  type ExecOptions,
  type ExecResult,
  type ExecReturn,
  type ExecSuccess,
  type Printer,
  type Logger,
  type HackshErrorKind,
  type LogKind,
  type LogLevel,
  type LogPrintEvent,
  type LogProperties,
  type LogRecord,
  type OutputMode,
  type OutputPreference,
  type PrettyPrinterOptions,
  type PrintEvent,
  type PromptPrintEvent,
  type PromptState,
  type RunCommandOptions,
  type RunMainOptions,
  type TerminalInput,
  type TerminalOutput,
  type ArgOptions,
  type ShowUsageOptions,
  type UsageOptionSummary,
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
      HackshValidationError,
    );
  });

  it("does not write output or exit", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exit = vi.spyOn(process, "exit");
    const command = defineCommand({ args: z.object({ value: z.string() }) });

    await expect(parseArgs(command, [])).rejects.toBeInstanceOf(HackshValidationError);
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

    await expect(parseArgs(command, ["--help"])).rejects.toBeInstanceOf(HackshValidationError);
    await expect(parseArgs(command, ["--version"])).rejects.toBeInstanceOf(HackshValidationError);
  });

  it("honors the separator while returning only schema output", async () => {
    const command = defineCommand({ args: z.object({ value: z.string() }) });

    await expect(
      parseArgs(command, ["--value", "before", "--", "--value", "after"]),
    ).resolves.toEqual({ value: "before" });
    await expect(parseArgs(command, ["--", "--value", "after"])).rejects.toBeInstanceOf(
      HackshValidationError,
    );
  });

  it("types an optional environment bag on parseArgs", () => {
    expectTypeOf<Parameters<typeof parseArgs>[2]>().toEqualTypeOf<
      { readonly env?: Readonly<Record<string, string | undefined>> } | undefined
    >();
    expectTypeOf<ArgOptions["env"]>().toEqualTypeOf<string | false | undefined>();
    expectTypeOf<UsageOptionSummary["env"]>().toEqualTypeOf<string | undefined>();
  });
});

describe("public logger API", () => {
  it("infers logger types on the command context and print event", () => {
    defineCommand({
      run({ logger }) {
        expectTypeOf(logger).toEqualTypeOf<Logger>();
        expectTypeOf(logger.category).toEqualTypeOf<readonly string[]>();
        expectTypeOf<Logger["info"]>().parameter(0).toEqualTypeOf<string>();
        expectTypeOf<Logger["info"]>().parameter(1).toEqualTypeOf<LogProperties | undefined>();
        expectTypeOf<Logger["error"]>().parameter(0).toEqualTypeOf<string | Error>();
        expectTypeOf(logger.with({ requestId: "1" })).toEqualTypeOf<Logger>();
        expectTypeOf(logger.getChild("child")).toEqualTypeOf<Logger>();
        expectTypeOf(
          logger.select({
            message: "Environment",
            options: [{ value: "staging" }, { value: "production" }] as const,
          }),
        ).toEqualTypeOf<Promise<"staging" | "production">>();
        expectTypeOf(logger.confirm({ message: "Continue?" })).toEqualTypeOf<Promise<boolean>>();
        expectTypeOf(logger.text({ message: "Name" })).toEqualTypeOf<Promise<string>>();
      },
    });

    expectTypeOf<LogLevel>().toEqualTypeOf<
      "trace" | "debug" | "info" | "warning" | "error" | "fatal"
    >();
    expectTypeOf<LogKind>().toEqualTypeOf<"message" | "step" | "success">();
    expectTypeOf<HackshErrorKind>().toEqualTypeOf<
      "error" | "prompt" | "usage" | "validation" | "thrown"
    >();
    expectTypeOf<LogPrintEvent["record"]>().toEqualTypeOf<LogRecord>();
    expectTypeOf<PromptPrintEvent>().toMatchTypeOf<PrintEvent>();
    expectTypeOf<ExecPrintEvent>().toMatchTypeOf<PrintEvent>();
    expectTypeOf<RunCommandOptions["stdin"]>().toEqualTypeOf<TerminalInput | undefined>();
    const inspectPrompt = (state: PromptState): void => {
      if (state.kind === "select") expectTypeOf(state.value).toEqualTypeOf<string>();
      else if (state.kind === "confirm") expectTypeOf(state.value).toEqualTypeOf<boolean>();
      else expectTypeOf(state.value).toEqualTypeOf<string>();
    };
    expectTypeOf(inspectPrompt).toBeFunction();
    expectTypeOf(
      new HackshPromptError("cancelled", { kind: "text", message: "Name" }, "no"),
    ).toMatchTypeOf<Error>();
  });
});

describe("public exec API", () => {
  it("types context exec and narrows results by status and reason", () => {
    defineCommand({
      async run({ exec }) {
        expectTypeOf(exec).toEqualTypeOf<Exec>();
        expectTypeOf(exec("git", ["status"])).toEqualTypeOf<Promise<ExecSuccess>>();
        expectTypeOf(exec("git", [], { cwd: "/repo", reject: true })).toEqualTypeOf<
          Promise<ExecSuccess>
        >();
        expectTypeOf(exec("git", [], { reject: undefined })).toEqualTypeOf<Promise<ExecSuccess>>();
        expectTypeOf(exec("git", [], { reject: false })).toEqualTypeOf<Promise<ExecResult>>();
        const reject: boolean = Math.random() > 0.5;
        expectTypeOf(exec("git", [], { reject })).toEqualTypeOf<Promise<ExecResult>>();
        const options: ExecOptions = {};
        expectTypeOf(exec("git", [], options)).toEqualTypeOf<Promise<ExecResult>>();
        expectTypeOf(
          exec("git", [], {
            input: "data",
            stdin: "pipe",
            stdout: "inherit",
            stderr: "pipe",
            interactive: true,
            display: false,
            redact: ["token"],
          }),
        ).toEqualTypeOf<Promise<ExecSuccess>>();
        // @ts-expect-error input cannot be combined with inherited stdin
        void exec("git", [], { input: "data", stdin: "inherit" });
        const inheritedInput: ExecOptions = { input: "data", stdin: "inherit" };
        expectTypeOf(exec("git", [], inheritedInput)).toEqualTypeOf<Promise<ExecResult>>();
        // @ts-expect-error env values must be strings or undefined
        void exec("git", [], { env: { A: 1 } });
        // @ts-expect-error a misspelled option is rejected next to a valid one
        void exec("git", [], { cwd: ".", rejct: false });
        // @ts-expect-error a misspelled option is rejected on its own
        void exec("git", [], { rejct: false });
        expectTypeOf(exec("git", [], { reject: true })).toEqualTypeOf<Promise<ExecSuccess>>();
        expectTypeOf(exec("git", [], {})).toEqualTypeOf<Promise<ExecSuccess>>();

        const result = await exec("git", [], { reject: false });
        // @ts-expect-error exitCode exists only after narrowing
        void result.exitCode;
        if (result.status === "succeeded") {
          expectTypeOf(result).toEqualTypeOf<ExecSuccess>();
          expectTypeOf(result.exitCode).toEqualTypeOf<0>();
          // @ts-expect-error a success has no failure reason
          void result.reason;
          return;
        }
        expectTypeOf(result.reason).toEqualTypeOf<ExecFailureReason>();
        expectTypeOf(result.command).toEqualTypeOf<ExecCommand>();
        expectTypeOf(result.stdout).toEqualTypeOf<string>();
        if (result.reason === "exit-code") expectTypeOf(result.exitCode).toEqualTypeOf<number>();
        if (result.reason === "signal") expectTypeOf(result.signal).toEqualTypeOf<string>();
        if (result.reason === "spawn") expectTypeOf(result.error).toEqualTypeOf<Error>();
        if (result.reason === "timeout") {
          // @ts-expect-error hacksh-initiated terminations carry no exit details
          void result.exitCode;
        }
        if (
          result.reason === "json-output" ||
          result.reason === "non-interactive" ||
          result.reason === "overlapping"
        ) {
          expectTypeOf(result.stdout).toEqualTypeOf<string>();
          // @ts-expect-error terminal refusals carry no exit details
          void result.exitCode;
        }
      },
    });

    expectTypeOf<ExecFailureReason>().toEqualTypeOf<
      | "exit-code"
      | "signal"
      | "spawn"
      | "timeout"
      | "aborted"
      | "output-limit"
      | "json-output"
      | "non-interactive"
      | "overlapping"
    >();
    expectTypeOf<ExecResult>().toEqualTypeOf<ExecSuccess | ExecFailure>();
    expectTypeOf<ExecReturn<{ readonly reject: false }>>().toEqualTypeOf<ExecResult>();
    expectTypeOf<ExecReturn<{}>>().toEqualTypeOf<ExecSuccess>();
    expectTypeOf<HackshExecError["result"]>().toEqualTypeOf<ExecFailure>();
    expectTypeOf<ExecCommand>().toEqualTypeOf<{
      file: string;
      args: readonly string[];
      cwd: string | undefined;
    }>();
  });

  it("accepts a fake exec on a directly invoked run", async () => {
    const fake: Exec = async (file, args = []) =>
      ({
        status: "succeeded",
        command: { file, args, cwd: undefined },
        stdout: "main",
        stderr: "",
        exitCode: 0,
      }) as never;
    const command = defineCommand({
      async run({ exec }) {
        return (await exec("git", ["branch", "--show-current"])).stdout;
      },
    });
    const context = { exec: fake } as Parameters<NonNullable<typeof command.run>>[0];
    await expect(command.run?.(context)).resolves.toBe("main");
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
      usage: expect.objectContaining({ name: "tool", synopsis: "tool [OPTIONS]" }),
      text: expect.stringContaining("USAGE tool"),
      stream: "stderr",
    });
    const event = print.mock.calls[0]![0] as PrintEvent;
    expect(event).not.toHaveProperty("command");
    if (event.type === "usage") {
      expect(event.usage).toEqual({
        name: "tool",
        heading: "tool",
        synopsis: "tool [OPTIONS]",
        arguments: [],
        options: [],
        commands: [],
      });
    }
  });

  it("exposes stable output selection contracts", () => {
    expectTypeOf<RunCommandOptions["output"]>().toEqualTypeOf<OutputPreference | undefined>();
    expectTypeOf<RunMainOptions["output"]>().toEqualTypeOf<OutputPreference | undefined>();
    expectTypeOf<OutputMode>().toEqualTypeOf<{
      format: "pretty" | "json";
      interactive: boolean;
      color: boolean;
    }>();
    expectTypeOf<RunCommandOptions["unicode"]>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<PrettyPrinterOptions>().toEqualTypeOf<{
      color: boolean;
      unicode: boolean;
      stdout?: TerminalOutput;
      stderr?: { write(text: string): unknown };
    }>();
    expectTypeOf(createPrettyPrinter).parameter(0).toEqualTypeOf<PrettyPrinterOptions>();
    expectTypeOf<ShowUsageOptions["output"]>().toEqualTypeOf<OutputPreference | undefined>();
    expectTypeOf<ShowUsageOptions["unicode"]>().toEqualTypeOf<boolean | undefined>();
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
      },
    });
    const usage = await renderUsage(command);
    expect(usage).toContain("USAGE convert [OPTIONS] <SIZE> [INPUT...]");
    expect(usage).toContain("SIZE  Item size (Choices: small, large) (Required)");
    expect(usage).toContain("INPUT...  Input files (Choices: txt, md)");
    expect(usage).toContain("--format=<FORMAT>  Output format (Choices: json, yaml)");
    expect(usage).toContain("--[no-]overwrite  Replace existing files (Default: false)");
    expect(summarizeUsage(command)).toMatchObject({
      name: "convert",
      synopsis: "convert [OPTIONS] <SIZE> [INPUT...]",
      arguments: [
        {
          name: "SIZE",
          required: true,
          variadic: false,
          description: "Item size",
          choices: ["small", "large"],
        },
        {
          name: "INPUT",
          required: false,
          variadic: true,
          description: "Input files",
          choices: ["txt", "md"],
        },
      ],
      options: [
        {
          name: "format",
          flags: ["--format"],
          takesValue: true,
          negatable: false,
          valueName: "FORMAT",
          choices: ["json", "yaml"],
        },
        {
          name: "overwrite",
          flags: ["--overwrite"],
          takesValue: false,
          negatable: true,
          defaultValue: false,
        },
      ],
    });
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

  it("uses automatic pretty output for standalone help", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await showUsage(defineCommand({ name: "tool" }), { env: {} });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("◆  tool\n│\n│  USAGE tool"));
  });

  it.each([
    ["CI", { CI: "1" }, undefined],
    ["HACKSH_OUTPUT", { HACKSH_OUTPUT: "json" }, "pretty"],
  ] as const)("selects standalone JSON help through %s", async (_name, env, output) => {
    const stdout: string[] = [];
    await showUsage(defineCommand({ name: "tool" }), {
      env,
      output,
      stdout: { isTTY: true, write: (text) => void stdout.push(text) },
    });

    expect(stdout).toHaveLength(1);
    expect(JSON.parse(stdout[0]!)).toMatchObject({
      type: "usage",
      usage: { name: "tool", synopsis: "tool [OPTIONS]" },
      stream: "stdout",
    });
    expect(stdout[0]).not.toContain(`${String.fromCodePoint(27)}[`);
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
