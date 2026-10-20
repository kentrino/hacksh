import { z } from "zod";
import { defineCommand, runMain } from "../index.ts";

const command = defineCommand({
  name: "signal-fixture",
  args: z.object({ ignoreAbort: z.boolean().default(false) }),
  run: ({ args, signal }) =>
    new Promise<void>((resolve) => {
      const keepAlive = setInterval(() => undefined, 1_000);
      signal.addEventListener("abort", () => {
        console.log("aborted");
        if (args.ignoreAbort) return;
        clearInterval(keepAlive);
        resolve();
      });
      console.log("ready");
    }),
});

await runMain(command, { output: "pretty" });
