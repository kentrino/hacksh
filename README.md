# hacksh

Define a type-safe command-line interface with a Zod 4 object schema. The same schema parses and
validates arguments, infers the value passed to `run`, and generates help.

The name comes from 拍手 (_hakushu_), the Japanese word for "clap", as a nod to
[clap](https://github.com/clap-rs/clap), the command-line argument parser for Rust. It is spelled
with _hack_ and _sh_, as in shell.

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

Boolean fields are flags and other fields take a value. Both a schema key and its kebab-case form
are accepted (`--dryRun` and `--dry-run`). A default-on flag can be disabled with `--no-`, such as
`--no-verbose`. Boolean flags also accept the explicit forms `--verbose=true` and
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
    overwrite: { negatedDescription: "Keep existing files" },
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
  --overwrite  Replace existing files (Default: true)
  --no-overwrite  Keep existing files
  -v, -V, --verbose  Show details (Default: false)
```

- `alias` gives a named option one or more single-character short forms.
- `valueName` sets the value label of a named option.
- `negatedDescription` describes the `--no-` form of a boolean flag.

`argOptions` keys are checked against the argument schema. `defineCommand` throws a `TypeError`
when an alias is longer than one character or is used by more than one option, and when
`argOptions` has a `_` key. Without an alias of the same letter, `-h` and `-v` are shorthands
for `--help` and `--version`. Defining an `h` or `v` alias replaces the shorthand, so `convert -v`
above sets `verbose`; `--help` and `--version` remain available. Output selection does not reserve
any additional command-line flags, so names such as `--json`, `--output`, and `--log-format` remain
available to application schemas.

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

## Output formats

`runMain` and `runCommand` resolve one output mode before command routing, parsing, or execution.
Their `output` option accepts `"auto"` (the default), `"pretty"`, or `"json"`. A valid
`HACKSH_OUTPUT` environment value takes precedence over that option. `auto` selects JSON only when
`CI` has a non-empty value; redirecting or piping stdout alone retains pretty output. Invalid
explicit option or environment values never execute the command. `runCommand` rejects with a
`TypeError`. `runMain` gives that error to `onError` when configured; otherwise it emits the error
through a supplied printer or as a dedicated JSON error line, drains output, and exits with status

1. Output values are case-sensitive.

```ts
await runMain(main, { output: "auto" });
// HACKSH_OUTPUT=json my-cli --help overrides the configured preference.
```

The resolved `OutputMode` has `format`, `interactive`, and `color` fields. Interaction is enabled
only for pretty output outside CI when both stdin and stdout are TTYs. Color is enabled only for
pretty output to a stdout TTY when `NO_COLOR` is empty or absent. These decisions are independent: an
explicit pretty format in CI can use color, but remains noninteractive. `env`, `stdin`, `stdout`,
and `stderr` can be supplied in execution options for embedded or tested invocations.

JSON output contains exactly one `PrintEvent` object per line. Help and version events and
trace/debug/info logs go to stdout; errors and warning/error/fatal logs go to stderr. Usage attached
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

The current events are `usage`, `version`, `error`, and `log`. Usage events include the resolved
command's schema-free name, version, description, synopsis, arguments, options, and visible child
commands, plus rendered text and the intended `stdout` or `stderr` stream. Version events include
the version string. Error events contain a schema-free summary with an explicit `kind`, structured
validation issues, standard `Error` fields, custom enumerable properties, and recursively
canonical causes; log events contain the structured record described above. Printer calls are serialized, may be asynchronous, and are
drained before `runCommand` or `runMain` completes or exits. A printer rejection rejects
`runCommand`.

Use `createJsonPrinter({ stdout, stderr })` to reuse the built-in JSON-lines behavior with custom
writable targets. `summarizeUsage(command)` returns the same canonical help metadata carried by a
usage event. `resolveOutputMode(...)` exposes the selection contract for wrappers and the
later presentation or prompting layers.

For parsing and usage rendering without execution, use the async composition APIs. `parseArgs`
parses exactly the supplied command definition and argument segment, returns its schema output only,
and throws `ZittyValidationError` on failure. It does not route subcommands, act on help or version
tokens, or bypass validation; callers that resolve commands themselves must pass the selected
command and its segment. `renderUsage` has no output side effects; `showUsage` sends that same text
through an optional printer (and otherwise through the built-in `consolePrinter`). The existing
synchronous or asynchronous `write` option remains supported and takes precedence when both
adapters are passed. These functions are async so future command-resolution features can be added
without changing their return types.

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

Usage failures are `ZittyUsageError` instances. Argument failures are
`ZittyValidationError` instances whose `issues` identify CLI names such as `--repo` or `<PR>`.

## Development

| Command            | Description                               |
| ------------------ | ----------------------------------------- |
| `vp check`         | Format, lint, and type check              |
| `vp test`          | Run tests                                 |
| `vp pack`          | Build `src/index.ts` into `dist`          |
| `vp run ready`     | Run check, test, and build                |
| `pnpm test:packed` | Test the tarball with Node 22.18 and Deno |

The packed-consumer test must execute its Node consumer with exactly Node 22.18.0. Run pnpm itself
under that version, or supply an absolute executable path explicitly:

```sh
ZITTY_MINIMUM_NODE=/absolute/path/to/node-v22.18.0 pnpm test:packed
```
