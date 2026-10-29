export function consumerSource(zodSpecifier, miniSpecifier, packageSpecifier) {
  return `
import { existsSync } from "node:fs";
import { z } from ${JSON.stringify(zodSpecifier)};
import * as mini from ${JSON.stringify(miniSpecifier)};
import {
  runMain,
  defineCommand,
  parseArgs,
  renderUsage,
  showUsage,
  HackshError,
  HackshValidationError,
} from ${JSON.stringify(packageSpecifier)};
import { createPrettyPrinter, createJsonPrinter } from ${JSON.stringify(packageSpecifier + "/printer")};
class AppError extends HackshError {}
async function verifyPhaseTwo(label, phaseCommand) {
  const usage = renderUsage(phaseCommand);
  for (const expected of [
    "<MODE>",
    "[INPUT...]",
    "Execution mode (Choices: fast, safe)",
    "--format=<FORMAT>",
    "Output format (Choices: json, yaml)",
    "Input files (Choices: txt, md)",
    "--[no-]enabled  Enable feature (Default: true)",
  ]) {
    if (!usage.includes(expected)) throw new Error(label + " help omitted " + expected + "\\n" + usage);
  }
  const parsed = await parseArgs(phaseCommand, [
    "fast",
    "txt",
    "md",
    "--format=json",
    "--enabled=false",
  ]);
  if (
    parsed.positionals.join(",") !== "fast,txt,md" ||
    parsed.format !== "json" ||
    parsed.enabled !== false
  ) {
    throw new Error(label + " combined phase 2 parse failed: " + JSON.stringify(parsed));
  }
  const explicitTrue = await parseArgs(phaseCommand, ["safe", "--enabled=true"]);
  if (explicitTrue.enabled !== true || explicitTrue.positionals.join(",") !== "safe") {
    throw new Error(label + " explicit true or empty variadic failed");
  }
  for (const token of ["--enabled=maybe", "--no-enabled=false"]) {
    const error = await parseArgs(phaseCommand, ["safe", token]).catch((caught) => caught);
    if (!(error instanceof HackshValidationError) || !error.message.includes(token.split("=")[0])) {
      throw new Error(label + " boolean error missing for " + token + ": " + String(error));
    }
  }
}
const phaseCommand = defineCommand({
  args: z.object({
    positionals: z.tuple(
      [z.enum(["fast", "safe"]).meta({ title: "MODE", description: "Execution mode" })],
      z.enum(["txt", "md"]).meta({ title: "INPUT", description: "Input files" }),
    ),
    enabled: z.boolean().default(true).meta({ description: "Enable feature" }),
    format: z.enum(["json", "yaml"]).optional().meta({ description: "Output format", valueName: "FORMAT" }),
  }),
});
const miniPhaseCommand = defineCommand({
  args: mini.object({
    positionals: mini.tuple(
      [mini.enum(["fast", "safe"]).check(mini.meta({ description: "Execution mode" }), mini.meta({ title: "MODE" }))],
      mini.enum(["txt", "md"]).check(mini.meta({ description: "Input files" }), mini.meta({ title: "INPUT" })),
    ),
    enabled: mini._default(mini.boolean(), true).check(mini.meta({ description: "Enable feature" })),
    format: mini.optional(mini.enum(["json", "yaml"])).check(mini.meta({ description: "Output format", valueName: "FORMAT" })),
  }),
});
await verifyPhaseTwo("zod", phaseCommand);
await verifyPhaseTwo("zod/mini", miniPhaseCommand);
function hiddenCommand(flavor, args) {
  return defineCommand({
    hidden: true,
    description: "Internal " + flavor + " command",
    args,
    run({ command, args: parsed }) {
      console.log(JSON.stringify({ flavor, command: command.name, args: parsed }));
    },
  });
}
const zodHidden = hiddenCommand(
  "zod",
  z.object({
    mode: z.enum(["fast", "safe"]).meta({ description: "Execution mode", valueName: "MODE" }),
    enabled: z.boolean().default(true).meta({ description: "Enable feature" }),
  }),
);
const miniHidden = hiddenCommand(
  "zod/mini",
  mini.object({
    mode: mini.enum(["fast", "safe"]).check(mini.meta({ description: "Execution mode", valueName: "MODE" })),
    enabled: mini._default(mini.boolean(), true).check(mini.meta({ description: "Enable feature" })),
  }),
);
const runtimeScript = (code, ...args) =>
  typeof Deno === "undefined" ? ["-e", code, ...args] : ["eval", code, ...args];
const echoArguments =
  "console.log(JSON.stringify(typeof Deno === 'undefined' ? process.argv.slice(1) : Deno.args))";
const exitThree = "typeof Deno === 'undefined' ? process.exit(3) : Deno.exit(3)";
const legacyCommand = defineCommand({
  allowUnknownArgs: true,
  args: z.object({
    enabled: z.boolean().default(true),
    repo: z.string().optional().meta({ alias: ["R", "Q"] }),
    positionals: z.array(z.string().transform((value) => value.toUpperCase())),
  }),
  run({ command, args, input }) {
    console.log(JSON.stringify({ command: command.name, args, input }));
  },
});
function terminalCommand(flavor, args) {
  return defineCommand({
    description: "Exercise installed terminal output with " + flavor,
    args,
    run({ args: parsed, logger }) {
      if (parsed.target === "explode") {
        throw Object.assign(new AppError("runtime exploded", { cause: new Error("runtime cause") }), {
          code: "E_RUNTIME",
        });
      }
      const log = logger.with({ flavor, target: parsed.target });
      log.trace("trace {target}");
      log.debug("debug {target}");
      log.info("info {target}");
      log.step("step {target}");
      log.success("success {target}");
      log.warn("warning {target}");
      log.error("error {target}");
      log.fatal("fatal {target}");
    },
  });
}
const command = defineCommand({
  name: "packed-consumer",
  version: "1.2.3",
  subCommands: {
    visible: defineCommand({ ...legacyCommand, description: "Public command" }),
    "zod-hidden": zodHidden,
    "mini-hidden": miniHidden,
    "terminal-zod": terminalCommand(
      "zod",
      z.object({
        target: z.string(),
        json: z.boolean().default(false),
        output: z.string().optional(),
        logFormat: z.string().optional(),
      }),
    ),
    "terminal-mini": terminalCommand(
      "zod/mini",
      mini.object({
        target: mini.string(),
        json: mini._default(mini.boolean(), false),
        output: mini.optional(mini.string()),
        logFormat: mini.optional(mini.string()),
      }),
    ),
    prompt: defineCommand({
      async run({ prompt }) {
        await prompt.select({
          message: "Environment",
          options: [{ value: "staging" }, { value: "production" }],
          initialValue: "staging",
        });
      },
    }),
    exec: defineCommand({
      hidden: true,
      async run({ exec }) {
        const echoed = await exec(
          process.execPath,
          runtimeScript(echoArguments, "with space", "$HOME", ";|*", 'quo"te', ""),
        );
        const failed = await exec(process.execPath, runtimeScript(exitThree), { reject: false });
        console.log(JSON.stringify({
          echoed: JSON.parse(echoed.stdout),
          status: failed.status,
          reason: failed.reason,
          exitCode: failed.exitCode,
        }));
      },
    }),
    "exec-fail": defineCommand({
      hidden: true,
      async run({ exec }) {
        await exec(process.execPath, runtimeScript(exitThree));
      },
    }),
    "exec-show": defineCommand({
      hidden: true,
      async run({ exec }) {
        await exec(process.execPath, runtimeScript("console.log('captured-marker')"));
      },
    }),
    "exec-quiet": defineCommand({
      hidden: true,
      async run({ exec }) {
        await exec(process.execPath, runtimeScript("console.log('quiet-marker')"), {
          display: false,
        });
      },
    }),
    "exec-redact": defineCommand({
      hidden: true,
      async run({ exec }) {
        await exec(process.execPath, runtimeScript("void 0", "super-secret-value"), {
          redact: ["super-secret-value"],
        });
      },
    }),
    "exec-inherit": defineCommand({
      hidden: true,
      async run({ exec }) {
        await exec(process.execPath, runtimeScript("console.log('INHERITED-OUT')"), {
          stdout: "inherit",
        });
      },
    }),
    "exec-json-inherit": defineCommand({
      hidden: true,
      async run({ exec }) {
        await exec(process.execPath, runtimeScript("console.log(['CHILD','RAN'].join('-'))"), {
          stdout: "inherit",
        });
      },
    }),
    "exec-interactive": defineCommand({
      hidden: true,
      async run({ exec }) {
        await exec(process.execPath, runtimeScript("console.log(['CHILD','RAN'].join('-'))"), {
          interactive: true,
        });
      },
    }),
    "exec-dry-run": defineCommand({
      hidden: true,
      async run({ exec }) {
        const readState =
          "typeof Deno === 'undefined' ? (process.stdout.write('state'), process.exit(2)) : (console.log('state'), Deno.exit(2))";
        const writeTarget =
          "typeof Deno === 'undefined' ? require('node:fs').writeFileSync('dry-run-target', 'changed') : Deno.writeTextFileSync('dry-run-target', 'changed')";
        const fetched = await exec(process.execPath, runtimeScript(readState), { reject: false });
        if (fetched.status !== "failed") {
          console.log(JSON.stringify({ branch: "fetched", fetched }));
          return;
        }
        const skipped = await exec(process.execPath, runtimeScript(writeTarget), {
          dryRun: true,
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
          interactive: true,
        });
        const changed = typeof Deno === "undefined" && existsSync("dry-run-target");
        console.log(JSON.stringify({
          branch: "skip",
          fetchReason: fetched.reason,
          fetchExit: fetched.reason === "exit-code" ? fetched.exitCode : null,
          fetchStdout: fetched.stdout,
          skipped,
          changed,
        }));
      },
    }),
  },
});
const miniCommand = defineCommand({
  args: mini.object({
    value: mini._default(mini.string(), "mini"),
    positionals: mini.optional(mini.array(mini.string())),
  }),
});
const miniArgs = await parseArgs(miniCommand, ["one", "two"]);
if (miniArgs.value !== "mini" || miniArgs.positionals?.join(",") !== "one,two") {
  throw new Error("zod/mini variadic parseArgs failed");
}
const usage = renderUsage(legacyCommand);
const writes = [];
await showUsage(legacyCommand, {
  printer: { async print(event) { if (event.type === "usage") writes.push(event.text); } },
});
if (writes.length !== 1 || writes[0] !== usage) throw new Error("usage APIs diverged");
const main = (argv = process.argv.slice(2)) => runMain(command, { argv, output: "auto" });
if (process.argv.slice(2)[0] === "__standalone-help__") {
  await showUsage(command, { printer: createPrettyPrinter({ color: false }) });
} else if (process.argv.slice(2)[0] === "__standalone-json-help__") {
  await showUsage(command, { printer: createJsonPrinter() });
} else if (process.argv.slice(2)[0] === "__unexpected-error__") {
  const unexpected = new TypeError("unexpected consumer bug");
  try {
    await runMain(defineCommand({ run() { throw unexpected; } }), {
      argv: [],
      output: "json",
      onError() { console.error("UNEXPECTED_ON_ERROR"); },
    });
  } catch (error) {
    if (error !== unexpected) throw new Error("unexpected rejection was replaced", { cause: error });
    throw error;
  }
  throw new Error("unexpected rejection was swallowed");
} else await main();
`;
}

