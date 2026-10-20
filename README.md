# hacksh

Define a type-safe command-line interface with a Zod 4 object schema. The same schema parses and
validates arguments, infers the value passed to `run`, and generates help.

The name comes from 拍手 (_hakushu_), the Japanese word for "clap", as a nod to
[clap](https://github.com/clap-rs/clap), the command-line argument parser for Rust. It is spelled
with _hack_ and _sh_, as in shell.

hacksh draws heavily on [Citty](https://github.com/unjs/citty) for its command API design and
[Clack](https://github.com/bombshell-dev/clack) for its interactive prompts and terminal output.
Many thanks to both projects and their contributors. hacksh uses Zod schemas for argument validation
and type inference, including tuples for positional arguments; it does not guarantee API or behavior
compatibility with Citty or Clack.

## Install

```sh
pnpm add hacksh zod
```

hacksh is an ESM package and supports Node.js 22.18 or newer. Zod is a peer dependency, so an
application controls the Zod 4 version it uses. The public schema types and schema inspection use
the shared `zod/v4/core` API and accept schemas created with either `zod` or `zod/mini`.

## Define and run a command

```ts
import { z } from "zod";
import { defineCommand, runMain } from "hacksh";

const main = defineCommand({
  name: "gh-pr-commits",
  version: "0.1.0",
  description: "List commits in a GitHub pull request",
  args: z.object({
    _: z.tuple([
      z.coerce.number().int().optional().describe("Pull request number").meta({ title: "PR" }),
    ]),
    repo: z.string().optional().describe("Repository in OWNER/REPO format"),
    verbose: z.boolean().default(false).describe("Show details"),
  }),
  argOptions: { repo: { alias: "R" }, verbose: { alias: ["v", "V"] } },
  async run({ args, rawArgs, extraArgs, passthrough, logger }) {
    // args is { _: [number?]; repo?: string; verbose: boolean }
    logger.info("Loading commits for {repo}", { repo: args.repo ?? "the current repository" });
    logger.debug("Invocation arguments", { rawArgs, extraArgs, passthrough });
  },
});

await runMain(main);
```

```sh
gh-pr-commits 42 -R owner/repo --verbose
gh-pr-commits --help
gh-pr-commits --version
```

`--version` is a root-only builtin. It prints the root command's `version`. When the root has
none, `runMain` resolves the executable (`process.argv[1]`) through symlinks and prints the
`version` of the nearest ancestor `package.json` that declares one, so a published CLI reports its
package version without repeating it in code. `runCommand` does not search the filesystem.

Boolean fields are flags and other fields take a value. Both a schema key and its kebab-case form
are accepted (`--dryRun` and `--dry-run`). Every boolean flag also accepts a `--no-` prefixed form
that sets it to `false`, such as `--no-verbose`, which is how a default-on flag is disabled.
Boolean flags also accept the explicit forms `--verbose=true` and
`--verbose=false`; other inline values and values on a negated flag (such as
`--no-verbose=false`) are validation errors. Value options accept `--repo owner/repo` and
`--repo=owner/repo`; values such as `false` remain strings for non-boolean fields.

## Positional arguments

Declare positional arguments as a `z.tuple` in the `_` field. Tuple items are assigned in order,
and the tuple rest collects all remaining values. Optional or defaulted items must come after
required ones, and items cannot be booleans or arrays. The `_` field is never a named option.

```ts
const copy = defineCommand({
  name: "copy",
  args: z.object({
    _: z.tuple(
      [z.string().describe("Output directory").meta({ title: "DESTINATION" })],
      z.string().describe("Input files").meta({ title: "FILES" }),
    ),
  }),
  run({ args }) {
    const [destination, ...files] = args._; // [string, ...string[]]
  },
});
```

```sh
copy out a.txt b.txt   # { _: ["out", "a.txt", "b.txt"] }
```

Help and validation errors label each item with its `.meta({ title })`, such as `<DESTINATION>` and
`[FILES...]`. Untitled items are labeled by position (`ARG1`, `ARG2`, ...) and an untitled rest is
labeled `ARGS`. Use `z.array` instead of a tuple to accept only variadic values. Without a rest,
additional positional arguments are kept in `extraArgs`. Unknown options are also kept in
`extraArgs`; arguments after `--` are kept in `passthrough`.

## Argument options

Use `argOptions` to set short aliases and help labels for each named option without changing
schema keys, parsed output, or validation error paths. `z.enum` choices and schema descriptions
appear in generated help, including enums inside the supported schema wrappers and tuple items.

```ts
const convert = defineCommand({
  name: "convert",
  args: z.object({
    _: z.tuple(
      [z.enum(["small", "large"]).describe("Item size").meta({ title: "SIZE" })],
      z.string().describe("Input files").meta({ title: "INPUT" }),
    ),
    format: z.enum(["json", "yaml"]).optional().describe("Output format"),
    overwrite: z.boolean().default(true).describe("Replace existing files"),
    verbose: z.boolean().default(false).describe("Show details"),
  }),
  argOptions: {
    format: { alias: "f", valueName: "FORMAT" },
    verbose: { alias: ["v", "V"] },
  },
});
```

```sh
convert large -f yaml -v a.txt b.txt
# { _: ["large", "a.txt", "b.txt"], format: "yaml", overwrite: true, verbose: true }
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

- `alias` gives a named option one or more single-character short forms.
- `valueName` sets the value label of a named option.

Boolean flags are shown as `--[no-]name` because they also accept the `--no-` form. The
`negatable` field of `UsageOptionSummary` carries the same information for machine-readable
help, where `flags` keeps the literal `--name` spelling.

`argOptions` keys are checked against the argument schema. `defineCommand` throws a `TypeError`
when an alias is longer than one character or is used by more than one option, and when
`argOptions` has a `_` key. Without an alias of the same letter, `-h` and `-v` are shorthands
for `--help` and `--version`. Defining an `h` or `v` alias replaces the shorthand, so `convert -v`
above sets `verbose`; `--help` and `--version` remain available. A `help` option throws a
`TypeError` from `defineCommand`. A `version` option on the root command throws a `TypeError` when
`runMain` or `runCommand` starts; subcommands may define one. Output selection does not reserve
any additional command-line flags, so names such as `--json`, `--output`, and `--log-format` remain
available to application schemas.

### Environment variables

Every named option of a command tree whose root has a `name` can also be set from an environment
variable. The name joins the root name, the subcommand keys on the route, and the option key in
upper snake case.

```ts
const deploy = defineCommand({
  args: z.object({ target: z.string(), dryRun: z.boolean().default(false), token: z.string() }),
  argOptions: { token: { env: "GITHUB_TOKEN" } },
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
- `runCommand`, `runMain`, and `createMain` read the `env` option, defaulting to `process.env`.
  `parseArgs(command, argv, { env })` reads the environment only when `env` is given.
- Two options that resolve to the same name on one route, such as a root `deployTarget` and a
  `deploy` subcommand's `target`, make the invocation throw a `TypeError`.

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

## Structured logging

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

## Interactive input

The logger also owns the invocation's interactive input. Use `select`, `confirm`, and `text` from
the same logger (including loggers returned by `with` and `getChild`) so prompts use the selected
printer and output mode.

```ts
const deploy = defineCommand({
  name: "deploy",
  async run({ logger }) {
    const environment = await logger.select({
      message: "Environment",
      options: [
        { value: "staging", hint: "safe default" },
        { value: "production", label: "Production" },
      ] as const,
      initialValue: "staging",
    }); // "staging" | "production"
    const confirmed = await logger.confirm({ message: `Deploy to ${environment}?` });
    if (!confirmed) return;
    const release = await logger.text({
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
`kind`, `message`, and select `choices`. Reasons distinguish `non-interactive`, `cancelled`, `eof`,
`overlapping`, `invalid-options`, `input-error`, and `printer-error`. Ctrl-C and Escape cancel;
`runMain` reports cancellation and exits with status 130. Only one prompt may be active in an
invocation. Input listeners and raw terminal mode are restored after every outcome.
Failed prompts emit a non-visible `closed` prompt state through the same printer before rejecting,
so callers that catch cancellation, EOF, input, or printer errors do not leave stale terminal UI.

Active pretty prompts redraw in place rather than appending a block for every key. A completed
prompt collapses to one result line. If a logger event arrives while a prompt is active, the
printer removes the prompt, renders the event, and then redraws the current prompt state.
Physical rows are calculated from explicit newlines, ANSI-free Unicode display width, and
`stdout.columns`, including terminal wrapping. When a custom output writer does not expose a
positive `columns` value, the renderer conservatively counts explicit lines only.

## External commands

Every `run` context has an `exec` function that starts an executable with an argument array. It
never uses a shell, so spaces, quotes, `$`, `;`, `|`, and `*` in arguments reach the child
unchanged. By default it resolves with the captured output and rejects with `HackshExecError`
when the command fails. Pass `reject: false` to receive failures as results instead.

```ts
const sync = defineCommand({
  name: "sync",
  async run({ exec, logger }) {
    const { stdout: branch } = await exec("git", ["branch", "--show-current"]);
    const upstream = await exec("git", ["rev-parse", "--abbrev-ref", "@{upstream}"], {
      reject: false,
    });
    if (upstream.status === "failed") {
      logger.warn("{branch} has no upstream", { branch });
      return;
    }
    await exec("git", ["pull", "--ff-only"], { cwd: "/path/to/repo", timeout: 60_000 });
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

Options are `cwd`, `env`, `input`, `reject`, `timeout` (milliseconds), `signal` (an
`AbortSignal`), `maxBuffer` (bytes per stream, default 100,000,000), and `forceKillAfterDelay`
(milliseconds, default 5,000). `input` is written to stdin and closed; otherwise stdin is empty.
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

## Output formats

`runMain` and `runCommand` resolve one output mode before command routing, parsing, or execution.
Their `output` option accepts `"auto"` (the default), `"pretty"`, or `"json"`. A valid
`HACKSH_OUTPUT` environment value takes precedence over that option. `auto` selects JSON only when
`CI` has a non-empty value; redirecting or piping stdout alone retains pretty output. Invalid
explicit option or environment values never execute the command. `runCommand` rejects with a
`TypeError`. `runMain` gives that error to `onError` when configured; otherwise it emits the error
through a supplied printer or as a dedicated JSON error line, drains output, and exits with status
code `1`. Output values are case-sensitive.

```ts
await runMain(main, { output: "auto" });
// HACKSH_OUTPUT=json my-cli --help overrides the configured preference.
```

The resolved `OutputMode` has `format`, `interactive`, and `color` fields. Interaction is enabled
only for pretty output outside CI when both stdin and stdout are TTYs. Color is enabled only for
pretty output to a stdout TTY when `NO_COLOR` is empty or absent. These decisions are independent: an
explicit pretty format in CI can use color, but remains noninteractive. `env`, `stdin`, `stdout`,
and `stderr` can be supplied in execution options for embedded or tested invocations.
Custom `stdin` values implement the readable-stream operations `on`, `removeListener`, `resume`,
and `pause`; `isTTY`, `isRaw`, `readableFlowing`, and `setRawMode` describe optional terminal
capabilities. A stream without those readable operations fails with an `input-error` if prompting
is attempted.

JSON output contains exactly one `PrintEvent` object per line. Help and version events and
trace/debug/info logs go to stdout; errors, warning/error/fatal logs, and `exec` events go to
stderr. Usage attached
to an error retains its `stderr` stream. Every log level is emitted by default. JSON strings have
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
ASCII marks and bars. Color is still resolved from the selected output mode: it requires pretty
output and a stdout TTY, and any non-empty `NO_COLOR` disables it. Unicode selection does not affect
JSON output. An invocation does not add automatic start or end messages; the renderer presents only
the semantic events that the command emits.

## Programmatic execution and errors

`runCommand(command, argv, options)` handles help and version output without exiting, throws errors
to its caller, and returns the selected `run` handler's result. Pass a `printer` in `options` to
receive all output produced by that invocation as structured events:

```ts
import { runCommand, type PrintEvent, type Printer } from "hacksh";

const events: PrintEvent[] = [];
const printer: Printer = {
  async print(event) {
    events.push(event);
  },
};

await runCommand(main, ["--help"], { printer });
// events[0] is { type: "usage", usage, text, stream: "stdout" }
```

The current events are `usage`, `version`, `error`, `log`, and `prompt`. Usage events include the resolved
command's schema-free name, version, description, synopsis, arguments, options, and visible child
commands, plus rendered text and the intended `stdout` or `stderr` stream. Version events include
the version string. Error events contain a schema-free summary with an explicit `kind`, structured
validation issues, standard `Error` fields, custom enumerable properties, and recursively
canonical causes; log events contain the structured record described above. Prompt events contain
the prompt kind, status, current value or choices, placeholder, and validation message. Printer calls are serialized, may be asynchronous, and are
drained before `runCommand` or `runMain` completes or exits. A printer rejection rejects
`runCommand`.

Use `createPrettyPrinter({ color, unicode, stdout, stderr })` to reuse the built-in human-readable
renderer with custom writable targets, or `createJsonPrinter({ stdout, stderr })` to reuse the
built-in JSON-lines behavior. The pretty renderer has no public theme API; replacing the fixed
presentation requires a custom `Printer`. `consolePrinter` and `createStreamPrinter` remain the
undecorated compatibility adapters. `summarizeUsage(command)` returns the same canonical help
metadata carried by a usage event. `resolveOutputMode(...)` exposes the selection contract for
wrappers and the later presentation or prompting layers.

For parsing and usage rendering without execution, use the async composition APIs. `parseArgs`
parses exactly the supplied command definition and argument segment, returns its schema output only,
and throws `HackshValidationError` on failure. It does not route subcommands, act on help or version
tokens, or bypass validation; callers that resolve commands themselves must pass the selected
command and its segment. `renderUsage` has no output side effects; `showUsage` sends that same text
through an explicit printer or the same automatic pretty/JSON selection used by command
invocations. Its `output`, `env`, `stdin`, `stdout`, `stderr`, and `unicode` options configure that
automatic path. The existing synchronous or asynchronous `write` option remains supported and
takes precedence over printer selection; an explicit `printer` also retains its existing behavior.
These functions are async so future command-resolution features can be added without changing
their return types.

```ts
import { consolePrinter, parseArgs, renderUsage, showUsage } from "hacksh";

const args = await parseArgs(main, ["42", "--repo", "owner/repo"]);
// args is inferred from the schema as:
// { pr?: number; repo?: string; verbose: boolean }

const text: string = await renderUsage(main); // does not write output
await showUsage(main, {
  printer: consolePrinter,
  stream: "stderr",
});
```

The `run` context includes `cmd`, the actual resolved command definition. An unnamed subcommand is
represented by a completed copy whose `name` is its key; the original definition is not mutated.

`runMain(command)` reads `process.argv`, prints validation or usage errors, and exits with status 1.
Use `argv` to inject arguments, or `createMain` to make a reusable entry point. Invocation arguments
passed to the returned function take precedence over configured `argv`; omitting both falls back to
`process.argv.slice(2)`. Both functions return `Promise<void>`.

```ts
import { createMain } from "hacksh";

const mainEntry = createMain(main, { argv: ["--verbose"] });
await mainEntry(); // uses the configured argv
await mainEntry([]); // an explicit empty invocation overrides it
```

The legacy `RunMainOptions.showUsage` callback still customizes both ordinary help and the usage
appended to validation or routing errors. Its supplied `write` function targets stdout for help and
stderr for errors by emitting usage events through the invocation's selected printer, and the
callback may be async. Pass `onError` to replace the entire default error display, including usage;
output written by this application callback remains its own responsibility:

```ts
await runMain(main, {
  argv: ["--help"],
  async showUsage(command, { write }) {
    await write(await renderUsage(command));
  },
  async onError(error) {
    console.error(`gh-pr-commits: ${error instanceof Error ? error.message : String(error)}`);
  },
});
```

Usage failures are `HackshUsageError` instances. Argument failures are
`HackshValidationError` instances whose `issues` identify CLI names such as `--repo` or `<PR>`.
Prompt failures are `HackshPromptError` instances with structured `reason` and `prompt` fields.

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
