# Logging

Every `run` receives a `logger` with `trace`, `debug`, `info`, `warn`, `error`, `fatal`, plus `step` and `success` kinds. All levels are emitted by default, on stderr. `with` binds properties, `getChild` appends a category segment, and `{name}` placeholders interpolate properties. A thrown `HackshError` is printed by `runMain` as an `error` event and exits 1 unless it carries a custom exit status. Other thrown values reject without automatic reporting or exit.

## Sub-features

- `log-levels` emits all eight level/kind combinations with distinct pretty marks.
- `log-properties` prints bound and per-call properties under the message.
- `log-placeholders` interpolates `{target}`; unknown placeholders stay literal.
- `log-category` shows `[root:sub:child]`.
- `log-runtime-error` reports a thrown `HackshError` with its message and enumerable properties.
- `error-boundary` keeps return values silent and rethrows unexpected exceptions after draining output and releasing signal listeners.

## How to get to it (user POV)

- Run a command whose `run` logs: `demo levels`, `demo deploy api`.
- Run a command that throws: `demo explode`.

## Driving it with drive.mjs

Preconditions:

- Baseline from the index.

- **Pretty levels.** Run `D --label levels-pretty --env NO_COLOR=1 --expect-code 0 -- CLI levels`. stdout is empty; stderr has every level, including `▲  [demo:levels] warning` and the step and success lines.
- **Properties and placeholders.** Run the `deploy` drive from [Arguments and help](./arguments-and-help.md). stderr shows `◇  [demo:deploy] Deploying api to production` followed by `│    env: production` and `│    target: api`, and `[demo:deploy:upload] Uploaded 1 files` with `files: 1`, and the `▲` dry-run warning.
- **Runtime error.** Run `D --label explode-json --env HACKSH_OUTPUT=json --expect-code 1 -- CLI explode`. stderr is one `error` line with `message` `runtime exploded` and `properties.code` `E_RUNTIME`.
- **Unexpected error.** Change the `explode` handler to throw `new TypeError("implementation bug")`. Repeat the drive in JSON and pretty output. The unhandled rejection makes Node exit 1 with its own diagnostic, not a hacksh `error` event. Adding `onError` must not intercept this error.
- **Custom failure status.** Throw `new HackshExitError(7, "chosen failure")` from the handler (import `HackshExitError` from hacksh). Drive with `--expect-code 7`; stderr reports the message. An `onError` callback replaces that display, but the exit status stays 7.
- **Silent success.** Return `{ count: 3 }` without logging or writing output, then repeat with a void handler. Drive with `--expect-code 0` in both formats; stdout and stderr are empty.

## Gotchas

- Logger calls are not awaited but are drained before exit; a proof that a log appears must read the final transcript, not race the process.
- `timestamp` differs every run; do not compare JSON lines byte-for-byte.
