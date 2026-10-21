export function consumerSource(zodSpecifier, miniSpecifier, packageSpecifier) {
  return `
import { existsSync } from "node:fs";
import { z } from ${JSON.stringify(zodSpecifier)};
import * as mini from ${JSON.stringify(miniSpecifier)};
import {
  createMain,
  defineCommand,
  parseArgs,
  renderUsage,
  showUsage,
  HackshValidationError,
} from ${JSON.stringify(packageSpecifier)};
async function verifyPhaseTwo(label, phaseCommand) {
  const usage = await renderUsage(phaseCommand);
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
    parsed._.join(",") !== "fast,txt,md" ||
    parsed.format !== "json" ||
    parsed.enabled !== false
  ) {
    throw new Error(label + " combined phase 2 parse failed: " + JSON.stringify(parsed));
  }
  const explicitTrue = await parseArgs(phaseCommand, ["safe", "--enabled=true"]);
  if (explicitTrue.enabled !== true || explicitTrue._.join(",") !== "safe") {
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
    _: z.tuple(
      [z.enum(["fast", "safe"]).describe("Execution mode").meta({ title: "MODE" })],
      z.enum(["txt", "md"]).describe("Input files").meta({ title: "INPUT" }),
    ),
    enabled: z.boolean().default(true).describe("Enable feature"),
    format: z.enum(["json", "yaml"]).optional().describe("Output format"),
  }),
  argOptions: {
    format: { valueName: "FORMAT" },
  },
});
const miniPhaseCommand = defineCommand({
  args: mini.object({
    _: mini.tuple(
      [mini.enum(["fast", "safe"]).check(mini.describe("Execution mode"), mini.meta({ title: "MODE" }))],
      mini.enum(["txt", "md"]).check(mini.describe("Input files"), mini.meta({ title: "INPUT" })),
    ),
    enabled: mini._default(mini.boolean(), true).check(mini.describe("Enable feature")),
    format: mini.optional(mini.enum(["json", "yaml"])).check(mini.describe("Output format")),
  }),
  argOptions: {
    format: { valueName: "FORMAT" },
  },
});
await verifyPhaseTwo("zod", phaseCommand);
await verifyPhaseTwo("zod/mini", miniPhaseCommand);
function hiddenCommand(flavor, args) {
  return defineCommand({
    hidden: true,
    description: "Internal " + flavor + " command",
    args,
    argOptions: {
      mode: { valueName: "MODE" },
    },
    run({ cmd, args: parsed }) {
      console.log(JSON.stringify({ flavor, cmd: cmd.name, args: parsed }));
    },
  });
}
const zodHidden = hiddenCommand(
  "zod",
  z.object({
    mode: z.enum(["fast", "safe"]).describe("Execution mode"),
    enabled: z.boolean().default(true).describe("Enable feature"),
  }),
);
const miniHidden = hiddenCommand(
  "zod/mini",
  mini.object({
    mode: mini.enum(["fast", "safe"]).check(mini.describe("Execution mode")),
    enabled: mini._default(mini.boolean(), true).check(mini.describe("Enable feature")),
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
    repo: z.string().optional(),
    _: z.array(z.string().transform((value) => value.toUpperCase())),
  }),
  argOptions: { repo: { alias: ["R", "Q"] } },
  run({ cmd, args, extraArgs, passthrough }) {
    console.log(JSON.stringify({ cmd: cmd.name, args, extraArgs, passthrough }));
  },
});
function terminalCommand(flavor, args) {
  return defineCommand({
    description: "Exercise installed terminal output with " + flavor,
    args,
    run({ args: parsed, logger }) {
      if (parsed.target === "explode") {
        throw Object.assign(new Error("runtime exploded"), { code: "E_RUNTIME" });
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
      async run({ logger }) {
        await logger.select({
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
    _: mini.optional(mini.array(mini.string())),
  }),
});
const miniArgs = await parseArgs(miniCommand, ["one", "two"]);
if (miniArgs.value !== "mini" || miniArgs._?.join(",") !== "one,two") {
  throw new Error("zod/mini variadic parseArgs failed");
}
const usage = await renderUsage(legacyCommand);
const writes = [];
await showUsage(legacyCommand, { async write(text) { writes.push(text); } });
if (writes.length !== 1 || writes[0] !== usage) throw new Error("usage APIs diverged");
const main = createMain(command, {
  output: "auto",
  async showUsage(selected, { write }) {
    await write("CUSTOM\\n" + await renderUsage(selected));
  },
});
if (process.argv.slice(2)[0] === "__standalone-help__") await showUsage(command);
else await main();
`;
}

