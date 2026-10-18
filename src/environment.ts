import type { AnyCommandDef } from "./command.ts";
import { kebabCase } from "./options.ts";
import { isArrayInput, isObjectInput, POSITIONALS_KEY, schemaShape } from "./schema.ts";

const commandPaths = new WeakMap<AnyCommandDef, readonly string[] | undefined>();

export function registerCommandPath(
  command: AnyCommandDef,
  path: readonly string[] | undefined,
): void {
  commandPaths.set(command, path);
}

export function commandEnvPath(command: AnyCommandDef): readonly string[] | undefined {
  if (!commandPaths.has(command)) return command.name ? [command.name] : undefined;
  return commandPaths.get(command);
}

function envSegment(segment: string): string {
  return kebabCase(segment)
    .replaceAll(/[^A-Za-z0-9]+/g, "_")
    .toUpperCase();
}

export function optionEnvNames(
  command: AnyCommandDef,
  path: readonly string[] | undefined,
): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  if (!command.args) return names;
  for (const [key, schema] of Object.entries(schemaShape(command.args))) {
    if (key === POSITIONALS_KEY) continue;
    if (isArrayInput(schema) || isObjectInput(schema)) continue;
    const configured = command.argOptions?.[key]?.env;
    if (configured === false) continue;
    if (typeof configured === "string") {
      names.set(key, configured);
      continue;
    }
    if (path === undefined || path.length === 0) continue;
    names.set(key, [...path, key].map(envSegment).join("_"));
  }
  return names;
}

function envOptionLabel(path: readonly string[] | undefined, key: string): string {
  const flag = `--${kebabCase(key)}`;
  const command = path?.slice(1).join(" ");
  return command ? `${command} ${flag}` : flag;
}

export function assertUniqueEnvNames(
  segments: readonly {
    command: AnyCommandDef;
    path: readonly string[] | undefined;
  }[],
): void {
  const owners = new Map<string, string>();
  for (const segment of segments) {
    for (const [key, envName] of optionEnvNames(segment.command, segment.path)) {
      const label = envOptionLabel(segment.path, key);
      const previous = owners.get(envName);
      if (previous !== undefined) {
        throw new TypeError(
          `Environment variable \`${envName}\` is used by both \`${previous}\` and \`${label}\``,
        );
      }
      owners.set(envName, label);
    }
  }
}

export function readEnvValue(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
): string | undefined {
  try {
    const value = env[name];
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}
