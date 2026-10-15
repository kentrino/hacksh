import { z } from "zod";
import { defineCommand, runMain } from "../index.ts";

const command = defineCommand({
  name: "exit-fixture",
  args: z.object({ count: z.coerce.number().int() }),
  run: ({ args }) => console.log(String(args.count)),
});

await runMain(command, { output: "pretty" });
