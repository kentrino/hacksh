import type { ArgsSchema } from "./schema.ts";
import type { AnyCommandDef, CommandDef } from "./command.ts";
import { ZittyUsageError } from "./errors.ts";
import {
  parseCommandArgs,
  tokenizedBefore,
  tokenizeCommandArgs,
  type TokenizedCommandArgs,
} from "./parser.ts";
import { showUsage, type ShowUsageCallback } from "./usage.ts";

interface CommandSegment {
  command: AnyCommandDef;
  rawArgs: string[];
  tokenized: TokenizedCommandArgs;
}

interface ResolvedCommand extends CommandSegment {
  parents: CommandSegment[];
  segments: CommandSegment[];
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
    const tokenized = tokenizeCommandArgs(command, remaining);
    const index = command.subCommands
      ? tokenized.tokens.find((token) => token.kind === "positional")?.index
      : undefined;
    if (index === undefined) {
      const segment = { command, rawArgs: remaining, tokenized };
      segments.push(segment);
      return { ...segment, parents, segments };
    }
    const name = remaining[index]!;
    const child = command.subCommands?.[name];
    if (!child) throw new ZittyUsageError(`Unknown command \`${name}\``, command);
    const prefix = remaining.slice(0, index);
    const segment = { command, rawArgs: prefix, tokenized: tokenizedBefore(tokenized, index) };
    parents.push(segment);
    segments.push(segment);
    command = namedChild(child, name);
    remaining = remaining.slice(index + 1);
  }
}

async function executeCommand<S extends ArgsSchema>(
  root: CommandDef<S>,
  argv: string[],
  displayUsage: ShowUsageCallback,
): Promise<unknown> {
  const resolved = resolveCommand(root, argv);
  if (resolved.segments[0]?.tokenized.version) {
    console.log(root.version ?? "");
    return undefined;
  }
  if (resolved.segments.some(({ tokenized }) => tokenized.help)) {
    await displayUsage(resolved.command, { write: (text) => console.log(text) });
    return undefined;
  }

  for (const parent of resolved.parents) {
    await parseCommandArgs(parent.command, parent.rawArgs, parent.tokenized);
  }
  const parsed = await parseCommandArgs(resolved.command, resolved.rawArgs, resolved.tokenized);
  if (!resolved.command.run) {
    throw new ZittyUsageError("No command specified", resolved.command);
  }
  return resolved.command.run({ ...parsed, cmd: resolved.command, rawArgs: resolved.rawArgs });
}

export async function runCommand<S extends ArgsSchema>(
  root: CommandDef<S>,
  argv: string[],
): Promise<unknown> {
  return executeCommand(root, argv, showUsage);
}

export interface RunMainOptions {
  onError?: (error: unknown) => void | Promise<void>;
  argv?: string[];
  showUsage?: ShowUsageCallback;
}

export async function runMain<S extends ArgsSchema>(
  command: CommandDef<S>,
  options: RunMainOptions = {},
): Promise<void> {
  const displayUsage = options.showUsage ?? showUsage;
  try {
    await executeCommand(command, options.argv ?? process.argv.slice(2), displayUsage);
  } catch (error) {
    if (options.onError) {
      await options.onError(error);
      process.exit(1);
    }
    try {
      if (error instanceof ZittyUsageError) {
        console.error(error.message);
        await displayUsage(error.command, { write: (text) => console.error(text) });
      } else {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    } finally {
      process.exit(1);
    }
  }
}

export function createMain<S extends ArgsSchema>(
  command: CommandDef<S>,
  options: RunMainOptions = {},
): (argv?: string[]) => Promise<void> {
  return (argv) => runMain(command, argv === undefined ? options : { ...options, argv });
}
