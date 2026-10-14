import type { AnyCommandDef } from "./command.ts";
import { aliasList, kebabCase } from "./options.ts";
import { readArgInfo, schemaShape } from "./schema.ts";

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

function heading(command: AnyCommandDef): string | undefined {
  const identity = command.name
    ? `${command.name}${command.version ? ` v${command.version}` : ""}`
    : command.version
      ? `v${command.version}`
      : undefined;
  if (command.description && identity) return `${command.description} (${identity})`;
  return command.description ?? identity;
}

function formatUsage(command: AnyCommandDef): string {
  const lines: string[] = [];
  const title = heading(command);
  if (title) lines.push(title, "");

  const shape = command.args ? schemaShape(command.args) : {};
  const positional = command.positional ?? [];
  const positionalSet = new Set<string>(positional);
  if (command.variadic) positionalSet.add(command.variadic);
  const syntax = positional.map((key) => {
    const info = readArgInfo(shape[key]!);
    const name = command.argDisplay?.[key]?.name ?? key.toUpperCase();
    return info.required ? `<${name}>` : `[${name}]`;
  });
  if (command.variadic) {
    const name = command.argDisplay?.[command.variadic]?.name ?? command.variadic.toUpperCase();
    syntax.push(`[${name}...]`);
  }
  if (command.subCommands && Object.keys(command.subCommands).length > 0) syntax.push("<COMMAND>");
  lines.push(
    `USAGE ${command.name ?? "command"} [OPTIONS]${syntax.length ? ` ${syntax.join(" ")}` : ""}`,
  );

  if (positional.length > 0 || command.variadic) {
    lines.push("", "ARGUMENTS", "");
    for (const key of positional) {
      const info = readArgInfo(shape[key]!);
      const name = command.argDisplay?.[key]?.name ?? key.toUpperCase();
      lines.push(
        `  ${name}  ${details(info.description, info.required, info.defaultValue, info.choices)}`.trimEnd(),
      );
    }
    if (command.variadic) {
      const info = readArgInfo(shape[command.variadic]!);
      const name = command.argDisplay?.[command.variadic]?.name ?? command.variadic.toUpperCase();
      lines.push(
        `  ${name}...  ${details(info.description, false, undefined, info.choices)}`.trimEnd(),
      );
    }
  }

  const options = Object.entries(shape).filter(([key]) => !positionalSet.has(key));
  if (options.length > 0) {
    lines.push("", "OPTIONS", "");
    for (const [key, schema] of options) {
      const info = readArgInfo(schema);
      const alias = command.alias?.[key];
      const prefix = alias
        ? `${aliasList(alias)
            .map((item) => `-${item}`)
            .join(", ")}, `
        : "";
      const display = command.argDisplay?.[key];
      const valueName = display?.valueName ?? kebabCase(key);
      const long = `--${kebabCase(key)}${info.takesValue ? `=<${valueName}>` : ""}`;
      lines.push(
        `  ${prefix}${long}  ${details(info.description, info.required, info.defaultValue, info.choices)}`.trimEnd(),
      );
      if (!info.takesValue && display?.negatedDescription) {
        lines.push(`  --no-${kebabCase(key)}  ${display.negatedDescription}`);
      }
    }
  }

  if (command.subCommands && Object.keys(command.subCommands).length > 0) {
    lines.push("", "COMMANDS", "");
    for (const [name, child] of Object.entries(command.subCommands)) {
      lines.push(`  ${name}  ${child.description ?? ""}`.trimEnd());
    }
  }
  return lines.join("\n");
}

export type UsageWriter = (text: string) => void | Promise<void>;

export interface ShowUsageOptions {
  write?: UsageWriter;
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
  return (options.write ?? console.log)(text);
}
