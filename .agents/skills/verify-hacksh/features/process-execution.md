# Process execution

Every `run` receives `exec(file, args, options)`, which starts an executable without a shell and resolves with `status`, `command`, and newline-trimmed `stdout` and `stderr`. By default a failure rejects with `HackshExecError`, which `runMain` reports as an `error` event naming the command and reason and exits 1. `reject: false` returns the failure as a result with a `reason` (`exit-code`, `signal`, `spawn`, `timeout`, `aborted`, `output-limit`). Child output never appears in the error event.

## Sub-features

- `exec-args` passes spaces, quotes, `$HOME`, `;`, `|`, `*`, and empty strings verbatim.
- `exec-result` returns a non-zero exit as `{ status: "failed", reason: "exit-code", exitCode }` with `reject: false`.
- `exec-error` reports a rejected exec through `runMain` with `exit code N` in the message and no child output.
- `exec-env` starts from the `runMain` `env` option or `process.env`, then applies the exec `env` option.
- `exec-termination` ends `timeout`, `signal`, and `maxBuffer` runs by stopping the child.
- `exec-display` prints the command and cwd on stderr, hides it with `display: false`, and masks `redact` values.
- `exec-interactive` (fzf-like) sends `input`, lets the child read the keyboard from `/dev/tty`, and returns the captured selection.
- `exec-inherit` (gh-run-watch-like) gives the child the terminal's stdin, stdout, and stderr.
- `exec-terminal-refusal` refuses inherit in JSON mode (`json-output`), `interactive: true` without a TTY or in CI (`non-interactive`), and a terminal call during a prompt (`overlapping`), without starting the child.

## How to get to it (user POV)

- Run a command whose `run` calls `exec`: `demo exec`.
- Run a command whose `exec` call fails without `reject: false`: `demo exec fail`.
- Run `demo term show`, `demo term pick`, `demo term watch`, `demo term flow`, or `demo term overlap` in a terminal, piped, in CI, or with `HACKSH_OUTPUT=json`.

## Driving it with drive.mjs

Preconditions:

- Baseline from the index. Add this command to `cli.ts` and register it as `exec` in `subCommands`:

  ```ts
  const exec = defineCommand({
    description: "Run node as an external command",
    args: z.object({ _: z.tuple([], z.string()) }),
    async run({ args, exec }) {
      const node = (code: string, ...rest: string[]) =>
        [process.execPath, ["-e", code, ...rest]] as const;
      if (args._[0] === "fail") {
        await exec(...node("process.stdout.write('child' + '-secret'); process.exit(3)"));
        return;
      }
      const echoed = await exec(
        ...node(
          "console.log(JSON.stringify(process.argv.slice(1)))",
          "a b",
          "$HOME",
          ";|*",
          'q"',
          "",
        ),
      );
      const failed = await exec(...node("process.exit(4)"), { reject: false });
      const slow = await exec(...node("setInterval(() => {}, 1000)"), {
        timeout: 200,
        reject: false,
      });
      console.log(
        `RESULT ${JSON.stringify({ echoed: JSON.parse(echoed.stdout), failed, slow: slow.status === "failed" && slow.reason })}`,
      );
    },
  });
  ```

- **Capture and result.** Run `D --label exec-result --env NO_COLOR=1 --expect-code 0 -- CLI exec`. stdout ends with a `RESULT` line whose `echoed` is `["a b","$HOME",";|*","q\"",""]`, `failed` has `status` `failed`, `reason` `exit-code`, `exitCode` `4`, and `slow` is `timeout`.
- **Rejected exec.** Run `D --label exec-error-json --env HACKSH_OUTPUT=json --expect-code 1 -- CLI exec fail`. stderr is one `error` line with `name` `HackshExecError`, a `message` containing `exit code 3`, and no `child-secret` anywhere.
- **Pretty error.** Run the same with `--label exec-error-pretty --env NO_COLOR=1`. stderr shows `Command failed with exit code 3:` followed by the quoted command.

