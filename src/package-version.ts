import { readFile, realpath } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function findPackageVersion(entry: string | undefined): Promise<string | undefined> {
  if (!entry) return undefined;
  let directory: string;
  try {
    directory = dirname(await realpath(entry));
  } catch {
    return undefined;
  }
  for (;;) {
    const version = await readPackageVersion(join(directory, "package.json"));
    if (version !== undefined) return version;
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

async function readPackageVersion(path: string): Promise<string | undefined> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return undefined;
  }
  try {
    const { version } = JSON.parse(text) as { version?: unknown };
    return typeof version === "string" ? version : undefined;
  } catch {
    return undefined;
  }
}
