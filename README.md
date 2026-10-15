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
  async run({ args, rawArgs, extraArgs, passthrough }) {
    // args is { _: [number?]; repo?: string; verbose: boolean }
    console.log({ args, rawArgs, extraArgs, passthrough });
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
above sets `verbose`; `--help` and `--version` remain available. Help remains plain text when
`NO_COLOR` or `CI` is set.

## Subcommands

```ts
const main = defineCommand({
  name: "worktree",
  args: z.object({ repo: z.string() }),
  subCommands: {
    new: defineCommand({
      args: z.object({ name: z.string() }),
      async run({ args }) {
        console.log(args.name);
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
// events[0] is { type: "usage", command, text, stream: "stdout" }
```

The current events are `usage`, `version`, and `error`. Usage events include the resolved command,
rendered text, and their intended `stdout` or `stderr` stream. Version events include the version
string. Error events include both the original thrown value and its default display message.
Printer calls are serialized, may be asynchronous, and are drained before `runCommand` or
`runMain` completes or exits. A printer rejection rejects `runCommand`.

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
import { parseArgs, renderUsage, showUsage } from "hacksh";

const args = await parseArgs(main, ["42", "--repo", "owner/repo"]);
// args is inferred from the schema as:
// { pr?: number; repo?: string; verbose: boolean }

const text: string = await renderUsage(main); // does not write output
await showUsage(main, {
  printer,
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