- Terminal use. Add this command to `cli.ts` and register it as `term` in `subCommands`. `pick` is an fzf stand-in: it reads rows from stdin, draws on `/dev/tty`, and writes the chosen row to stdout. `watch` is a `gh run watch` stand-in: it writes to stdout and stderr and reads one line from stdin.

  ```ts
  const node = (code: string, ...rest: string[]) =>
    [process.execPath, ["-e", code, ...rest]] as const;
  const pickChild =
    "const fs = require('fs');" +
    "const rows = fs.readFileSync(0, 'utf8').trim().split('\\n');" +
    "const tty = fs.openSync('/dev/tty', 'r+');" +
    "fs.writeSync(tty, rows.map((row, i) => i + ': ' + row).join('\\n') + '\\nPick> ');" +
    "const buffer = Buffer.alloc(64);" +
    "const read = fs.readSync(tty, buffer, 0, 64, null);" +
    "process.stdout.write(rows[Number(buffer.toString('utf8', 0, read).trim())] + '\\n');";
  const watchChild =
    "const fs = require('fs');" +
    "process.stdout.write('watching run ' + process.argv[1] + '\\n');" +
    "process.stderr.write('child-stderr progress\\n');" +
    "process.stdout.write('Press Enter to finish\\n');" +
    "const buffer = Buffer.alloc(64);" +
    "const read = fs.readSync(0, buffer, 0, 64, null);" +
    "process.stdout.write('child-done ' + JSON.stringify(buffer.toString('utf8', 0, read).trim()) + '\\n');";
  const term = defineCommand({
    description: "Exercise exec display and terminal use",
    args: z.object({ _: z.tuple([z.enum(["show", "pick", "watch", "flow", "overlap"])]) }),
    async run({ args, exec, logger }) {
      const mode = args._[0];
      if (mode === "show") {
        const shown = await exec(
          ...node("process.stdout.write('child-captured')", "a b", "--token=s3cret"),
          {
            cwd: process.cwd(),
            redact: ["s3cret"],
          },
        );
        await exec(...node("process.stdout.write('hidden')"), { display: false });
        console.log(`RESULT ${JSON.stringify({ stdout: shown.stdout, command: shown.command })}`);
        return;
      }
      const pick = () =>
        exec(...node(pickChild), { input: "alpha\nbeta\ngamma", interactive: true });
      const watch = () =>
        exec(...node(watchChild, "42"), { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
      if (mode === "pick") {
        const { stdout } = await pick();
        logger.success("Picked {stdout}", { stdout });
        return;
      }
      if (mode === "watch") {
        const result = await watch();
        logger.success("Watch finished with {status}", { status: result.status });
        return;
      }
      if (mode === "overlap") {
        const prompt = logger.confirm({ message: "Still there?" });
        const refused = await exec(...node(pickChild), {
          input: "x",
          interactive: true,
          reject: false,
        });
        logger.info("Overlap {reason}", {
          reason: refused.status === "failed" ? refused.reason : "none",
        });
        await prompt;
        return;
      }
      const environment = await logger.select({
        message: "Environment",
        options: [{ value: "staging" }, { value: "production" }] as const,
      });
      const { stdout } = await pick();
      await watch();
      logger.success("Flow {environment} {stdout}", { environment, stdout });
    },
  });
  ```

- **Display and redaction.** Run `D --label show-pretty --env NO_COLOR=1 --expect-code 0 -- CLI term show`. stderr is exactly one `$  <node> -e ... "a b" "--token=***"` line and a `│    cwd: <repo>` line (the `display: false` call adds nothing). stdout's `RESULT` has `stdout` `child-captured` and `command.args` ending in `--token=***`. With `--env HACKSH_OUTPUT=json`, stderr is one `exec` event with `phase` `start`, `stdio` `{"stdin":"ignore","stdout":"pipe","stderr":"pipe"}`, and no `s3cret` anywhere; `child-captured` appears only inside the `RESULT` line.
- **Interactive selection (PTY).** Write steps `expect Pick> `, `send 1\r`, `expect Picked`. Run `D --label pick-pty --env NO_COLOR=1 --pty <steps> --expect-code 0 -- CLI term pick`. The transcript shows the `$` line, the child's `0: alpha` menu, and `✔  [demo:term] Picked beta`.
- **Inherited terminal (PTY).** Write steps `expect Press Enter to finish`, `send ok\r`, `expect Watch finished`. Run with `--label watch-pty ... term watch`. The transcript has `watching run 42`, `child-stderr progress`, `child-done "ok"`, and `✔  [demo:term] Watch finished with succeeded`.
- **Prompt, selection, and inherit in one run (PTY).** Steps `expect Environment`, `send \033[B\r`, `expect Pick> `, `send 2\r`, `expect Press Enter to finish`, `send go\r`, `expect Flow`. The transcript ends with `✔  [demo:term] Flow production gamma`.
- **Overlap (PTY).** Steps `expect Overlap`, `expect Still there?`, `send y`. The transcript has `Overlap overlapping` and then `✔  Still there?: Yes`.
- **Refusals without a terminal.** Without `--pty`: `term watch` in pretty exits 0 and the child's lines land directly in the evidence `stdout`/`stderr` (inherit passes the pipes through). `term watch` with `--env HACKSH_OUTPUT=json --expect-code 1` has empty stdout and stderr holds exactly one line, an `error` event whose message starts `Command cannot use the terminal in JSON output mode`. No `exec` event means the child never started (the message quotes the script, so do not grep for its text). `term pick` with `--expect-code 1` (or with `--env CI=1 --env HACKSH_OUTPUT=pretty`) fails with `Command requires an interactive terminal` and no `$` line.

## Gotchas

- The command display JSON-quotes arguments with spaces or shell metacharacters, so the `-e` script appears in quotes in the error message.
- `process.execPath` is the Node running the CLI; do not rely on `node` from `PATH` inside the recipe.
- In a PTY the child's `/dev/tty` writes, inherited streams, and hacksh output share one terminal, so typed input echoes may appear before the child's menu in the transcript. Assert on result lines.
- Inherited streams bypass the printer: in the non-PTY drive, `watch` output appears in the evidence streams without any hacksh decoration, which is the documented boundary.
- On Deno, exec needs `--allow-run` and unscoped `--allow-env`; scoped `--allow-env` fails inside Deno's `node:child_process` before the child starts.
