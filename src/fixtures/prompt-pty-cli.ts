import { defineCommand, runMain } from "../index.ts";

const mode = process.argv[2];
const baseline = {
  data: process.stdin.listenerCount("data"),
  error: process.stdin.listenerCount("error"),
  keypress: process.stdin.listenerCount("keypress"),
};

await runMain(
  defineCommand({
    name: "prompt-pty-probe",
    async run({ logger }) {
      if (mode === "caught-cancel") {
        await logger.text({ message: "Caught cancellation" }).catch(() => undefined);
        logger.info("first log after cancellation");
        logger.info("second log after cancellation");
        const restored =
          process.stdin.isRaw !== true &&
          process.stdin.listenerCount("data") === baseline.data &&
          process.stdin.listenerCount("error") === baseline.error &&
          process.stdin.listenerCount("keypress") === baseline.keypress;
        process.stdout.write(`CAUGHT_RESULT ${JSON.stringify({ restored })}\n`);
        return;
      }
      if (mode === "cancel") {
        await logger.text({ message: "Cancel me" });
        throw new Error("cancellation unexpectedly returned");
      }

      const environment = await logger.select({
        message: "Environment\nTarget",
        options: [{ value: "staging" }, { value: "production" }] as const,
      });
      const confirmed = await logger.confirm({ message: "Continue?" });
      const name = await logger.text({
        message: "Name",
        placeholder: "at least three letters",
        validate: (value) => (value.length < 3 ? "Too short" : undefined),
      });
      const restored =
        process.stdin.isRaw !== true &&
        process.stdin.listenerCount("data") === baseline.data &&
        process.stdin.listenerCount("error") === baseline.error &&
        process.stdin.listenerCount("keypress") === baseline.keypress;
      process.stdout.write(
        `PROBE_RESULT ${JSON.stringify({ environment, confirmed, name, restored })}\n`,
      );
    },
  }),
  { output: "pretty", env: { NO_COLOR: "1" } },
);
