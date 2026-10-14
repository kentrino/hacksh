import type { ArgsSchema } from "./schema.ts";
import type { AnyCommandDef, CommandDef } from "./command.ts";
import { ZittyUsageError } from "./errors.ts";
import { optionDefinitions, parseCommandArgs } from "./parser.ts";
import { renderUsage } from "./usage.ts";

interface ResolvedCommand {
  command: AnyCommandDef;
  rawArgs: string[];
  parents: Array<{ command: AnyCommandDef; rawArgs: string[] }>;
  segments: Array<{ command: AnyCommandDef; rawArgs: string[] }>;
}

function aliases(command: AnyCommandDef): Set<string> {
  const result = new Set<string>();
  for (const value of Object.values(command.alias ?? {})) {
    if (!value) continue;
    for (const alias of typeof value === "string" ? [value] : value) result.add(alias);
  }
  return result;
}

function builtin(
  command: AnyCommandDef,
  args: readonly string[],
  long: string,
  short: string,
): boolean {
  const shortAvailable = !aliases(command).has(short);
  return args.includes(`--${long}`) || (shortAvailable && args.includes(`-${short}`));
}

function commandToken(command: AnyCommandDef, rawArgs: readonly string[]): number | undefined {
  const options = optionDefinitions(command);
  for (let index = 0; index < rawArgs.length; index += 1) {
    const raw = rawArgs[index]!;
    if (raw === "--") return undefined;
    if (!raw.startsWith("-") || raw === "-") return index;

    const equals = raw.indexOf("=");
    const name = raw.startsWith("--")
      ? raw.slice(2, equals === -1 ? undefined : equals)
      : raw.slice(1, 2);
    const option = options.get(name);
    const hasInlineShortValue = raw.startsWith("-") && !raw.startsWith("--") && raw.length > 2;
    if (option?.takesValue && equals === -1 && !hasInlineShortValue) index += 1;
  }
  return undefined;
}

function namedChild(child: AnyCommandDef, name: string): AnyCommandDef {
  return child.name ? child : { ...child, name };
}

function resolveCommand(root: AnyCommandDef, rawArgs: string[]): ResolvedCommand {
  let command = root;
  let remaining = rawArgs;
  const parents: ResolvedCommand["parents"] = [];
  const segments: ResolvedCommand["segments"] = [];

  for (;;) {
    const index = command.subCommands ? commandToken(command, remaining) : undefined;
    if (index === undefined) {
      segments.push({ command, rawArgs: remaining });
      return { command, rawArgs: remaining, parents, segments };
    }
    const name = remaining[index]!;
    const child = command.subCommands?.[name];
    if (!child) throw new ZittyUsageError(`Unknown command \`${name}\``, command);
    const prefix = remaining.slice(0, index);
    parents.push({ command, rawArgs: prefix });
    segments.push({ command, rawArgs: prefix });
    command = namedChild(child, name);
    remaining = remaining.slice(index + 1);
  }
}

export async function runCommand<S extends ArgsSchema>(
  root: CommandDef<S>,
  argv: string[],
): Promise<unknown> {
  const resolved = resolveCommand(root, argv);
  const rootArgs = resolved.segments[0]?.rawArgs ?? argv;
  if (builtin(root, rootArgs, "version", "v")) {
    console.log(root.version ?? "");
    return undefined;
  }
  if (resolved.segments.some(({ command, rawArgs }) => builtin(command, rawArgs, "help", "h"))) {
    console.log(renderUsage(resolved.command));
    return undefined;
  }

  for (const parent of resolved.parents) await parseCommandArgs(parent.command, parent.rawArgs);
  const parsed = await parseCommandArgs(resolved.command, resolved.rawArgs);
  if (!resolved.command.run) {
    throw new ZittyUsageError("No command specified", resolved.command);
  }
  return resolved.command.run({ ...parsed, rawArgs: resolved.rawArgs });
}

export interface RunMainOptions {
  onError?: (error: unknown) => void | Promise<void>;
}

export async function runMain<S extends ArgsSchema>(
  command: CommandDef<S>,
  options: RunMainOptions = {},
): Promise<void> {
  try {
    await runCommand(command, process.argv.slice(2));
  } catch (error) {
    if (options.onError) await options.onError(error);
    else if (error instanceof ZittyUsageError) {
      console.error(error.message);
      console.error(renderUsage(error.command));
    } else {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
    process.exit(1);
  }
}
