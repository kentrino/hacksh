# Output modes

Each invocation resolves one output mode before routing. Pretty is the default; JSON is selected by `HACKSH_OUTPUT=json`, by `runMain({ output: "json" })`, or automatically when `CI` is non-empty. JSON prints one `PrintEvent` per line: help, version, and `output` events to stdout; every log level, errors, and `exec` events to stderr. An invalid `HACKSH_OUTPUT` value is rejected before the command runs.

## Sub-features

- `mode-pretty` renders marks and the `│` continuation bar.
- `mode-json-env` selects JSON from `HACKSH_OUTPUT=json`.
- `mode-json-ci` selects JSON from non-empty `CI`.
- `mode-invalid` rejects `HACKSH_OUTPUT=JSON` (case-sensitive) with exit 1 and no command output.
- `mode-streams` routes results to stdout and logs to stderr.
- `mode-color` uses ANSI color only for pretty output, per stream, when that stream is a TTY and `NO_COLOR` is empty.

## How to get to it (user POV)

- Run any command normally (pretty).
- Run with `HACKSH_OUTPUT=json` or `CI=1` in the environment.
- Run in a terminal with and without `NO_COLOR`.

## Driving it with drive.mjs

Preconditions:

- Baseline from the index.

- **JSON from env.** Run `D --label levels-json --env HACKSH_OUTPUT=json --expect-code 0 -- CLI levels`. stdout is empty; stderr has eight `log` lines (trace, debug, info, warning, error, fatal, info/step, info/success). Every record's `category` is `["demo","levels"]`.
- **JSON from CI.** Run `D --label levels-ci --env CI=1 --expect-code 0 -- CLI levels`. Same streams and records as above.
- **Invalid mode.** Run `D --label bad-output --env HACKSH_OUTPUT=JSON --expect-code 1 -- CLI levels`. stdout is empty; stderr is one `error` line whose message is `Invalid HACKSH_OUTPUT value JSON; expected auto, pretty, or json`.
- **Structured help and errors.** Run `CLI --help` and `CLI deploy cli` with `HACKSH_OUTPUT=json`. Help is one stdout `usage` line; the validation failure is stderr `error` (kind `validation`) then `usage`.
- **Color.** Drive `levels` through `--pty` with a steps file containing only a comment, once without `NO_COLOR` and once with `--env NO_COLOR=1`. Only the first transcript contains `ESC[`.

## Gotchas

- The helper strips `CI`, `NO_COLOR`, and `HACKSH_OUTPUT` from your shell. A proof that depends on them must pass them with `--env`.
- Piping alone never selects JSON; `auto` checks only `CI`.
- In a PTY, stdout and stderr merge, so stream routing can only be proven without `--pty`.
