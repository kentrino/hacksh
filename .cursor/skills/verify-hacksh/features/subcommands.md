# Subcommands

A root command routes the first non-option token to a subcommand. The selected subcommand's `run` executes instead of the parent's, `<sub> --help` shows that subcommand's help, hidden subcommands are callable but absent from listings, and an unknown name prints an error with the parent usage and exits 1.

## Sub-features

- `sub-route` runs the named subcommand.
- `sub-help` lists visible commands under `COMMANDS` in the root help; `<sub> --help` shows the subcommand's own help.
- `sub-hidden` omits hidden commands from root help and unknown-command usage, while `demo internal` still runs.
- `sub-unknown` reports ``Unknown command `<name>` `` with the root usage.
- `sub-category` prefixes logger categories with the root and subcommand names.

## How to get to it (user POV)

- Run `demo deploy ...`, `demo levels`, `demo internal`.
- Run `demo --help` and `demo deploy --help`.
- Run `demo nope`.

## Driving it with drive.mjs

Preconditions:

- Baseline from the index. The template has visible `deploy`, `levels`, `ask`, `explode`, and hidden `internal` (prints `INTERNAL`).

- **Root help.** Run `D --label help --env NO_COLOR=1 --expect-code 0 -- CLI --help`. stdout contains `USAGE demo [OPTIONS] <COMMAND>` and the four visible commands with descriptions; it does not contain `internal` or `Hidden command`.
- **Hidden runs.** Run `D --label hidden --expect-code 0 -- CLI internal`. stdout is `INTERNAL`.
- **Unknown command.** Run `D --label unknown-cmd --env NO_COLOR=1 --expect-code 1 -- CLI nope`. stdout is empty; stderr starts with ``■  Unknown command `nope` `` and the root usage, still without `internal`.
- **Category.** Run the `deploy` drive from [Arguments and help](./arguments-and-help.md). Log lines show `[demo:deploy]` and `[demo:deploy:upload]`.

## Gotchas

- Parent options must precede the subcommand name; options after it belong to the subcommand.
- `internal --help` must still print the hidden command's help. Check it explicitly when changing hidden-command logic.
