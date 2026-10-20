# Process execution

Every `run` receives `exec(file, args, options)`, which starts an executable without a shell and resolves with `status`, `command`, and newline-trimmed `stdout` and `stderr`. By default a failure rejects with `HackshExecError`, which `runMain` reports as an `error` event naming the command and reason and exits 1. `reject: false` returns the failure as a result with a `reason` (`exit-code`, `signal`, `spawn`, `timeout`, `aborted`, `output-limit`). Child output never appears in the error event.

## Sub-features

- `exec-args` passes spaces, quotes, `$HOME`, `;`, `|`, `*`, and empty strings verbatim.
- `exec-result` returns a non-zero exit as `{ status: "failed", reason: "exit-code", exitCode }` with `reject: false`.
- `exec-error` reports a rejected exec through `runMain` with `exit code N` in the message and no child output.
- `exec-env` starts from the `runMain` `env` option or `process.env`, then applies the exec `env` option.
- `exec-termination` ends `timeout`, `signal`, and `maxBuffer` runs by stopping the child.

## How to get to it (user POV)

- Run a command whose `run` calls `exec`: `demo exec`.
- Run a command whose `exec` call fails without `reject: false`: `demo exec fail`.

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

## Gotchas

- The command display JSON-quotes arguments with spaces or shell metacharacters, so the `-e` script appears in quotes in the error message.
- `process.execPath` is the Node running the CLI; do not rely on `node` from `PATH` inside the recipe.
- On Deno, exec needs `--allow-run` and unscoped `--allow-env`; scoped `--allow-env` fails inside Deno's `node:child_process` before the child starts.
