# Arguments and help

A hacksh CLI parses argv against its Zod object schema: named options (with kebab-case forms, short aliases, `--no-` negation for booleans), a `positionals` tuple for positional arguments, unknown options rejected by default (or retained in `input.unknown` with `allowUnknownArgs: true`), and everything after `--` into `input.passthrough`. `input.argv` preserves the selected command's original argument segment. `--help`/`-h` and `--version`/`-v` print generated help and the version; invalid input prints the issues plus usage on stderr and exits 1. Both `help` and `version` option names are reserved at definition time, including in subcommands.

## Sub-features

- `args-named` parses `--env production`, `--env=production`, and alias `-e production`.
- `args-boolean` parses `--dry-run`, `--dryRun`, `--no-dry-run`, `--dry-run=true|false`; rejects `--no-dry-run=false`.
- `args-positional` assigns tuple items in order and collects the rest (`<TARGET> [FILES...]`).
- `args-extra` rejects unknown options and excess positionals by default, retains them in `input.unknown` with `allowUnknownArgs: true`, and always collects post-`--` tokens in `input.passthrough`. The policy inherits down the route and children may override it.
- `help` renders synopsis, arguments, options, choices, and defaults.
- `version` prints the version.
- `validation-error` reports issues by CLI name (`<TARGET>`, `--env`) and appends usage.
- `args-environment` fills named options from `<ROOT>_<SUBCOMMAND...>_<OPTION>` variables (`DEMO_DEPLOY_ENV`, `DEMO_DEPLOY_DRY_RUN`); CLI arguments win, and help shows `(Env: NAME)`.

## How to get to it (user POV)

- Run the CLI with options and positionals: `demo deploy api a.txt -e production`.
- Run `demo --help`, `demo -h`, `demo deploy --help`.
- Run `demo --version`.
- Run with bad input: `demo deploy cli`, `demo deploy api --env`.

## Driving it with drive.mjs

Preconditions:

- Baseline from the index. The `deploy` command in the template prints `RESULT <json>` with `args` and `input: { argv, unknown, passthrough }`.

- **Unknown policy.** Use a command with one positional and no `allowUnknownArgs`. Invoke with `one --typo` and `one extra`; each exits 1 with no handler output. Repeat in JSON mode and assert the error issue’s `arg` is the rejected token. Invoke with `one -- --typo`; it succeeds and returns the token in `input.passthrough`. Add `allowUnknownArgs: true` and verify `one --typo extra` preserves both extra tokens in `input.unknown`. For subcommands, verify inheritance, explicit `false` overrides, and rejection of parent extras even when a child allows extras. Help and root version bypass rejection after successful routing.
- **Full parse.** Run `D --label deploy --env NO_COLOR=1 --expect-code 0 -- CLI deploy api a.txt -e production --dry-run --unknown=1 -- --help`. stdout ends with `RESULT {"args":{"positionals":["api","a.txt"],"env":"production","dryRun":true},"input":{"argv":["api","a.txt","-e","production","--dry-run","--unknown=1","--","--help"],"unknown":["--unknown=1"],"passthrough":["--help"]}}`.
- **Boolean forms.** Run with `--dryRun`, `--dry-run=false`, and `--no-dry-run` under separate labels. `RESULT` shows `dryRun` `true`, `false`, `false`. Run with `--no-dry-run=false` and `--expect-code 1`; stderr names `--no-dry-run`.
- **Help.** Run `D --label deploy-help --env NO_COLOR=1 --expect-code 0 -- CLI deploy --help`. stdout contains `USAGE deploy [OPTIONS] <TARGET> [FILES...]`, `TARGET  Target (Choices: web, api) (Required)`, `-e, --env=<ENV>  Environment (Choices: staging, production) (Default: staging) (Env: DEMO_DEPLOY_ENV)`, and `--[no-]dry-run  Skip side effects (Default: false) (Env: DEMO_DEPLOY_DRY_RUN)`. stderr is empty.
- **Environment.** Run `D --label env-sets --env NO_COLOR=1 --env DEMO_DEPLOY_ENV=production --env DEMO_DEPLOY_DRY_RUN=true --expect-code 0 -- CLI deploy api`. `RESULT` shows `"env":"production","dryRun":true`. Add `-e staging --no-dry-run` and `RESULT` shows `"env":"staging","dryRun":false`. With `--env DEMO_DEPLOY_DRY_RUN=yes` and `--expect-code 1`, stderr shows `DEMO_DEPLOY_DRY_RUN: expects true or false` and never the value.
- **Version.** Run `D --label version --env NO_COLOR=1 --expect-code 0 -- CLI --version`. stdout is `●  1.0.0`.
- **Validation error.** Run `D --label deploy-bad-enum --env NO_COLOR=1 --expect-code 1 -- CLI deploy cli`. stdout is empty; stderr starts with `■  Invalid arguments:` and `<TARGET>: Invalid option: expected one of "web"|"api"`, followed by the `deploy` usage.

## Gotchas

- Root `-v` is `--version` only because the template defines no `v` alias. Defining an `h` or `v` alias replaces that shorthand; check each argument schema's `.meta({ alias })` before asserting.
- Without `NO_COLOR=1` and outside a PTY, pretty output still has no color (stdout is not a TTY). Inside a PTY it does; set `NO_COLOR=1` for readable transcripts.
- Validation errors in JSON mode are two stderr lines, `error` then `usage`; see [Output modes](./output-modes.md).
