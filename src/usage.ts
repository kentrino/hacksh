import type { AnyCommandDef } from "./command.ts";
import { summarizeErrors } from "./errors.ts";
import { aliasList, kebabCase } from "./options.ts";
import { selectOutputPrinter, type OutputOptions } from "./output.ts";
import type { Printer, PrintStream } from "./printer.ts";
import { POSITIONALS_KEY, readArgInfo, readPositionals, schemaShape } from "./schema.ts";

function details(
  description: string | undefined,
  required: boolean,
  defaultValue: unknown,
  choices: readonly string[] | undefined,
): string {
  const parts = [description];
  if (choices) parts.push(`(Choices: ${choices.join(", ")})`);
  if (required) parts.push("(Required)");
  if (defaultValue !== undefined) parts.push(`(Default: ${formatDefault(defaultValue)})`);
  return parts.filter(Boolean).join(" ");
}

function formatDefault(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return value.toString();
  }
  if (value === null) return "null";
  try {
    return JSON.stringify(value) ?? "undefined";
  } catch {
    return "[Unserializable]";
  }
}

export interface UsageArgumentSummary {
  name: string;
  required: boolean;
  variadic: boolean;
  description?: string;
  choices?: readonly string[];
  defaultValue?: unknown;
}

export interface UsageOptionSummary {
  name: string;
  flags: readonly string[];
  takesValue: boolean;
  valueName?: string;
  required: boolean;
  description?: string;
  choices?: readonly string[];
  defaultValue?: unknown;
  negatedDescription?: string;
}

export interface UsageCommandSummary {
  name: string;
  description?: string;
}

/** A schema-free description of the useful help metadata for a command. */
export interface UsageSummary {
  name: string;
  heading?: string;
  version?: string;
  description?: string;
  synopsis: string;
  arguments: readonly UsageArgumentSummary[];
  options: readonly UsageOptionSummary[];
  commands: readonly UsageCommandSummary[];
}

function heading(command: AnyCommandDef): string | undefined {
  const identity = command.name
    ? `${command.name}${command.version ? ` v${command.version}` : ""}`
    : command.version
      ? `v${command.version}`
      : undefined;
  if (command.description && identity) return `${command.description} (${identity})`;
  return command.description ?? identity;
}

/** Build a serializable help summary without retaining command or schema objects. */
export function summarizeUsage(command: AnyCommandDef): UsageSummary {
  const shape = command.args ? schemaShape(command.args) : {};
  const positionals = readPositionals(shape);
  const positionalItems = positionals?.items ?? [];
  const syntax = positionalItems.map(({ schema, label }) =>
    readArgInfo(schema).required ? `<${label}>` : `[${label}]`,
  );
  if (positionals?.rest) syntax.push(`[${positionals.rest.label}...]`);
  if (command.subCommands && Object.keys(command.subCommands).length > 0) syntax.push("<COMMAND>");

  const args: UsageArgumentSummary[] = positionalItems.map(({ schema, label }) => {
    const info = readArgInfo(schema);
    return {
      name: label,
      required: info.required,
      variadic: false,
      ...(info.description === undefined ? {} : { description: info.description }),
      ...(info.choices === undefined ? {} : { choices: info.choices }),
      ...(info.defaultValue === undefined
        ? {}
        : { defaultValue: summarizeErrors(info.defaultValue) }),
    };
  });
  if (positionals?.rest) {
    const info = readArgInfo(positionals.rest.schema);
    args.push({
      name: positionals.rest.label,
      required: false,
      variadic: true,
      ...(info.description === undefined ? {} : { description: info.description }),
      ...(info.choices === undefined ? {} : { choices: info.choices }),
    });
  }

  const options = Object.entries(shape)
    .filter(([key]) => key !== POSITIONALS_KEY)
    .map(([key, schema]): UsageOptionSummary => {
      const info = readArgInfo(schema);
      const argOptions = command.argOptions?.[key];
      const aliases = argOptions?.alias
        ? aliasList(argOptions.alias).map((item) => `-${item}`)
        : [];
      const name = kebabCase(key);
      const valueName = argOptions?.valueName ?? name;
      return {
        name,
        flags: [...aliases, `--${name}`],
        takesValue: info.takesValue,
        required: info.required,
        ...(info.takesValue ? { valueName } : {}),
        ...(info.description === undefined ? {} : { description: info.description }),
        ...(info.choices === undefined ? {} : { choices: info.choices }),
        ...(info.defaultValue === undefined
          ? {}
          : { defaultValue: summarizeErrors(info.defaultValue) }),
        ...(argOptions?.negatedDescription === undefined
          ? {}
          : { negatedDescription: argOptions.negatedDescription }),
      };
    });

  const commands = Object.entries(command.subCommands ?? {})
    .filter(([, child]) => !child.hidden)
    .map(([name, child]) => ({
      name,
      ...(child.description === undefined ? {} : { description: child.description }),
    }));
  const name = command.name ?? "command";
  const title = heading(command);
  return {
    name,
    ...(title === undefined ? {} : { heading: title }),
    ...(command.version === undefined ? {} : { version: command.version }),
    ...(command.description === undefined ? {} : { description: command.description }),
    synopsis: `${name} [OPTIONS]${syntax.length ? ` ${syntax.join(" ")}` : ""}`,
    arguments: args,
    options,
    commands,
  };
}

