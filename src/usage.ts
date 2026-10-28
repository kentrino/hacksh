import type { AnyCommandDef } from "./command.ts";
import { commandEnvPath, optionEnvNames } from "./environment.ts";
import { summarizeErrors } from "./errors.ts";
import { aliasList, kebabCase } from "./options.ts";
import type { Printer, PrintStream } from "./printer.ts";
import { POSITIONALS_KEY, readArgInfo, readPositionals, schemaShape } from "./schema.ts";

function details(
  description: string | undefined,
  required: boolean,
  defaultValue: unknown,
  choices: readonly string[] | undefined,
  envName?: string,
): string {
  const parts = [description];
  if (choices) parts.push(`(Choices: ${choices.join(", ")})`);
  if (required) parts.push("(Required)");
  if (defaultValue !== undefined) parts.push(`(Default: ${formatDefault(defaultValue)})`);
  if (envName !== undefined) parts.push(`(Env: ${envName})`);
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
  /** Whether the long flag also accepts a `--no-` prefixed form. */
  negatable: boolean;
  valueName?: string;
  required: boolean;
  description?: string;
  choices?: readonly string[];
  defaultValue?: unknown;
  env?: string;
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

  const envNames = optionEnvNames(command, commandEnvPath(command));
  const options = Object.entries(shape)
    .filter(([key]) => key !== POSITIONALS_KEY)
    .map(([key, schema]): UsageOptionSummary => {
      const info = readArgInfo(schema);
      const aliases =
        info.alias === undefined ? [] : aliasList(info.alias).map((item) => `-${item}`);
      const name = kebabCase(key);
      const valueName = info.valueName ?? name;
      const envName = envNames.get(key);
      return {
        name,
        flags: [...aliases, `--${name}`],
        takesValue: info.takesValue,
        negatable: !info.takesValue,
        required: info.required,
        ...(info.takesValue ? { valueName } : {}),
        ...(info.description === undefined ? {} : { description: info.description }),
        ...(info.choices === undefined ? {} : { choices: info.choices }),
        ...(info.defaultValue === undefined
          ? {}
          : { defaultValue: summarizeErrors(info.defaultValue) }),
        ...(envName === undefined ? {} : { env: envName }),
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
      const flags = option.flags.map((flag) => {
        if (!flag.startsWith("--")) return flag;
        if (option.takesValue) return `${flag}=<${option.valueName}>`;
        if (option.negatable) return `--[no-]${flag.slice(2)}`;
        return flag;
      });
      lines.push(
        `  ${flags.join(", ")}  ${details(option.description, option.required, option.defaultValue, option.choices, option.env)}`.trimEnd(),
      );
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

export interface ShowUsageOptions {
  printer: Printer;
  stream?: PrintStream;
}

/** Generate usage text without writing to stdout or stderr. */
export function renderUsage(command: AnyCommandDef): string {
  return formatUsage(summarizeUsage(command));
}

/** Generate a usage event and await its printer. */
export async function showUsage(command: AnyCommandDef, options: ShowUsageOptions): Promise<void> {
  const usage = summarizeUsage(command);
  const text = formatUsage(usage);
  return options.printer.print({
    type: "usage",
    usage,
    text,
    stream: options.stream ?? "stdout",
  });
}
