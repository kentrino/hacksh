import type { AnyCommandDef } from "./command.ts";
import { aliasList, kebabCase } from "./options.ts";
import { consolePrinter, type Printer, type PrintStream } from "./printer.ts";
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
  return JSON.stringify(value) ?? "undefined";
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
      ...(info.defaultValue === undefined ? {} : { defaultValue: info.defaultValue }),
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
        ...(info.defaultValue === undefined ? {} : { defaultValue: info.defaultValue }),
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
  return {
    name,
    ...(command.version === undefined ? {} : { version: command.version }),
    ...(command.description === undefined ? {} : { description: command.description }),
    synopsis: `${name} [OPTIONS]${syntax.length ? ` ${syntax.join(" ")}` : ""}`,
    arguments: args,
    options,
    commands,
  };
}

function formatUsage(command: AnyCommandDef): string {
  const lines: string[] = [];
  const title = heading(command);
  if (title) lines.push(title, "");

  const shape = command.args ? schemaShape(command.args) : {};
  const positionals = readPositionals(shape);
  const items = positionals?.items ?? [];
  const rest = positionals?.rest;
  const syntax = items.map(({ schema, label }) =>
    readArgInfo(schema).required ? `<${label}>` : `[${label}]`,
  );
  if (rest) syntax.push(`[${rest.label}...]`);
  if (command.subCommands && Object.keys(command.subCommands).length > 0) syntax.push("<COMMAND>");
  lines.push(
    `USAGE ${command.name ?? "command"} [OPTIONS]${syntax.length ? ` ${syntax.join(" ")}` : ""}`,
  );

  if (items.length > 0 || rest) {
    lines.push("", "ARGUMENTS", "");
    for (const { schema, label } of items) {
      const info = readArgInfo(schema);
      lines.push(
        `  ${label}  ${details(info.description, info.required, info.defaultValue, info.choices)}`.trimEnd(),
      );
    }
    if (rest) {
      const info = readArgInfo(rest.schema);
      lines.push(
        `  ${rest.label}...  ${details(info.description, false, undefined, info.choices)}`.trimEnd(),
      );
    }
  }

  const options = Object.entries(shape).filter(([key]) => key !== POSITIONALS_KEY);
  if (options.length > 0) {
    lines.push("", "OPTIONS", "");
    for (const [key, schema] of options) {
      const info = readArgInfo(schema);
      const argOptions = command.argOptions?.[key];
      const prefix = argOptions?.alias
        ? `${aliasList(argOptions.alias)
            .map((item) => `-${item}`)
            .join(", ")}, `
        : "";
      const valueName = argOptions?.valueName ?? kebabCase(key);
      const long = `--${kebabCase(key)}${info.takesValue ? `=<${valueName}>` : ""}`;
      lines.push(
        `  ${prefix}${long}  ${details(info.description, info.required, info.defaultValue, info.choices)}`.trimEnd(),
      );
      if (!info.takesValue && argOptions?.negatedDescription) {
        lines.push(`  --no-${kebabCase(key)}  ${argOptions.negatedDescription}`);
      }
    }
  }

  const visibleSubCommands = Object.entries(command.subCommands ?? {}).filter(
    ([, child]) => !child.hidden,
  );
  if (visibleSubCommands.length > 0) {
    lines.push("", "COMMANDS", "");
    for (const [name, child] of visibleSubCommands) {
      lines.push(`  ${name}  ${child.description ?? ""}`.trimEnd());
    }
  }
  return lines.join("\n");
}

export type UsageWriter = (text: string) => void | Promise<void>;

export interface ShowUsageOptions {
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
  return formatUsage(command);
}

/** Generate and write usage text, awaiting asynchronous writers. */
export async function showUsage(
  command: AnyCommandDef,
  options: ShowUsageOptions = {},
): Promise<void> {
  const text = await renderUsage(command);
  if (options.write) return options.write(text);
  return (options.printer ?? consolePrinter).print({
    type: "usage",
    usage: summarizeUsage(command),
    text,
    stream: options.stream ?? "stdout",
  });
}
