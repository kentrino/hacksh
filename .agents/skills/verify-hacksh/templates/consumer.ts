import { z } from "zod";
import { defineCommand, HackshError, runMain } from "../../../src/index.ts";

const deploy = defineCommand({
  allowUnknownArgs: true,
  description: "Deploy a target",
  args: z.object({
    positionals: z.tuple(
      [z.enum(["web", "api"]).meta({ title: "TARGET", description: "Target" })],
      z.string().meta({ title: "FILES", description: "Extra files" }),
    ),
    env: z
      .enum(["staging", "production"])
      .default("staging")
      .meta({ description: "Environment", alias: "e", valueName: "ENV" }),
    dryRun: z.boolean().default(false).meta({ description: "Skip side effects" }),
  }),
  run({ args, input, logger }) {
    const log = logger.with({ target: args.positionals[0], env: args.env });
    log.step("Deploying {target} to {env}");
    log.getChild("upload").debug("Uploaded {files} files", { files: args.positionals.length - 1 });
    if (args.dryRun) log.warn("Dry run for {target}");
    log.success("Deployed {target}");
    console.log(`RESULT ${JSON.stringify({ args, input })}`);
  },
});

const levels = defineCommand({
  description: "Emit every log level",
  run({ logger }) {
    logger.trace("trace");
    logger.debug("debug");
    logger.info("info");
    logger.step("step");
    logger.success("success");
    logger.warn("warning");
    logger.error("error");
    logger.fatal("fatal");
  },
});

const ask = defineCommand({
  description: "Prompt for a release",
  async run({ logger, prompt }) {
    const environment = await prompt.select({
      message: "Environment",
      options: [{ value: "staging" }, { value: "production" }] as const,
      initialValue: "staging",
    });
    const confirmed = await prompt.confirm({ message: `Deploy to ${environment}?` });
    if (!confirmed) return;
    const release = await prompt.text({
      message: "Release name",
      placeholder: "v1.2.3",
      validate: (value) => (value.length === 0 ? "A release name is required" : undefined),
    });
    logger.success("Releasing {release} to {environment}", { release, environment });
  },
});

const explode = defineCommand({
  description: "Throw a runtime error",
  run() {
    throw Object.assign(new HackshError("runtime exploded"), { code: "E_RUNTIME" });
  },
});

await runMain(
  defineCommand({
    name: "demo",
    version: "1.0.0",
    description: "verify-hacksh demo consumer",
    subCommands: {
      deploy,
      levels,
      ask,
      explode,
      internal: defineCommand({
        hidden: true,
        description: "Hidden command",
        run: () => {
          console.log("INTERNAL");
        },
      }),
    },
  }),
);