export function typeConsumerSource() {
  return `
import { z } from "zod";
import * as mini from "zod/mini";
import {
  consolePrinter,
  createMain,
  createStreamPrinter,
  defineCommand,
  HackshExecError,
  parseArgs,
  renderUsage,
  runCommand,
  showUsage,
  type ArgOptions,
  type ArgOptionsMap,
  type CommandDef,
  type Exec,
  type ExecCommand,
  type ExecFailure,
  type ExecFailureReason,
  type ExecOptions,
  type ExecPrintEvent,
  type ExecResult,
  type ExecReturn,
  type ExecSkipped,
  type ExecSuccess,
  type PrintEvent,
  type HackshPromptErrorReason,
  type Printer,
  type ShowUsageCallback,
} from "hacksh";
const schema = z.object({
  _: z.tuple([z.enum(["fast", "safe"]).meta({ title: "MODE" })], z.string()),
  count: z.coerce.number(),
  label: z.string().default("ok"),
  enabled: z.boolean().default(true),
  format: z.enum(["json", "yaml"]).optional(),
});
const formatOptions: ArgOptions = { alias: "f", valueName: "FORMAT" };
const argOptions: ArgOptionsMap<typeof schema> = {
  format: formatOptions,
};
const command = defineCommand({
  args: schema,
  argOptions,
  run({ cmd, args }) {
    const same: CommandDef<typeof schema> = cmd;
    const output: {
      _: ["fast" | "safe", ...string[]];
      count: number;
      label: string;
      enabled: boolean;
      format?: "json" | "yaml";
    } = args;
    return { same, output };
  },
});
const parsed: Promise<z.output<typeof schema>> = parseArgs(command, [
  "fast",
  "--count",
  "2",
  "one",
]);
const rendered: Promise<string> = renderUsage(command);
const shown: Promise<void> = showUsage(command, { write: async (_text) => {} });
const callback: ShowUsageCallback = async (selected, { write }) => write(await renderUsage(selected));
const main: (argv?: string[]) => Promise<void> = createMain(command, {
  output: "pretty",
  showUsage: callback,
});
const miniSchema = mini.object({
  _: mini.tuple([mini.enum(["fast", "safe"])], mini.string()),
  enabled: mini._default(mini.boolean(), true),
});
const miniArgOptions: ArgOptionsMap<typeof miniSchema> = {
  enabled: { alias: "e" },
};
const miniCommand = defineCommand({
  args: miniSchema,
  argOptions: miniArgOptions,
});
const miniParsed: Promise<{
  _: ["fast" | "safe", ...string[]];
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
const promptCommand = defineCommand({
  async run({ logger }) {
    const selected = await logger.select({
      message: "Environment",
      options: [{ value: "staging" }, { value: "production" }] as const,
      initialValue: "staging",
    });
    const inferred: "staging" | "production" = selected;
    return inferred;
  },
});
const promptResult: Promise<unknown> = runCommand(promptCommand, [], { output: "json" });
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
      return wide.stdout;
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
      if (result.reason === "exit-code") return [command, returned, reason, result.exitCode satisfies number, printed, inheritedStdout];
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
const legacyConsole: Printer = consolePrinter;
const legacyStreams: Printer = createStreamPrinter({
  stdout: { write: (_text) => undefined },
  stderr: { write: (_text) => undefined },
});
void [
  parsed,
  rendered,
  shown,
  main,
  miniParsed,
  argOptions,
  miniArgOptions,
  hiddenRoot,
  hiddenMetadata,
  promptResult,
  promptReason,
  execCommand,
  execFailure,
  legacyConsole,
  legacyStreams,
];
`;
}
