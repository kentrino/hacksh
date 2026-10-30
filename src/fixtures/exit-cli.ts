import { z } from "zod";
import { defineCommand, HackshError, HackshExitError, runMain } from "../index.ts";

const command = defineCommand({
  name: "exit-fixture",
  args: z.object({
    count: z.coerce.number().int(),
    exitCode: z.coerce.number().optional(),
    throwExitCode: z.coerce.number().optional(),
    fail: z.boolean().default(false),
    deferredOutput: z.boolean().default(false),
  }),
  async run({ args }) {
    if (args.fail) throw new HackshError("fixture failed");
    if (args.throwExitCode !== undefined) throw new HackshExitError(args.throwExitCode);
    console.log(String(args.count));
    if (args.deferredOutput) {
      setTimeout(() => console.log("completed"), 10);
    }
    return args.exitCode;
  },
});

await runMain(command, { output: "pretty" });