export function typeConsumerSource() {
  return `
import { z } from "zod";
import * as mini from "zod/mini";
import {
  runMain,
  defineCommand,
  HackshError,
  HackshExecError,
  parseArgs,
  renderUsage,
  runCommand,
  showUsage,
  type AutocompleteOptions,
  type CommandDef,
  type Exec,
  type ExecCommand,
  type ExecFailure,
  type ExecFailureReason,
  type ExecOptions,
  type ExecResult,
  type ExecReturn,
  type ExecSkipped,
  type ExecSuccess,
  type HackshPromptErrorReason,
} from "hacksh";
import {
  createPrettyPrinter,
  createJsonPrinter,
  type ExecPrintEvent,
  type PrintEvent,
  type Printer,
} from "hacksh/printer";
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const schema = z.object({
  positionals: z.tuple([z.enum(["fast", "safe"]).meta({ title: "MODE" })], z.string()),
  count: z.coerce.number(),
  label: z.string().default("ok"),
  enabled: z.boolean().default(true),
  format: z.enum(["json", "yaml"]).optional().meta({ alias: "f", valueName: "FORMAT" }),
});
const command = defineCommand({
  args: schema,
  run({ command, args, input }) {
    const same: CommandDef<typeof schema> = command;
    const channels: { argv: string[]; unknown: string[]; passthrough: string[] } = input;
    void channels;
    const output: {
      positionals: ["fast" | "safe", ...string[]];
      count: number;
      label: string;
      enabled: boolean;
      format?: "json" | "yaml";
    } = args;
    return { same, output };
  },
});
const commandResult: Promise<{
  same: CommandDef<typeof schema>;
  output: z.output<typeof schema>;
} | undefined> = runCommand(command, ["fast", "--count", "2"]);
class AppError extends HackshError {
  readonly detail = "application failure";
}
const appError: HackshError = new AppError("failed", { cause: new Error("cause") });
const numeric = defineCommand({ run: () => 42 });
const numericExecution = runCommand(numeric, []);
const numericResult: Promise<number | undefined> = numericExecution;
const numericExact: Equal<typeof numericExecution, typeof numericResult> = true;
// @ts-expect-error help/version can return undefined
const numericOnly: Promise<number> = runCommand(numeric, []);
const asyncLeaf = defineCommand({ async run() { return true; } });
const failure = defineCommand({ run(): never { throw appError; } });
const routed = defineCommand({
  run: () => "root",
  subCommands: { group: defineCommand({ subCommands: { numeric, asyncLeaf, failure } }) },
});
const routedExecution = runCommand(routed, []);
const routedResult: Promise<string | number | boolean | undefined> = routedExecution;
const routedExact: Equal<typeof routedExecution, typeof routedResult> = true;
// @ts-expect-error a routed child may return another value
const rootOnly: Promise<string | undefined> = runCommand(routed, []);
const voidExecution = runCommand(defineCommand({ run() {} }), []);
const voidResult: Promise<void | undefined> = voidExecution;
const voidExact: Equal<typeof voidExecution, typeof voidResult> = true;
const asyncVoidExecution = runCommand(defineCommand({ async run() {} }), []);
const asyncVoidResult: Promise<void | undefined> = asyncVoidExecution;
const asyncVoidExact: Equal<typeof asyncVoidExecution, typeof asyncVoidResult> = true;
const typedCommand: CommandDef<typeof schema, number> = {
  args: schema,
  run: ({ args }) => args.count,
};
const asyncTypedCommand: CommandDef<typeof schema, Promise<number>> = {
  args: schema,
  run: async ({ args }) => args.count,
};
const reported: Promise<void> = runMain(failure, {
  onError(error) {
    const expected: HackshError = error;
    if (expected instanceof AppError) {
      const detail: string = expected.detail;
      void detail;
    }
  },
});
void [
  commandResult, numericResult, numericOnly, routedResult, rootOnly, voidResult, asyncVoidResult,
  numericExact, routedExact, voidExact, asyncVoidExact, typedCommand, asyncTypedCommand, reported,
];
const parsed: Promise<z.output<typeof schema>> = parseArgs(command, [
  "fast",
  "--count",
  "2",
  "one",
]);
const rendered: string = renderUsage(command);
const shown: Promise<void> = showUsage(command, { printer: createJsonPrinter() });
const main: (argv?: string[]) => Promise<void> = (argv = []) =>
  runMain(command, { argv, output: "pretty" });
const miniSchema = mini.object({
  positionals: mini.tuple([mini.enum(["fast", "safe"])], mini.string()),
  enabled: mini._default(mini.boolean(), true).check(mini.meta({ alias: "e" })),
});
const miniCommand = defineCommand({
  args: miniSchema,
});
const miniParsed: Promise<{
  positionals: ["fast" | "safe", ...string[]];
  enabled: boolean;
}> = parseArgs(miniCommand, ["fast", "one"]);
const hiddenSchema = z.object({
  mode: z.enum(["fast", "safe"]),
  enabled: z.boolean().default(true),
});
const hiddenZod = defineCommand({
  hidden: true,
  args: hiddenSchema,
  run({ args }) {
    const output: z.output<typeof hiddenSchema> = args;
    return output;
  },
});
const hiddenMiniSchema = mini.object({
  mode: mini.enum(["fast", "safe"]),
  enabled: mini._default(mini.boolean(), true),
});
const hiddenMini = defineCommand({
  hidden: true,
  args: hiddenMiniSchema,
  run({ args }) {
    const output: { mode: "fast" | "safe"; enabled: boolean } = args;
    return output;
  },
});
const hiddenRoot = defineCommand({
  subCommands: { hiddenZod, hiddenMini },
});
const hiddenMetadata: boolean | undefined = hiddenZod.hidden;
const environmentOptions = [
  { value: "staging", priority: 2, label: "Staging" },
  { value: "production", priority: 1, label: "Production" },
] as const;
const promptCommand = defineCommand({
  async run({ prompt }) {
    const selected = await prompt.select({
      message: "Environment",
      options: [
        { value: "staging", priority: 2 },
        { value: "production", priority: 1 },
      ],
      initialValue: "staging",
      sortBy(item) {
        const valueExact: Equal<typeof item.value, "staging" | "production"> = true;
        const priorityExact: Equal<typeof item.priority, 1 | 2> = true;
        void [valueExact, priorityExact];
        return item.priority;
      },
    });
    const inferred: "staging" | "production" = selected;
    const autocompleteOptions: AutocompleteOptions<(typeof environmentOptions)[number]> = {
      message: "Environment",
      options: environmentOptions,
      placeholder: "Type to filter…",
      sortBy(item) {
        const itemExact: Equal<typeof item, (typeof environmentOptions)[number]> = true;
        void itemExact;
        return item.label;
      },
    };
    const matched = await prompt.autocomplete(autocompleteOptions);
    const inferredMatch: typeof inferred = matched;
    const selectedExact: Equal<typeof selected, "staging" | "production"> = true;
    const matchedExact: Equal<typeof matched, "staging" | "production"> = true;
    void [selectedExact, matchedExact];
    void prompt.select({
      message: "Environment",
      options: [{ value: "staging" }, { value: "production" }],
      // @ts-expect-error initialValue must not widen the inferred option values
      initialValue: "development",
    });
    return inferredMatch;
  },
});
const promptResult: Promise<"staging" | "production" | undefined> =
  runCommand(promptCommand, [], { output: "json" });
const execCommand = defineCommand({
  async run({ exec }) {
    const typedExec: Exec = exec;
    const success: ExecSuccess = await typedExec("node", ["--version"], { cwd: "." });
    const command: ExecCommand = success.command;
    const options: ExecOptions = {
      reject: false,
      timeout: 1_000,
      maxBuffer: 1_024,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      interactive: false,
      display: false,
      redact: ["secret"],
      input: "data",
    };
    const inheritedStdout: ExecSuccess = await typedExec("node", ["--version"], {
      stdout: "inherit",
      stdin: "inherit",
      stderr: "inherit",
    });
    const skipped: ExecSkipped = await typedExec("node", [], { dryRun: true });
    // @ts-expect-error a skipped result has no stdout
    void skipped.stdout;
    // @ts-expect-error a skipped result has no exit code
    void skipped.exitCode;
    const dryRun: boolean = Math.random() > 0.5;
    const branched = await typedExec("node", [], { dryRun, reject: false });
    if (branched.status === "skipped") {
      const skippedCommand: ExecCommand = branched.command;
      void skippedCommand;
    }
    const wide = await exec("node", ["-e", "process.exit(3)"], options);
    if (wide.status === "skipped") {
      // @ts-expect-error a skipped result has no stdout
      void wide.stdout;
      return;
    }
    const result: ExecResult = wide;
    const returned: ExecReturn<{ reject: false }> = result;
    const execEvent: ExecPrintEvent = {
      type: "exec",
      phase: "start",
      command,
      stdio: { stdin: "input", stdout: "pipe", stderr: "inherit" },
      interactive: true,
    };
    const skipEvent: ExecPrintEvent = { ...execEvent, phase: "skip" };
    const printed: PrintEvent = skipEvent;
    // @ts-expect-error input cannot be combined with inherited stdin
    void exec("node", [], { input: "data", stdin: "inherit" });
    const inheritedInput: ExecOptions = { input: "data", stdin: "inherit" };
    void exec("node", [], inheritedInput);
    // @ts-expect-error a misspelled option is rejected next to a valid one
    void exec("node", [], { cwd: ".", rejct: false });
    if (result.status === "failed") {
      const failure: ExecFailure = result;
      const reason: ExecFailureReason = failure.reason;
      if (result.reason === "exit-code") {
        return [command, returned, reason, result.exitCode satisfies number, printed, inheritedStdout];
      }
      if (result.reason === "signal") return result.signal satisfies string;
      if (result.reason === "spawn") return result.error satisfies Error;
      if (result.reason === "json-output" || result.reason === "non-interactive" || result.reason === "overlapping") {
        return result.stdout;
      }
    }
    return result.stdout;
  },
});
const execFailure = (error: unknown): ExecFailure | undefined =>
  error instanceof HackshExecError ? error.result : undefined;
const promptReason: HackshPromptErrorReason = "non-interactive";
const pretty: Printer = createPrettyPrinter({
  color: false,
  unicode: true,
  stdout: { write: (_text) => undefined },
  stderr: { write: (_text) => undefined },
});
const json: Printer = createJsonPrinter({
  stdout: { write: (_text) => undefined },
  stderr: { write: (_text) => undefined },
});
void [
  parsed,
  rendered,
  shown,
  main,
  miniParsed,
  hiddenRoot,
  hiddenMetadata,
  promptResult,
  promptReason,
  execCommand,
  execFailure,
  pretty,
  json,
];
`;
}
