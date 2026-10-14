import type { ArgsSchema } from "./schema.ts";
import type { AnyCommandDef, CommandDef } from "./command.ts";
import { ZittyUsageError } from "./errors.ts";
import { parseCommandArgs, tokenizeCommandArgs } from "./parser.ts";
import { renderUsage } from "./usage.ts";

interface ResolvedCommand {
  command: AnyCommandDef;
  rawArgs: string[];
  parents: Array<{ command: AnyCommandDef; rawArgs: string[] }>;
  segments: Array<{ command: AnyCommandDef; rawArgs: string[] }>;
}

function commandToken(command: AnyCommandDef, rawArgs: readonly string[]): number | undefined {
  return tokenizeCommandArgs(command, rawArgs).tokens.find((token) => token.kind === "positional")
    ?.index;
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
  const tokenizedSegments = resolved.segments.map(({ command, rawArgs }) => ({
    command,
    tokenized: tokenizeCommandArgs(command, rawArgs),
  }));
  if (tokenizedSegments[0]?.tokenized.version) {
    console.log(root.version ?? "");
    return undefined;
  }
  if (tokenizedSegments.some(({ tokenized }) => tokenized.help)) {
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
