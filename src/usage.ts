import type { AnyCommandDef } from "./command.ts";
import { aliasList, kebabCase } from "./options.ts";
import { readArgInfo, schemaShape } from "./schema.ts";

function details(
  description: string | undefined,
  required: boolean,
  defaultValue: unknown,
): string {
  const parts = [description];
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
  const syntax = positional.map((key) => {
    const info = readArgInfo(shape[key]!);
    return info.required ? `<${key.toUpperCase()}>` : `[${key.toUpperCase()}]`;
  });
  if (command.subCommands && Object.keys(command.subCommands).length > 0) syntax.push("<COMMAND>");
  lines.push(
    `USAGE ${command.name ?? "command"} [OPTIONS]${syntax.length ? ` ${syntax.join(" ")}` : ""}`,
  );

  if (positional.length > 0) {
    lines.push("", "ARGUMENTS", "");
    for (const key of positional) {
      const info = readArgInfo(shape[key]!);
      lines.push(
        `  ${key.toUpperCase()}  ${details(info.description, info.required, info.defaultValue)}`.trimEnd(),
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
      const long = `--${kebabCase(key)}${info.takesValue ? `=<${kebabCase(key)}>` : ""}`;
      lines.push(
        `  ${prefix}${long}  ${details(info.description, info.required, info.defaultValue)}`.trimEnd(),
      );
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
  await Promise.resolve((options.write ?? console.log)(text));
}
