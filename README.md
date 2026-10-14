# zitty

Define a type-safe command-line interface with a Zod 4 object schema. The same schema parses and
validates arguments, infers the value passed to `run`, and generates help.

## Install

```sh
pnpm add zitty zod
```

zitty is an ESM package and supports Node.js 22.18 or newer. Zod is a peer dependency, so an
application controls the Zod 4 version it uses. The public schema types and schema inspection use
the shared `zod/v4/core` API and accept schemas created with either `zod` or `zod/mini`.

## Define and run a command

```ts
import { z } from "zod";
import { defineCommand, runMain } from "zitty";

const main = defineCommand({
  name: "gh-pr-commits",
  version: "0.1.0",
  description: "List commits in a GitHub pull request",
  args: z.object({
    pr: z.coerce.number().int().optional().describe("Pull request number"),
    repo: z.string().optional().describe("Repository in OWNER/REPO format"),
    verbose: z.boolean().default(false).describe("Show details"),
  }),
  positional: ["pr"],
  alias: { repo: "R", verbose: ["v", "V"] },
  async run({ args, rawArgs, extraArgs, passthrough }) {
    // args is { pr?: number; repo?: string; verbose: boolean }
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
`--no-verbose`. Value options accept `--repo owner/repo` and `--repo=owner/repo`.

Keys in `positional` are assigned in order. Optional or defaulted positional arguments must come
after required ones. Additional positional arguments and unknown options are kept in `extraArgs`;
arguments after `--` are kept in `passthrough`.

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
  },
  async run() {
    // Runs only when no subcommand is selected.
  },
});
```

Parent options precede the subcommand (`worktree --repo owner/repo new --name feature`). A selected
subcommand prevents the parent `run` handler from running. `worktree new --help` displays help for
`new`.

## Programmatic execution and errors

`runCommand(command, argv)` handles help and version output without exiting, throws errors to its
caller, and returns the selected `run` handler's result.

For parsing and usage rendering without execution, use the async composition APIs. `parseArgs`
parses exactly the supplied command definition and argument segment, returns its schema output only,
and throws `ZittyValidationError` on failure. It does not route subcommands, act on help or version
tokens, or bypass validation; callers that resolve commands themselves must pass the selected
command and its segment. `renderUsage` has no output side effects; `showUsage` sends that same text
to an optional synchronous or asynchronous writer (and otherwise uses `console.log`). These
functions are async so future command-resolution features can be added without changing their
return types.

```ts
import { parseArgs, renderUsage, showUsage } from "zitty";

const args = await parseArgs(main, ["42", "--repo", "owner/repo"]);
// args is inferred from the schema as:
// { pr?: number; repo?: string; verbose: boolean }

const text: string = await renderUsage(main); // does not write output
await showUsage(main, {
  async write(usage) {
    await Promise.resolve();
    console.info(usage);
  },
});
```

The `run` context includes `cmd`, the actual resolved command definition. An unnamed subcommand is
represented by a completed copy whose `name` is its key; the original definition is not mutated.

`runMain(command)` reads `process.argv`, prints validation or usage errors, and exits with status 1.
Use `argv` to inject arguments, or `createMain` to make a reusable entry point. Invocation arguments
passed to the returned function take precedence over configured `argv`; omitting both falls back to
`process.argv.slice(2)`. Both functions return `Promise<void>`.

```ts
import { createMain } from "zitty";

const mainEntry = createMain(main, { argv: ["--verbose"] });
await mainEntry(); // uses the configured argv
await mainEntry([]); // an explicit empty invocation overrides it
```

`showUsage` customizes both ordinary help and the usage appended to validation or routing errors.
The supplied `write` function targets stdout for help and stderr for errors. The callback may be
async. Pass `onError` to replace the entire default error display, including usage:

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
