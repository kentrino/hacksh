# Logging

Every `run` receives a `logger` with `trace`, `debug`, `info`, `warn`, `error`, `fatal`, plus `step` and `success` kinds. All levels are emitted by default. `with` binds properties, `getChild` appends a category segment, and `{name}` placeholders interpolate properties. An error thrown from `run` is printed as an `error` event and exits 1.

## Sub-features

- `log-levels` emits all eight level/kind combinations with distinct pretty marks.
- `log-properties` prints bound and per-call properties under the message.
- `log-placeholders` interpolates `{target}`; unknown placeholders stay literal.
- `log-category` shows `[root:sub:child]`.
- `log-runtime-error` reports a thrown error with its message and enumerable properties.

## How to get to it (user POV)

- Run a command whose `run` logs: `demo levels`, `demo deploy api`.
- Run a command that throws: `demo explode`.

## Driving it with drive.mjs

Preconditions:

- Baseline from the index.

- **Pretty levels.** Run `D --label levels-pretty --env NO_COLOR=1 --expect-code 0 -- CLI levels`. stdout has trace/debug/info/step/success lines; stderr has `▲  [demo:levels] warning` and the error and fatal lines.
- **Properties and placeholders.** Run the `deploy` drive from [Arguments and help](./arguments-and-help.md). stdout shows `◇  [demo:deploy] Deploying api to production` followed by `│    env: production` and `│    target: api`, and `[demo:deploy:upload] Uploaded 1 files` with `files: 1`. stderr has the `▲` dry-run warning.
- **Runtime error.** Run `D --label explode-json --env HACKSH_OUTPUT=json --expect-code 1 -- CLI explode`. stderr is one `error` line with `message` `runtime exploded` and `properties.code` `E_RUNTIME`.

## Gotchas

- Logger calls are not awaited but are drained before exit; a proof that a log appears must read the final transcript, not race the process.
- `timestamp` differs every run; do not compare JSON lines byte-for-byte.
