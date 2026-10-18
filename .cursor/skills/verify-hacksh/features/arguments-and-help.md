# Arguments and help

A hacksh CLI parses argv against its Zod object schema: named options (with kebab-case forms, short aliases, `--no-` negation for booleans), a `_` tuple for positional arguments, unknown options into `extraArgs`, and everything after `--` into `passthrough`. `--help`/`-h` and `--version`/`-v` print generated help and the version; invalid input prints the issues plus usage on stderr and exits 1.

## Sub-features

- `args-named` parses `--env production`, `--env=production`, and alias `-e production`.
- `args-boolean` parses `--dry-run`, `--dryRun`, `--no-dry-run`, `--dry-run=true|false`; rejects `--no-dry-run=false`.
- `args-positional` assigns tuple items in order and collects the rest (`<TARGET> [FILES...]`).
- `args-extra` keeps unknown options in `extraArgs` and post-`--` tokens in `passthrough`.
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

- Baseline from the index. The `deploy` command in the template prints `RESULT <json>` with `args`, `extraArgs`, and `passthrough`.

- **Full parse.** Run `D --label deploy --env NO_COLOR=1 --expect-code 0 -- CLI deploy api a.txt -e production --dry-run --unknown=1 -- --help`. stdout ends with `RESULT {"args":{"_":["api","a.txt"],"env":"production","dryRun":true},"extraArgs":["--unknown=1"],"passthrough":["--help"]}`.
- **Boolean forms.** Run with `--dryRun`, `--dry-run=false`, and `--no-dry-run` under separate labels. `RESULT` shows `dryRun` `true`, `false`, `false`. Run with `--no-dry-run=false` and `--expect-code 1`; stderr names `--no-dry-run`.
- **Help.** Run `D --label deploy-help --env NO_COLOR=1 --expect-code 0 -- CLI deploy --help`. stdout contains `USAGE deploy [OPTIONS] <TARGET> [FILES...]`, `TARGET  Target (Choices: web, api) (Required)`, `-e, --env=<ENV>  Environment (Choices: staging, production) (Default: staging) (Env: DEMO_DEPLOY_ENV)`, and `--[no-]dry-run  Skip side effects (Default: false) (Env: DEMO_DEPLOY_DRY_RUN)`. stderr is empty.
- **Environment.** Run `D --label env-sets --env NO_COLOR=1 --env DEMO_DEPLOY_ENV=production --env DEMO_DEPLOY_DRY_RUN=true --expect-code 0 -- CLI deploy api`. `RESULT` shows `"env":"production","dryRun":true`. Add `-e staging --no-dry-run` and `RESULT` shows `"env":"staging","dryRun":false`. With `--env DEMO_DEPLOY_DRY_RUN=yes` and `--expect-code 1`, stderr shows `DEMO_DEPLOY_DRY_RUN: expects true or false` and never the value.
- **Version.** Run `D --label version --env NO_COLOR=1 --expect-code 0 -- CLI --version`. stdout is `●  1.0.0`.
- **Validation error.** Run `D --label deploy-bad-enum --env NO_COLOR=1 --expect-code 1 -- CLI deploy cli`. stdout is empty; stderr starts with `■  Invalid arguments:` and `<TARGET>: Invalid option: expected one of "web"|"api"`, followed by the `deploy` usage.

## Gotchas

- Root `-v` is `--version` only because the template defines no `v` alias. Defining an `h` or `v` alias replaces that shorthand; check the command's `argOptions` before asserting.
- Without `NO_COLOR=1` and outside a PTY, pretty output still has no color (stdout is not a TTY). Inside a PTY it does; set `NO_COLOR=1` for readable transcripts.
- Validation errors in JSON mode are two stderr lines, `error` then `usage`; see [Output modes](./output-modes.md).
