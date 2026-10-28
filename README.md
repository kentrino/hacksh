# hacksh

Define a type-safe command-line interface with a Zod 4 object schema. The same schema parses and
validates arguments, infers the value passed to `run`, and generates help. Run external commands
with the context’s `exec`, write results with `output`, use its `logger` for progress, and request
interactive input with `prompt`.

- [Install](#install)
- [Quick start](#quick-start)
- [Arguments](#arguments)
  - [Options and flags](#options-and-flags)
  - [Positional arguments](#positional-arguments)
  - [Argument metadata](#argument-metadata)
  - [Environment variables](#environment-variables)
  - [Unknown arguments and forwarding](#unknown-arguments-and-forwarding)
- [Subcommands](#subcommands)
- [The run context](#the-run-context)
  - [External commands](#external-commands)
  - [Command output](#command-output)
  - [Structured logging](#structured-logging)
  - [Interactive input](#interactive-input)
  - [Cancellation and exit status](#cancellation-and-exit-status)
- [Output formats](#output-formats)
- [Programmatic API and errors](#programmatic-api-and-errors)
  - [Entry points](#entry-points)
  - [Composable run functions](#composable-run-functions)
  - [Printers and events](#printers-and-events)
  - [Standalone parsing and help](#standalone-parsing-and-help)
  - [Errors](#errors)
- [Development](#development)
- [Name and acknowledgments](#name-and-acknowledgments)

## Install

```sh
pnpm add hacksh zod
```

hacksh is an ESM package and supports Node.js 22.18 or newer. Zod is a peer dependency, so an
application controls the Zod 4 version it uses. The public schema types and schema inspection use
the shared `zod/v4/core` API and accept schemas created with either `zod` or `zod/mini`.

## Quick start

```ts
import { z } from "zod";
import { defineCommand, runMain } from "hacksh";

const main = defineCommand({
  name: "git-summary",
  version: "0.1.0",
  description: "Show a commit summary",
  args: z.object({
    positionals: z.tuple([
      z.string().default("HEAD").meta({ title: "REF", description: "Commit to inspect" }),
    ]),
    repo: z.string().optional().meta({ description: "Repository directory", alias: "C" }),
  }),
  async run({ args, exec, output }) {
    const [ref] = args.positionals;
    const { stdout } = await exec(
      "git",
      ["show", "--no-patch", "--format=%h %s", "--end-of-options", ref],
      { cwd: args.repo },
    );
    output.println(stdout);
  },
});

await runMain(main);
```

```sh
git-summary
git-summary HEAD~1 -C ./my-repo
git-summary --help
git-summary --version
```

`args` is inferred from the Zod schema, and `exec` runs external commands with an argument array,
captures output with one final newline removed, throws on failure, and observes invocation
cancellation. See [Arguments](#arguments) for option and positional rules,
[The run context](#the-run-context) for `exec`, `output`, `logger`, `prompt`, and `signal`, and
[Output formats](#output-formats) for how results and logs are split between stdout and stderr.

## Arguments

### Options and flags

Boolean fields are flags and other fields take a value. Both a schema key and its kebab-case form
are accepted (`--dryRun` and `--dry-run`). Every boolean flag also accepts a `--no-` prefixed form
that sets it to `false`, such as `--no-verbose`, which is how a default-on flag is disabled.
Boolean flags also accept the explicit forms `--verbose=true` and
`--verbose=false`; other inline values and values on a negated flag (such as
`--no-verbose=false`) are validation errors. Value options accept `--repo ./my-repo` and
`--repo=./my-repo`; values such as `false` remain strings for non-boolean fields.

Boolean flags are shown in help as `--[no-]name` because they also accept the `--no-` form. The
`negatable` field of `UsageOptionSummary` carries the same information for machine-readable
help, where `flags` keeps the literal `--name` spelling.

`--help` and `--version` are built in:

- `--version` is a root-only builtin. It prints the root command's `version`. When the root has
  none, `runMain` resolves the executable (`process.argv[1]`) through symlinks and prints the
  `version` of the nearest ancestor `package.json` that declares one, so a published CLI reports its
  package version without repeating it in code. `runCommand` does not search the filesystem.
- Without an alias of the same letter, `-h` and `-v` are shorthands for `--help` and `--version`.
  Defining an `h` or `v` alias on an option replaces the shorthand while keeping `--help` and
  `--version` available.
- Both `help` and `version` option names are reserved and throw a `TypeError` from `defineCommand`
  on every command.
- Output selection does not reserve any additional command-line flags, so names such as `--json`,
  `--output`, and `--log-format` remain available to application schemas.

### Positional arguments

Declare positional arguments as a `z.tuple` in the `positionals` field. Tuple items are assigned in order,
and the tuple rest collects all remaining values. Optional or defaulted items must come after
required ones, and items cannot be booleans or arrays. The `positionals` field is never a named option.

```ts
const copy = defineCommand({
  name: "copy",
  args: z.object({
    positionals: z.tuple(
      [z.string().meta({ title: "DESTINATION", description: "Output directory" })],
      z.string().meta({ title: "FILES", description: "Input files" }),
    ),
  }),
  run({ args }) {
    const [destination, ...files] = args.positionals; // [string, ...string[]]
    return { destination, files };
  },
});
```

```sh
copy out a.txt b.txt   # { positionals: ["out", "a.txt", "b.txt"] }
```

Help and validation errors label each item with its `.meta({ title })`, such as `<DESTINATION>` and
`[FILES...]`. Untitled items are labeled by position (`ARG1`, `ARG2`, ...) and an untitled rest is
labeled `ARGS`. Use `z.array` instead of a tuple to accept only variadic values. Without a rest,
additional positional arguments are rejected by default, as are unknown options.

### Argument metadata

Use Zod 4 `.meta({ alias, valueName, env, title, description })` on each argument schema.
Importing hacksh types `alias`, `env`, and `valueName` on Zod's global metadata; any other key stays
allowed. Metadata does not change schema keys, parsed output, or validation error paths. `z.enum` choices
and descriptions appear in generated help, including inside supported schema wrappers and tuple items.

```ts
const convert = defineCommand({
  name: "convert",
  args: z.object({
    positionals: z.tuple(
      [z.enum(["small", "large"]).meta({ title: "SIZE", description: "Item size" })],
      z.string().meta({ title: "INPUT", description: "Input files" }),
    ),
    format: z
      .enum(["json", "yaml"])
      .optional()
      .meta({ description: "Output format", alias: "f", valueName: "FORMAT" }),
    overwrite: z.boolean().default(true).meta({ description: "Replace existing files" }),
    verbose: z
      .boolean()
      .default(false)
      .meta({ description: "Show details", alias: ["v", "V"] }),
  }),
});
```

```sh
convert large -f yaml -v a.txt b.txt
# { positionals: ["large", "a.txt", "b.txt"], format: "yaml", overwrite: true, verbose: true }
```

```text
USAGE convert [OPTIONS] <SIZE> [INPUT...]

ARGUMENTS

  SIZE  Item size (Choices: small, large) (Required)
  INPUT...  Input files

OPTIONS

  -f, --format=<FORMAT>  Output format (Choices: json, yaml)
  --[no-]overwrite  Replace existing files (Default: true)
  -v, -V, --[no-]verbose  Show details (Default: false)
```

- `alias` gives a named option one or more single-character short forms. Defining `v` above replaces
  the default `-v` version shorthand, so `convert -v` sets `verbose`.
- `valueName` sets the value label of a named option.
- `env` overrides an option's automatic environment variable name, or disables it with `false`.
- `title` labels a positional argument; `description` supplies its help text.

Place metadata on the outer schema to override metadata inherited through wrappers. Zod's native
`.describe(text)` remains equivalent to description metadata; new code should use `.meta({ description: text })`.
With `zod/mini`, use `.check(mini.meta({ ... }))`.

`defineCommand` validates metadata types and throws a `TypeError` for empty or multi-character
aliases, duplicate aliases, and option-only metadata (`alias`, `env`, `valueName`) on positional
schemas.

### Environment variables

Every named option of a command tree whose root has a `name` can also be set from an environment
variable. The name joins the root name, the subcommand keys on the route, and the option key in
upper snake case.

```ts
const deploy = defineCommand({
  args: z.object({
    target: z.string(),
    dryRun: z.boolean().default(false),
    token: z.string().meta({ env: "GITHUB_TOKEN" }),
  }),
  run: ({ args }) => args,
});
const main = defineCommand({ name: "my-cli", subCommands: { deploy } });
```

```sh
MY_CLI_DEPLOY_TARGET=prod MY_CLI_DEPLOY_DRY_RUN=true GITHUB_TOKEN=t my-cli deploy
# { target: "prod", dryRun: true, token: "t" }
```

- A command-line argument wins over the environment, and the environment wins over the schema
  default. `--no-dry-run` overrides `MY_CLI_DEPLOY_DRY_RUN=true`.
- Values go through the same schema as command-line values. Boolean options accept only `true`
  and `false`. An empty value is a value, not an unset variable.
- `env: "NAME"` replaces the derived name and `env: false` turns it off. Array and object options,
  positional arguments, and commands under an unnamed root get no derived name.
- Help shows the name as `(Env: MY_CLI_DEPLOY_TARGET)`, and `UsageOptionSummary.env` carries it.
  Errors name the variable but never include its value.
- `runCommand` and `runMain` read the `env` option, defaulting to `process.env`.
  `parseArgs(command, argv, { env })` reads the environment only when `env` is given.
- Two options that resolve to the same name on one route, such as a root `deployTarget` and a
  `deploy` subcommand's `target`, make the invocation throw a `TypeError`.

### Unknown arguments and forwarding

A command rejects unknown options and excess positional arguments before its `run` handler or
schema transforms execute. For ordinary commands, declare the accepted arguments in `args`;
there is no need to inspect `input.unknown` manually. Errors are `HackshValidationError` instances,
with each rejected token in `issues[].arg`.

Everything after `--` is always collected unchanged in `input.passthrough`, independently of this policy.
Use that explicit boundary when forwarding arguments to another executable:

```ts
const forward = defineCommand({
  name: "git-forward",
  async run({ exec, input, output }) {
    const { stdout } = await exec("git", input.passthrough);
    output.println(stdout);
  },
});
// git-forward -- status --short
```

For a wrapper that also accepts undeclared arguments before `--`, set `allowUnknownArgs: true`:

```ts
const wrapper = defineCommand({
  allowUnknownArgs: true,
  async run({ input, exec }) {
    await exec("some-tool", [...input.unknown, ...input.passthrough]);
  },
});
```

`input.unknown` preserves the order of unknown option tokens and excess positional values. Unknown
options do not consume a following value: if the schema has an unfilled positional slot, that
value fills it. Known options are still parsed and validated. Use `--` when a child's arguments
must not be interpreted by this command. A handler that does not use `input.passthrough` ignores those
arguments; commands that require rejecting them can check `input.passthrough.length` explicitly.

`allowUnknownArgs` defaults to `false`, inherits down the selected subcommand route, and can be
overridden by each child. A child's setting does not change validation of its parent's arguments.
Definitions are not mutated, so reusing a child under another root does not retain inherited settings.
Standalone `parseArgs` uses the supplied command's setting and does not resolve a parent route.

Once routing succeeds, help and root version output take precedence over argument validation,
including unknown arguments. Routing errors such as an unknown subcommand still fail. A child's
undeclared `--version` is an unknown argument, since the version builtin belongs to the root.

## Subcommands

```ts
const main = defineCommand({
  name: "worktree",
  args: z.object({ repo: z.string() }),
  subCommands: {
    new: defineCommand({
      args: z.object({ name: z.string() }),
      async run({ args, logger }) {
        logger.success("Created {name}", { name: args.name });
      },
    }),
    migrate: defineCommand({
      hidden: true,
      run() {
        // Internal or deprecated command, still callable as `worktree migrate`.
      },
    }),
  },
  async run() {
    // Runs only when no subcommand is selected.
  },
});
```

Parent options precede the subcommand (`worktree --repo owner/repo new --name feature`). A selected
subcommand prevents the parent `run` handler from running. `worktree new --help` displays help for
`new`. Set `hidden: true` on a subcommand to omit its name and description from its parent's help
listing, including usage shown for an unknown command. Hidden commands remain available by name and
their own `--help` output remains available. If every subcommand is hidden, help keeps the generic
`<COMMAND>` syntax but omits the empty `COMMANDS` section.

## The run context

Every `run` handler receives a `CommandContext` with:

- `args` — validated output inferred from the command's `args` schema.
- `input` — the raw selected command segment (`argv`), accepted unknown tokens (`unknown`), and
  tokens after `--` (`passthrough`). For a routed child, `input.argv` excludes parent options and
  subcommand names.
- `command` — the resolved command definition. An unnamed subcommand is represented by a completed
  copy whose `name` is its key; the original definition is not mutated.
- `exec` — runs external commands under the invocation's environment, printer, and cancellation.
- `output` — writes the command's results to stdout through the invocation's printer.
- `logger` — emits structured log records to stderr through the invocation's printer.
- `prompt` — requests interactive `select`, `confirm`, or `text` input.
- `signal` — an `AbortSignal` for the invocation.

### External commands

Every `run` context has an `exec` function that starts an executable with an argument array. It
never uses a shell, so spaces, quotes, `$`, `;`, `|`, and `*` in arguments reach the child
unchanged. By default it resolves with the captured output and rejects with `HackshExecError`
when the command fails. Pass `reject: false` to receive failures as results instead. Prefer this
context API to `node:child_process`, `spawnSync`, or a custom subprocess wrapper inside a command
handler so execution uses the invocation’s environment, cancellation, and printer.

```ts
import { HackshExecError } from "hacksh";

const check = defineCommand({
  name: "check-head",
  async run({ exec, logger }) {
    const head = await exec("git", ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"], {
      reject: false,
    });
    if (head.status === "failed") {
      // Only this specific exit means that the revision was not found.
      if (head.reason === "exit-code" && head.exitCode === 1) {
        logger.warn("The repository has no HEAD commit");
        return;
      }
      // Missing executables, cancellation, and other failures must still fail the command.
      throw new HackshExecError("Could not inspect HEAD", head);
    }
    logger.info("HEAD is {commit}", { commit: head.stdout });
  },
});
```

Results have `status` `"succeeded"` or `"failed"`, the `command` (`file`, `args`, `cwd`), and
UTF-8 `stdout` and `stderr` with one final newline removed. A failure's `reason` is `exit-code`
(with `exitCode`), `signal` (a signal the child received from elsewhere, with `signal`), `spawn`
(the executable or cwd could not be used, with `error`), or one of `timeout`, `aborted`, and
`output-limit` when hacksh stopped the child. The return type follows `reject`: omitted or `true`
gives `ExecSuccess`, while `false` or a `boolean` variable gives `ExecResult`, which must be
narrowed before reading `exitCode`.

#### Working with captured output

Use `stdout` directly for a single value such as a commit ID or repository path. Do not call
`.trim()` on paths: surrounding whitespace can be part of the name. `exec` already removes one
final LF or CRLF; it preserves other whitespace and NUL separators.

Interpret structured output according to the child command’s format. If it offers JSON, request
that format and parse it with `JSON.parse` (and a Zod schema when validation is needed). For Git’s
`--porcelain -z` output, keep the NUL delimiters and parse the records in a named, application-specific
helper. Splitting that format on newlines would break paths containing newlines. hacksh does not
parse Git records or infer whether stdout is text, JSON, or a list.

#### Execution options

Options are `cwd`, `env`, `input`, `reject`, `timeout` (milliseconds), `signal` (an
`AbortSignal`), `maxBuffer` (bytes per stream, default 100,000,000), `forceKillAfterDelay`
(milliseconds, default 5,000), and `dryRun`. Every call also stops with `aborted` when the
invocation's `signal` aborts. `input` is written to stdin and closed; otherwise stdin is empty.
Output beyond `maxBuffer` is truncated to that many bytes. On timeout, abort, or output limit,
hacksh sends `SIGTERM` to the child it started and `SIGKILL` after `forceKillAfterDelay`; it does
not stop grandchildren, and it does not wait for them to close inherited pipes. Invalid arguments
or options reject with `TypeError` without starting anything, even with `reject: false`.

The child's environment starts from the invocation's `env` option on `runCommand` or `runMain`, or
from `process.env` when that is absent. The `env` option on `exec` sets variables and removes those
set to `undefined`. Concurrent invocations with different `env` options do not share settings.
`HackshExecError` messages include the command and the reason but never the child's output; read
`error.result` for the full failure, which error summaries and JSON error events omit.

Before starting a child, `exec` prints an `exec` event through the invocation's printer, on stderr
in both formats. Pretty output shows `$` followed by the command line and, when set, its `cwd`. The
JSON event has `phase: "start"`, `command` (`file`, `args`, and `cwd` when set), `stdio`, and
`interactive`; it never includes `env` or `input`. Pass `display: false` to hide one call. Pass
`redact` with secret values to replace every occurrence in the file, arguments, and cwd with `***`
in the event, the result's `command`, the `HackshExecError` message, and a `spawn` failure's
`error`. The child still receives the real values, and its captured output is returned unchanged.

`dryRun: true` does not start the child and does not write `input`. The result is
`{ status: "skipped", command }` with the redacted command and no `stdout`, `stderr`, or `exitCode`.
The `exec` event uses `phase: "skip"` and the same command, stdio, and `interactive` flag.
Pretty output marks that line with `#` instead of `$`. Omit `dryRun`, or pass `false`, to keep
today's success or failure result. A boolean `dryRun` returns the union of a skip and the executed
result, so narrow `status` before reading output. `reject` does not apply to a skip. An invocation
signal that is already aborted still fails as `aborted` before any skip event, and `reject` applies
to that failure. Option checks still run, including `input` together with `stdin: "inherit"`.
JSON mode, a non-interactive environment, and a busy terminal still show the plan and return
a skip. `display: false` hides the skip event. `dryRun` is not read from CLI flags or
`context.args`.

```ts
await exec("git", ["worktree", "add", path, branch], { cwd: repository });
await exec("gh", ["auth", "login", "--with-token"], { input: token, display: false });
await exec("curl", ["-H", `Authorization: Bearer ${token}`, url], { redact: [token] });
```

Child output is captured by default and never written to the terminal by hacksh. Set `stdin`,
`stdout`, or `stderr` to `"inherit"` to hand that stream of the parent process to the child; an
inherited stream bypasses the printer and any `stdout`/`stderr` writers given to `runMain` or
`runCommand`, and its result field is `""`. `input` cannot be combined with `stdin: "inherit"`.
Set `interactive: true` when the child talks to the user through the terminal, including tools
that open `/dev/tty` themselves; hacksh cannot detect that, and it does not create a PTY.

```ts
// Select a row: the table goes to stdin, the selection comes back on stdout.
const { stdout: picked } = await exec("fzf", [], { input: table, interactive: true });
// Hand the whole terminal to a long-running command.
await exec("gh", ["run", "watch", id], { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
```

These calls fail before starting the child, without an `exec` event, and follow `reject` like any
other failure: `json-output` when a stream is inherited in JSON mode, `non-interactive` when
`interactive: true` is used outside an interactive mode (the same rule as prompts), and
`overlapping` when a call that uses the terminal (interactive or inheriting a stream) starts while
a prompt or another such call is active. A prompt started during such a call fails with
`HackshPromptError` reason `overlapping`. Captured calls can run alongside prompts. Signals such
as Ctrl-C reach the whole foreground process group; hacksh does not forward them or manage jobs.

On Deno, `exec` needs `--allow-run` and unscoped `--allow-env`, because Deno's `node:child_process`
reads the whole environment to start a process.

To test a command without starting processes, call its `run` with a context whose `exec` is your own
function of type `Exec`.

### Command output

Every `run` context has an `output` for the data the command produces, kept apart from progress
and diagnostics on `logger`. `print(text)` writes text exactly as given, `println(text)` adds a
newline, and `json(value)` writes a JSON value.

```ts
const report = defineCommand({
  name: "report",
  async run({ logger, output }) {
    logger.step("Collecting commits");
    output.print(renderTable(rows)); // already ends with a newline
    output.println(`${rows.length} rows`);
    output.json({ rows });
  },
});
```

In pretty output, text goes to stdout unchanged and `json` values are indented with two spaces.
In JSON output, each call writes one line on stdout: `{"type":"output","kind":"text","text":...}`
holding the exact text, including the newline `println` adds, or
`{"type":"output","kind":"json","data":...}`. Concatenating the `text` values reproduces the
pretty stdout, except that terminal control sequences are removed as in every JSON string. `json`
values are normalized like log properties.

hacksh never prints a `run` return value; it is returned to `runCommand` callers only.
`runMain` reports thrown `HackshError` instances on stderr and rethrows other exceptions.
Output that was written before a failure stays written. Like logger calls,
`output` calls do not need to be awaited and are drained before execution finishes. Writing to
`process.stdout` or `console.log` directly bypasses the printer, the output mode, and any `stdout`
writer given to `runMain` or `runCommand`.

### Structured logging

Every `run` context has a `logger`. Its `trace`, `debug`, `info`, `warn`, `error`, and `fatal`
methods emit structured records through the invocation's printer. `step` and `success` are
info-level records with a distinct semantic kind for presentation. Placeholders in braces use the
record's properties. Every level is emitted and displayed by the default printer; there is no
built-in severity threshold or verbose flag.

```ts
const deploy = defineCommand({
  name: "deploy",
  async run({ logger }) {
    const log = logger.with({ app: "web", env: "prod" });
    log.step("Deploying {app} to {env}");
    log.getChild("upload").debug("Uploaded {files} files", { files: 12 });
    log.success("Deployed {app}");
  },
});
```

Properties passed to an individual call override properties bound by `with`. `getChild` appends a
category segment; hacksh automatically starts the category with the named root and each resolved
subcommand. Missing placeholders, and placeholders whose values cannot be converted to text,
remain unchanged without discarding their properties. Passing an `Error` to `error` or `fatal`
uses its message and adds a canonical, schema-free error summary as `properties.error`. Error
values nested in other log properties are summarized the same way before custom printers receive
the event.

Each `log` print event contains a `record` with `level`, `kind`, `category`, interpolated `message`,
template `rawMessage`, merged `properties`, and a numeric `timestamp`. Logger calls do not need to
be awaited: they use the invocation's serialized output queue, which is drained before execution
finishes. A printer failure rejects the invocation without changing a successful `run` value.

### Interactive input

Every `run` context has a `prompt` with `select`, `confirm`, and `text` methods. Interactive input
is separate from `logger`: prompts share the invocation's selected printer, serialized output queue,
terminal lock, output mode, and abort signal.

```ts
const deploy = defineCommand({
  name: "deploy",
  async run({ logger, prompt }) {
    const environment = await prompt.select({
      message: "Environment",
      options: [
        { value: "staging", hint: "safe default" },
        { value: "production", label: "Production" },
      ] as const,
      initialValue: "staging",
    }); // "staging" | "production"
    const confirmed = await prompt.confirm({ message: `Deploy to ${environment}?` });
    if (!confirmed) return;
    const release = await prompt.text({
      message: "Release name",
      placeholder: "v1.2.3",
      validate: (value) => (value.length === 0 ? "A release name is required" : undefined),
    });
    logger.success("Deploying {release}", { release });
  },
});
```

Select values retain their literal union type. Arrow keys change the selected choice, Enter accepts
it, and `initialValue` controls the initial selection. Confirm accepts `y`, `n`, or Enter; Enter
uses `initialValue` when supplied and otherwise means no. Text displays its placeholder without
using it as input, supports editing, and repeats the prompt only when `validate` returns a nonempty
message; `""` means valid. Backspace removes one Unicode code point. Input pasted after a selection
or confirmation is retained for the next sequential prompt instead of being discarded.
The built-in prompt API intentionally stops at select, confirm, and text; it does not provide a
multiselect prompt.

Prompts are allowed only when the resolved mode is interactive: pretty output outside CI with TTY
stdin and stdout. JSON, CI, and non-TTY invocations throw `HackshPromptError` immediately even if a
default is available. Its `reason` and `prompt` fields identify why input failed and the prompt's
`kind`, `message`, and select `choices`. Reasons distinguish `non-interactive`, `cancelled`,
`aborted`, `eof`, `overlapping`, `invalid-options`, `input-error`, and `printer-error`. Ctrl-C and
Escape cancel; `runMain` reports cancellation and exits with status 130. A prompt that starts or is
waiting after the invocation's `signal` aborts fails with `aborted` and the signal's reason as its
`cause`. Only one prompt may be active in an invocation. Input listeners and raw terminal mode are
restored after every outcome.
Failed prompts emit a non-visible `closed` prompt state through the same printer before rejecting,
so callers that catch cancellation, EOF, input, or printer errors do not leave stale terminal UI.

Active pretty prompts redraw in place rather than appending a block for every key. A completed
prompt collapses to one result line. If a logger or output event arrives while a prompt is active, the
printer removes the prompt, renders the event, and then redraws the current prompt state.
Physical rows are calculated from explicit newlines, ANSI-free Unicode display width, and
`stdout.columns`, including terminal wrapping. When a custom output writer does not expose a
positive `columns` value, the renderer conservatively counts explicit lines only.

### Cancellation and exit status

Every `run` context has a `signal`, an `AbortSignal` for that invocation. `exec` calls and prompts
already follow it; pass it to `fetch` and other APIs that accept one. Cancellation is cooperative:
hacksh does not stop code that ignores the signal.

```ts
import { defineCommand, HackshExitError, runCommand } from "hacksh";

const check = defineCommand({
  name: "check",
  async run({ signal }) {
    const response = await fetch("https://example.com/health", { signal });
    if (!response.ok) throw new HackshExitError(2, `Health check returned ${response.status}`);
  },
});

const controller = new AbortController();
await runCommand(check, [], { signal: controller.signal });
```

`runCommand` accepts a `signal` option and never listens for process signals or exits. If that
signal is already aborted, `runCommand` rejects with its reason without calling `run`; aborting it
later aborts the context's `signal`.

`runMain` listens for `SIGINT` and `SIGTERM` while it runs and removes those listeners before it
returns or exits. The first signal aborts the invocation with an `AbortError` named after the
signal. When `run` returns, throws a `HackshError`, or rejects with that exact signal reason,
output is drained and the process exits with 130 for `SIGINT` or 143 for `SIGTERM`. Unrelated
exceptions and output failures still reject instead of being converted to a signal exit.
A second signal while the invocation is pending exits immediately with that signal's status.

Throw `HackshExitError(exitCode, message?)` to choose the exit status, an integer from 0 to 255.
`runMain` prints a non-empty message as an ordinary CLI error and prints nothing when the message
is omitted; `onError` still receives the error. `runCommand` rethrows it unchanged.
Other `HackshError` instances exit with 1, or 130 for a cancelled prompt.

## Output formats

`runMain` and `runCommand` resolve one output mode before command routing, parsing, or execution.
Their `output` option accepts `"auto"` (the default), `"pretty"`, or `"json"`. A valid
`HACKSH_OUTPUT` environment value takes precedence over that option. `auto` selects JSON only when
`CI` has a non-empty value; redirecting or piping stdout alone retains pretty output. Invalid
explicit option or environment values never execute the command. Both entry points reject with a
`TypeError`; `runMain` does not call `onError`, print a fallback error event, or force an exit.
Output values are case-sensitive.

```ts
await runMain(main, { output: "auto" });
// HACKSH_OUTPUT=json my-cli --help overrides the configured preference.
```

stdout carries the command's results: `output` events, help, and version. Every log level, errors,
and `exec` events go to stderr, so a pipe such as `my-cli | jq` receives only results while logs
remain visible on the terminal. Direct writes such as `console.log` bypass the printer and are not
converted to JSON.

The resolved `OutputMode` has `format`, `interactive`, and `color` fields. Interaction is enabled
only for pretty output outside CI when both stdin and stdout are TTYs. `color` has a `stdout` and a
`stderr` flag; each is enabled only for pretty output when that stream is a TTY and `NO_COLOR` is
empty or absent, so logs stay colored on the terminal when stdout is redirected. These decisions
are independent: an explicit pretty format in CI can use color, but remains noninteractive. `env`,
`stdin`, `stdout`,
and `stderr` can be supplied in execution options for embedded or tested invocations.
Custom `stdin` values implement the readable-stream operations `on`, `removeListener`, `resume`,
and `pause`; `isTTY`, `isRaw`, `readableFlowing`, and `setRawMode` describe optional terminal
capabilities. A stream without those readable operations fails with an `input-error` if prompting
is attempted.

JSON output contains exactly one `PrintEvent` object per line, on the streams described above.
Usage attached to an error retains its `stderr` stream. Every log level is emitted by default. JSON strings have
terminal control sequences removed, and the printer never serializes executable command or Zod
schema objects.

Arbitrary log properties and error details are normalized predictably: BigInt values become
decimal strings; non-finite numbers become `null`; `undefined`, symbols, and functions receive
explicit string markers; dates and URLs use their guarded `toJSON` representations; Buffer uses
its `{ type, data }` representation; typed arrays become arrays; maps and sets become arrays; and
cycles become `"[Circular]"`. ANSI sequences are removed from keys as well as values. Errors retain
their kind, name, message, stack, canonical cause, validation issues, and independently readable
enumerable properties. Unreadable properties become `"[Unserializable]"`; a throwing `toJSON`
falls back to those properties. If an exotic value prevents normalization entirely, the line
keeps the original event `type` and adds `serializationError`, so downstream JSON-lines parsing
remains synchronized.

Pretty output uses a fixed presentation with semantic marks and a continuation bar. Trace, debug,
info, warning, error, and fatal records each have a distinct mark; step and success records have
their own marks as well, so meaning does not depend on color. Categories appear before log messages,
and every line of multiline messages, properties, help, and errors remains inside the same visual
block. All six log levels are displayed by default.

```text
◇  [deploy] Building web
│    files: 12
✔  [deploy] Deployed web
▲  [deploy] Cache was not cleared
```

Pretty output uses Unicode symbols by default. Set `unicode: false` on `runMain` or `runCommand` for
ASCII marks and bars. Color is still resolved from the selected output mode: each event is colored
only when its stream is a TTY, and any non-empty `NO_COLOR` disables it. Unicode selection does not affect
JSON output. An invocation does not add automatic start or end messages; the renderer presents only
the semantic events that the command emits.

## Programmatic API and errors

### Entry points

`defineCommand` preserves the handler's exact return type. Handlers are ordinary functions that
return values or `void`, synchronously or asynchronously. `runCommand(command, argv, options)`
returns a promise of the awaited result, unioned with results from every possible routed
descendant and `undefined` for help/version. Routing-only commands add no handler result.
Thrown exceptions, argument errors, and output failures reject the promise. `runCommand` never
exits or automatically prints a return value or error.

`runMain(command)` reads `process.argv`, discards return values, and only handles thrown
`HackshError` instances as normal CLI failures. Other exceptions reject without automatic error
display, `onError`, or process exit. Pending output is drained and signal listeners are removed
on both success and rejection. Output failures also reject, including while reporting a CLI
error; they are not hidden by a forced exit. See
[Cancellation and exit status](#cancellation-and-exit-status) for exit codes.
Use `argv` to inject arguments. Omitting it uses `process.argv.slice(2)`; an empty array is an
explicit empty invocation. `runMain` returns `Promise<void>`. A reusable entry point is an ordinary
local function:

```ts
import { runMain } from "hacksh";

const mainEntry = (argv: string[] = ["--verbose"]) => runMain(main, { argv });
await mainEntry(); // uses the local default
await mainEntry([]); // explicitly supplies no arguments
```

Help and the usage appended to validation or routing errors use the invocation's printer.
Usage events target stdout for help and stderr for errors. Pass `onError` to replace the entire
default display of a `HackshError`, including usage. It receives the original error instance;
output written by this application callback remains its own responsibility. If the callback
throws or rejects, `runMain` drains output, removes its listeners, and rejects without exiting:

```ts
await runMain(main, {
  argv: ["--help"],
  async onError(error) {
    console.error(`gh-pr-commits: ${error.message}`);
  },
});
```

### Composable run functions

Use ordinary functions and `await`; no handler factory or result envelope is required.
Throw a `HackshError` subclass for an expected CLI failure. Catch only the specific failures
the caller can recover from and rethrow everything else:

```ts
import { z } from "zod";
import { defineCommand, HackshError, type CommandContext } from "hacksh";

class AppError extends HackshError {}

class NotFoundError extends AppError {
  readonly id: string;

  constructor(id: string) {
    super(`User ${id} was not found`);
    this.id = id;
  }
}

const users = new Map([["alice", { id: "alice", displayName: "Alice" }]]);

function loadUser(id: string) {
  const user = users.get(id);
  if (!user) throw new NotFoundError(id);
  return user;
}

const schema = z.object({ id: z.string() });

function run({ args }: CommandContext<typeof schema>) {
  try {
    return loadUser(args.id);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { id: error.id, displayName: "Guest" };
    }
    throw error;
  }
}

const command = defineCommand({ args: schema, run });
```

The context's `args` is the validated, transformed schema output, not raw argv. Domain functions
such as `loadUser` need not depend on `CommandContext`. Omit the recovery branch when an expected
failure should reach `runMain` and be displayed there.

`HackshError(message?, options?)` supports the standard `ErrorOptions.cause` and uses the concrete
subclass name as `error.name`. Application subclasses can add their own fields. A plain `Error`,
`TypeError`, or non-error thrown value is not classified as an expected CLI failure. Do not
blanket-wrap unknown exceptions in `HackshError`: doing so would hide that distinction.

### Printers and events

The root `hacksh` entry exposes command-definition and execution APIs. Import printer factories,
output-mode helpers, `Printer`, `PrintEvent`, and renderer-facing event and summary types from
`hacksh/printer`. A custom printer can narrow `PrintEvent` on `event.type` without importing
each individual event type.

Pass a `printer` in `options` to receive all output produced by an invocation as structured events:

```ts
import { runCommand } from "hacksh";
import type { PrintEvent, Printer } from "hacksh/printer";

const events: PrintEvent[] = [];
const printer: Printer = {
  async print(event) {
    events.push(event);
  },
};

await runCommand(main, ["--help"], { printer });
// events[0] is { type: "usage", usage, text, stream: "stdout" }
```

The current events are `usage`, `version`, `error`, `log`, `prompt`, `output`, and `exec`. Usage events include the resolved
command's schema-free name, version, description, synopsis, arguments, options, and visible child
commands, plus rendered text and the intended `stdout` or `stderr` stream. Version events include
the version string. Error events contain a schema-free summary with an explicit `kind`, structured
validation issues, standard `Error` fields, custom enumerable properties, and recursively
canonical causes; log events contain the structured record described above. Prompt events contain
the prompt kind, status, current value or choices, placeholder, and validation message. Output
events carry `kind: "text"` with `text` or `kind: "json"` with `data`. Printer calls are serialized, may be asynchronous, and are
drained before `runCommand` or `runMain` completes or exits. A printer rejection rejects
`runCommand`.

Use `createPrettyPrinter({ color, unicode, stdout, stderr })` to reuse the built-in human-readable
renderer with custom writable targets; `color` is one boolean or a `{ stdout, stderr }` pair, or `createJsonPrinter({ stdout, stderr })` to reuse the
built-in JSON-lines behavior. The pretty renderer has no public theme API; replacing the fixed
presentation requires a custom `Printer`. `resolveOutputMode(...)` exposes the selection contract
for wrappers and presentation or prompting layers.

### Standalone parsing and help

For parsing and usage rendering without execution, use the composition APIs. `parseArgs`
parses exactly the supplied command definition and argument segment, returns its schema output only,
and throws `HackshValidationError` on failure. It remains asynchronous to support async Zod
refinements and transformations. It does not route subcommands, act on help or version tokens, or
bypass validation; callers that resolve commands themselves must pass the selected command and
its segment. `renderUsage` returns a string synchronously with no output side effects. `showUsage`
requires an explicit `printer`, sends the same text and structured help summary as a usage event,
and awaits the printer. Its optional `stream` defaults to `"stdout"`. `summarizeUsage(command)`
returns the same canonical help metadata carried by a usage event.

```ts
import { parseArgs, renderUsage, showUsage } from "hacksh";
import { createPrettyPrinter } from "hacksh/printer";

const args = await parseArgs(main, ["42", "--repo", "owner/repo"]);
// args is inferred from the schema as:
// { positionals: [string]; repo?: string }

const text: string = renderUsage(main); // does not write output
await showUsage(main, {
  printer: createPrettyPrinter({ color: false, unicode: true }),
  stream: "stderr",
});
```

### Errors

- `HackshError` — base class for expected CLI failures. Extend it for application-specific errors;
  all error classes below inherit from it.
- `HackshUsageError` — routing and usage failures (such as an unknown subcommand).
- `HackshValidationError` — argument and option validation failures, whose `issues` identify CLI
  names such as `--repo` or `<PR>` and rejected unknown tokens in `issues[].arg`.
- `HackshPromptError` — interactive prompt failures, with structured `reason` and `prompt` fields.
- `HackshExecError` — external command failures when `reject` is not `false`, with the full failure
  in `error.result`.
- `HackshExitError` — thrown by a command handler to exit with a specific status code (`0`–`255`)
  and optional message.

## Development

| Command                | Description                                           |
| ---------------------- | ----------------------------------------------------- |
| `vp check`             | Format, lint, and type check                          |
| `vp test`              | Run tests                                             |
| `pnpm test:prompt-pty` | Probe prompts in a real terminal                      |
| `vp pack`              | Build `src/index.ts` into `dist`                      |
| `vp run ready`         | Run check, test, and build                            |
| `pnpm test:packed`     | Test the tarball with Node 22.18, host Node, and Deno |

The packed-consumer test must execute its Node consumer with exactly Node 22.18.0. Run pnpm itself
under that version, or supply an absolute executable path explicitly:

```sh
HACKSH_MINIMUM_NODE=/absolute/path/to/node-v22.18.0 pnpm test:packed
```

## Name and acknowledgments

The name comes from 拍手 (_hakushu_), the Japanese word for "clap", as a nod to
[clap](https://github.com/clap-rs/clap), the command-line argument parser for Rust. It is spelled
with _hack_ and _sh_, as in shell.

hacksh draws heavily on [Citty](https://github.com/unjs/citty) for its command API design and
[Clack](https://github.com/bombshell-dev/clack) for its interactive prompts and terminal output.
Many thanks to both projects and their contributors. hacksh uses Zod schemas for argument validation
and type inference, including tuples for positional arguments; it does not guarantee API or behavior
compatibility with Citty or Clack.
