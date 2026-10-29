import { defineCommand, HackshPromptError, runMain } from "../index.ts";

await runMain(
  defineCommand({
    name: "autocomplete-pty-fixture",
    async run({ prompt }) {
      try {
        const value = await prompt.autocomplete({
          message: "Choose a language",
          placeholder: "Type to filter…",
          // Definition order is the suggestion priority; filtering never reorders it.
          options: [
            { value: "typescript", label: "TypeScript", hint: "Typed JavaScript" },
            { value: "javascript", label: "JavaScript", hint: "Web and Node.js" },
            { value: "rust", label: "Rust", hint: "Systems programming" },
            { value: "go", label: "Go", hint: "Services and tooling" },
            { value: "python", label: "Python", hint: "Scripting and data" },
            { value: "ruby", label: "Ruby", hint: "Expressive scripting" },
          ],
        });
        process.stdout.write(`value: ${JSON.stringify(value)}\n`);
      } catch (error) {
        if (!(error instanceof HackshPromptError) || error.reason !== "cancelled") throw error;
        process.stdout.write("×  Cancelled\n");
        return 130;
      }
    },
  }),
  { output: "pretty", env: { NO_COLOR: "1" } },
);
