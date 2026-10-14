export function kebabCase(value: string): string {
  return value.replaceAll(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

export function aliasList(value: string | readonly string[]): readonly string[] {
  return typeof value === "string" ? [value] : value;
}
