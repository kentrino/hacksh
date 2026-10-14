import { z } from "zod";
import { defineCommand, runMain } from "../index.ts";

const command = defineCommand({
  name: "exit-fixture",
  args: z.object({ count: z.coerce.number().int() }),
  run: ({ args }) => console.log(args.count),
});

await runMain(command);
