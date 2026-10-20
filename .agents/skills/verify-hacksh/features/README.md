# hacksh verification map

This directory is the maintained source for verifying the user-facing behavior of CLIs built with hacksh. Read the index, then use the matching feature file as the recipe.

## Baseline preconditions

- `node .agents/skills/verify-hacksh/scripts/doctor.mjs` exits 0.
- `verify-hacksh.local/scratch/$RUN/cli.ts` is a fresh copy of `templates/consumer.ts` (CLI name `demo`, version `1.0.0`), edited only as the recipe says.
- Every drive goes through `scripts/drive.mjs` with the same `--run $RUN`.

## Driving conventions

- `D` and `CLI` below are shorthands. Define them as a function and a variable, not as a string variable, because zsh does not word-split `$D`:

  ```sh
  D() { node .agents/skills/verify-hacksh/scripts/drive.mjs --run "$RUN" "$@"; }
  CLI=verify-hacksh.local/scratch/$RUN/cli.ts
  ```

- Labels may only contain letters, digits, `_`, `.`, and `-`. Name them after the case (`bool-false`), not the argv (`--dry-run=false`).
- Pass `--env NO_COLOR=1` for pretty-output proofs so transcripts are plain text.
- Treat every argv token as literal. Quote tokens that the shell would expand.

## Proof and skip reporting

- CLI proof is argv, env, exit code, stdout, and stderr from the evidence JSON.
- JSON-mode proof parses each line and checks `type` and the stream it arrived on.
- Interactive proof uses `--pty` and asserts the final collapsed result line plus the command's own output.
- Report an entry point you could not drive with the attempted command and the reason. Do not report it as verified through a different entry point.

## Feature entry contract

Each feature file has an H1, one paragraph of user-visible behavior, then exactly these H2s in order: `Sub-features`, `How to get to it (user POV)`, `Driving it with drive.mjs`, `Gotchas`.

## Features

- [Arguments and help](./arguments-and-help.md) covers named options, aliases, negation, positional tuples, extra/passthrough args, help, version, and validation errors.
- [Subcommands](./subcommands.md) covers routing, per-command help, hidden commands, and unknown commands.
- [Output modes](./output-modes.md) covers pretty versus JSON selection, `HACKSH_OUTPUT`, `CI`, `NO_COLOR`, and stream routing.
- [Logging](./logging.md) covers levels, kinds, categories, bound properties, placeholders, and runtime errors.
- [Prompts](./prompts.md) covers select, confirm, and text in a PTY, validation retry, cancellation, and the non-interactive failure.