function formatUsage(summary: UsageSummary): string {
  const lines: string[] = [];
  if (summary.heading) lines.push(summary.heading, "");
  lines.push(`USAGE ${summary.synopsis}`);

  if (summary.arguments.length > 0) {
    lines.push("", "ARGUMENTS", "");
    for (const argument of summary.arguments) {
      lines.push(
        `  ${argument.name}${argument.variadic ? "..." : ""}  ${details(argument.description, argument.required, argument.defaultValue, argument.choices)}`.trimEnd(),
      );
    }
  }

  if (summary.options.length > 0) {
    lines.push("", "OPTIONS", "");
    for (const option of summary.options) {
      const flags = option.flags.map((flag) =>
        flag.startsWith("--") && option.takesValue ? `${flag}=<${option.valueName}>` : flag,
      );
      lines.push(
        `  ${flags.join(", ")}  ${details(option.description, option.required, option.defaultValue, option.choices)}`.trimEnd(),
      );
      if (!option.takesValue && option.negatedDescription) {
        lines.push(`  --no-${option.name}  ${option.negatedDescription}`);
      }
    }
  }

  if (summary.commands.length > 0) {
    lines.push("", "COMMANDS", "");
    for (const command of summary.commands) {
      lines.push(`  ${command.name}  ${command.description ?? ""}`.trimEnd());
    }
  }
  return lines.join("\n");
}

export type UsageWriter = (text: string) => void | Promise<void>;

export interface ShowUsageOptions extends OutputOptions {
  write?: UsageWriter;
  printer?: Printer;
  stream?: PrintStream;
}

export type UsageOutput = Required<Pick<ShowUsageOptions, "write">>;

export type ShowUsageCallback = (
  command: AnyCommandDef,
  output: UsageOutput,
) => void | Promise<void>;

/** Generate usage text without writing to stdout or stderr. */
export async function renderUsage(command: AnyCommandDef): Promise<string> {
  return formatUsage(summarizeUsage(command));
}

/** Generate and write usage text, awaiting asynchronous writers. */
export async function showUsage(
  command: AnyCommandDef,
  options: ShowUsageOptions = {},
): Promise<void> {
  const usage = summarizeUsage(command);
  const text = formatUsage(usage);
  if (options.write) return options.write(text);
  const printer = options.printer ?? selectOutputPrinter(options);
  return printer.print({
    type: "usage",
    usage,
    text,
    stream: options.stream ?? "stdout",
  });
}
