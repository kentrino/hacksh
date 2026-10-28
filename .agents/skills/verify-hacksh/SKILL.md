---
name: verify-hacksh
description: Prove hacksh behavior the way a library user sees it, by writing a small consumer CLI against the working-tree source and running it as a real process (argv, env, exit code, stdout, stderr, and a PTY for interactive prompts). Use when verifying a change to parsing, help, subcommands, output modes, logging, prompts, or errors in hacksh, or when reproducing a reported CLI behavior.
---

# Verify hacksh

hacksh is a library, so its user-facing surface is a CLI that someone builds with it. Verification means: write a consumer CLI that uses the behavior, run it as a separate Node process the way an end user would, and keep the captured process output as evidence. Unit tests (`vp test`) are not proof of user-visible behavior; they call internals and inject streams.

All paths are relative to the repository root. Run every command from there.

## Layout

- `verify-hacksh.local/` is the work root. It is ignored by the repo's `*.local` rule, so nothing in it can be committed. Never put verification files anywhere else in the tree.
- `verify-hacksh.local/scratch/<run>/` holds consumers and PTY step files for one run. Consumers here import `../../../src/index.ts` and resolve `zod` from the repo's `node_modules`.
- `verify-hacksh.local/evidence/<run>/<label>.{json,txt}` holds proof. Cleanup never touches it.
- `<run>` is a short name you pick per verification (`[A-Za-z0-9_.-]`). Use a fresh name per run; parallel agents must use different names.

## Launch

There is no server. A drive is one short-lived process.

1. Once per checkout: `pnpm install` if `node_modules` is missing.
2. Create the run's scratch dir and start from the template, which covers subcommands, positional tuples, aliases, every log level, all three prompts, a runtime error, and a hidden command:

   ```sh
   RUN=my-change
   mkdir -p verify-hacksh.local/scratch/$RUN
   cp .agents/skills/verify-hacksh/templates/consumer.ts verify-hacksh.local/scratch/$RUN/cli.ts
   ```

   Edit `cli.ts` to exercise the exact behavior under test. Node 22.18+ runs `.ts` directly; no build is needed.

Ready means `doctor` passes.

## Doctor

```sh
node .agents/skills/verify-hacksh/scripts/doctor.mjs
```

Read-only. Checks Node >= 22.18, installed dependencies, that `verify-hacksh.local/` is git-ignored, that `expect` exists, that `src/index.ts` loads with its main exports, and prints the source revision (with a note if `src/` has uncommitted changes, which is expected while verifying a change). Exit 0 means the checkout is drivable. Run it first, and again whenever a drive fails unexpectedly.

## Drive

`scripts/drive.mjs` runs one consumer invocation and writes evidence:

```sh
node .agents/skills/verify-hacksh/scripts/drive.mjs --run $RUN --label <label> \
  [--env KEY=VALUE]... [--unset KEY]... [--expect-code N] [--timeout MS] \
  [--pty <steps-file> [--columns N]] \
  -- verify-hacksh.local/scratch/$RUN/cli.ts [consumer args...]
```

- The child env drops `CI`, `NO_COLOR`, and `HACKSH_OUTPUT` from your shell so the output mode is deterministic; set them explicitly with `--env`. `--unset` removes more.
- Without `--pty`, stdin is not a TTY and stdout/stderr are separate pipes. This is the non-interactive path: prompts fail with `reason: non-interactive`, pretty output has no color.
- `--expect-code N` makes the helper exit 1 if the consumer's exit code differs; a timeout exits 124.
- Prints the exit code, the evidence path, stdout, and stderr.

### Interactive drives (PTY)

`--pty <steps-file>` runs the consumer inside an `expect` PTY (`--columns`, default 80, sets terminal width for wrap/redraw checks). The steps file has one step per line:

```text
# lines starting with # are comments
expect Environment
send \033[B\r
expect Deploy to production?
send y
```

`expect TEXT` waits up to 5 s for literal TEXT. `send TEXT` types TEXT after backslash escapes: `\r` Enter, `\003` Ctrl-C, `\033` Escape, `\033[B` / `\033[A` down / up arrow, `\177` Backspace. The exit code recorded is the consumer's. A step that never matches records exit `124` and `PTY_STEP_TIMEOUT expect <text>` in stderr; the PTY closes and takes the consumer with it. Always pass `--expect-code` on PTY drives so a stuck step fails the helper.

In a PTY both streams share the terminal, so all output lands in the evidence's `stdout`. Redraws appear as raw `ESC[1A ESC[2K` sequences; assert on final result lines (`✔  Environment: staging`) rather than on intermediate frames.

## Evidence

Each drive writes `verify-hacksh.local/evidence/<run>/<label>.json` (args, env overrides, PTY steps, Node version, exit code, signal, timing, stdout, stderr) and a `.txt` transcript. A proof for a change:

- Runs the change through a real consumer process and `runMain`, not by calling `parseArgs` or a printer directly, unless the change is to that programmatic API itself.
- Shows the action (argv, env, PTY steps) and the resulting state: exit code and both streams. For JSON mode, parse the lines and check `type`, `stream`, and fields, not substrings.
- Covers each entry point the feature map lists for the behavior (for example both pretty and JSON, or both `--flag` and its alias), and the failure path when the change touches validation.
- Includes a before/after pair when fixing a bug: drive on the base revision (`git stash` or a worktree) and on the change with the same label suffixed `-before` / `-after`.

When the change affects the published package rather than source behavior (exports, `dist`, packaging, Node 22.18 or Deno compatibility), also run `pnpm test:packed`; this skill drives source only.

## Cleanup

```sh
rm -rf verify-hacksh.local/scratch/$RUN
```

Drives are short-lived and killed on timeout, so there is no process to stop. Leave `verify-hacksh.local/evidence/$RUN/` in place and cite those paths in your report. Delete old evidence only when the user asks.

## Feature map

[`features/README.md`](features/README.md) indexes the user-facing features and how to drive each. Read the matching file before a verification, and update it when a change adds or alters user-visible behavior.
