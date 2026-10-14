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

`runMain(command)` reads `process.argv`, prints validation or usage errors, and exits with status 1.
Pass `onError` to replace its error reporting:

```ts
await runMain(main, {
  async onError(error) {
    console.error(`gh-pr-commits: ${error instanceof Error ? error.message : String(error)}`);
  },
});
```

Usage failures are `ZittyUsageError` instances. Argument failures are
`ZittyValidationError` instances whose `issues` identify CLI names such as `--repo` or `<PR>`.

## Development

| Command        | Description                      |
| -------------- | -------------------------------- |
| `vp check`     | Format, lint, and type check     |
| `vp test`      | Run tests                        |
| `vp pack`      | Build `src/index.ts` into `dist` |
| `vp run ready` | Run check, test, and build       |
