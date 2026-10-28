import { defineCommand, runMain } from "../index.ts";

await runMain(
  defineCommand({
    name: "prompt-noninteractive",
    async run({ prompt }) {
      await prompt.select({
        message: "Environment",
        options: [{ value: "staging" }, { value: "production" }] as const,
        initialValue: "staging",
      });
    },
  }),
);
