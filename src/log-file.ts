import { mkdir, open, type FileHandle } from "node:fs/promises";
import { dirname, join } from "node:path";
import { inspect, stripVTControlCharacters } from "node:util";
import { meetsLogLevel, validateLogLevel, type LogLevel, type LogRecord } from "./logger.ts";
import type { Printer, PrintEvent } from "./printer.ts";
import { normalizeJson } from "./serialization.ts";

export type LogFileFormat = "jsonl" | "text";

export interface LogRunInfo {
  /** Resolved command category segments (e.g. ["mycli", "deploy"]). */
  readonly category: readonly string[];
  /** Invocation start time. */
  readonly startedAt: Date;
  /** Current process ID. */
  readonly pid: number;
}

export interface LogDestinationBase {
  /** File output format. Defaults to "jsonl". */
  format?: LogFileFormat;
  /** Minimum log level written to this destination. Defaults to "trace". */
  level?: LogLevel;
}

export interface LogFileDestination extends LogDestinationBase {
  /** Write logs to a single file path. */
  file: string;
  /** Append to an existing file instead of truncating it. Defaults to true. */
  append?: boolean;
  dir?: never;
  filename?: never;
}

export interface LogDirDestination extends LogDestinationBase {
  /** Write logs to a per-invocation file inside this directory. */
  dir: string;
  /** Custom filename (or builder) inside `dir`. Defaults to `<date>-<seconds>-<category>-<pid>.<ext>`. */
  filename?: string | ((info: LogRunInfo) => string);
  file?: never;
  append?: never;
}

export type LogDestination = LogFileDestination | LogDirDestination;

export interface FileLogPrinter extends Printer {
  /** Close the underlying file handle if one was opened. */
  close(): Promise<void>;
}

export interface FileLogPrinterOptions {
  /** Invocation metadata used when generating per-run filenames for `dir` destinations. */
  runInfo?: LogRunInfo | (() => LogRunInfo);
}

const MAX_COLLISION_ATTEMPTS = 1000;

function formatInvalidValue(value: unknown): string {
  try {
    return String(value);
  } catch {
    return "[Unserializable]";
  }
}

function validateFormat(value: unknown, source: string): LogFileFormat {
  if (value === undefined) return "jsonl";
  if (value === "jsonl" || value === "text") return value;
  throw new TypeError(
    `Invalid ${source} value ${formatInvalidValue(value)}; expected jsonl or text`,
  );
}

function validateFilename(value: unknown, source: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`Invalid ${source} value; expected a non-empty filename`);
  }
  if (value === "." || value === ".." || value.includes("/") || value.includes("\\")) {
    throw new TypeError(
      `Invalid ${source} value ${formatInvalidValue(value)}; filename must not contain path separators or traversal segments`,
    );
  }
  return value;
}

function validateDestination(destination: unknown, index?: number): LogDestination {
  const prefix = index === undefined ? "log" : `log[${index}]`;
  if (typeof destination !== "object" || destination === null || Array.isArray(destination)) {
    throw new TypeError(`Invalid ${prefix} destination; expected an object with file or dir`);
  }
  const candidate = destination as Record<string, unknown>;
  const hasFile = candidate.file !== undefined;
  const hasDir = candidate.dir !== undefined;
  if (hasFile === hasDir) {
    throw new TypeError(
      `Invalid ${prefix} destination; specify exactly one of \`file\` or \`dir\``,
    );
  }
  const format = validateFormat(candidate.format, `${prefix}.format`);
  const level = validateLogLevel(candidate.level, `${prefix}.level`) ?? "trace";

  if (hasFile) {
    if (typeof candidate.file !== "string" || candidate.file.trim() === "") {
      throw new TypeError(`Invalid ${prefix}.file value; expected a non-empty file path`);
    }
    if (candidate.append !== undefined && typeof candidate.append !== "boolean") {
      throw new TypeError(`Invalid ${prefix}.append value; expected a boolean`);
    }
    if (candidate.filename !== undefined) {
      throw new TypeError(
        `Invalid ${prefix} destination; \`filename\` can only be used with \`dir\``,
      );
    }
    return {
      file: candidate.file,
      append: candidate.append ?? true,
      format,
      level,
    };
  }

  if (typeof candidate.dir !== "string" || candidate.dir.trim() === "") {
    throw new TypeError(`Invalid ${prefix}.dir value; expected a non-empty directory path`);
  }
  if (candidate.append !== undefined) {
    throw new TypeError(`Invalid ${prefix} destination; \`append\` can only be used with \`file\``);
  }
  let filename: LogDirDestination["filename"];
  if (candidate.filename !== undefined) {
    if (typeof candidate.filename === "function") {
      filename = candidate.filename as (info: LogRunInfo) => string;
    } else {
      filename = validateFilename(candidate.filename, `${prefix}.filename`);
    }
  }
  return {
    dir: candidate.dir,
    ...(filename === undefined ? {} : { filename }),
    format,
    level,
  };
}

function readEnvironment(
  env: Readonly<Record<string, string | undefined>>,
  key: string,
): string | undefined {
  try {
    return env[key];
  } catch {
    return undefined;
  }
}

/** Validate configured log destinations and append any from HACKSH_LOG_FILE / HACKSH_LOG_DIR. */
export function resolveLogDestinations(
  configured: LogDestination | readonly LogDestination[] | undefined,
  env: Readonly<Record<string, string | undefined>>,
): LogDestination[] {
  const destinations: LogDestination[] = [];
  if (configured !== undefined) {
    if (Array.isArray(configured)) {
      for (let i = 0; i < configured.length; i += 1) {
        destinations.push(validateDestination(configured[i], i));
      }
    } else {
      destinations.push(validateDestination(configured));
    }
  }

  const envFile = readEnvironment(env, "HACKSH_LOG_FILE");
  if (envFile !== undefined && envFile.trim() !== "") {
    destinations.push({ file: envFile, append: true, format: "jsonl", level: "trace" });
  }

  const envDir = readEnvironment(env, "HACKSH_LOG_DIR");
  if (envDir !== undefined && envDir.trim() !== "") {
    destinations.push({ dir: envDir, format: "jsonl", level: "trace" });
  }

  return destinations;
}

function sanitizeSegment(segment: string): string {
  const cleaned = segment.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned;
}

function defaultRunFilenameParts(
  info: LogRunInfo,
  format: LogFileFormat,
): { stem: string; ext: string } {
  const date = info.startedAt.toISOString().slice(0, 10);
  const unixSeconds = Math.floor(info.startedAt.getTime() / 1000);
  const secondsOfDay = String(((unixSeconds % 86400) + 86400) % 86400).padStart(5, "0");
  const category = info.category
    .map(sanitizeSegment)
    .filter((segment) => segment.length > 0)
    .join("-");
  const label = category || "run";
  const ext = format === "text" ? "log" : "jsonl";
  return { stem: `${date}-${secondsOfDay}-${label}-${info.pid}`, ext };
}

function safelyInspect(value: unknown): string {
  if (typeof value === "string") return stripVTControlCharacters(value);
  try {
    return stripVTControlCharacters(
      inspect(value, {
        breakLength: 80,
        colors: false,
        compact: false,
        depth: null,
        sorted: true,
      }),
    );
  } catch {
    return "[Unserializable]";
  }
}

export function formatLogRecordJsonl(record: LogRecord): string {
  try {
    return `${JSON.stringify(normalizeJson(record))}\n`;
  } catch {
    return `${JSON.stringify({
      level: record.level,
      kind: record.kind,
      category: record.category,
      message: stripVTControlCharacters(record.message),
      timestamp: record.timestamp,
      serializationError: "Log record could not be serialized",
    })}\n`;
  }
}

export function formatLogRecordText(record: LogRecord): string {
  const timestamp = new Date(record.timestamp).toISOString();
  const level = record.level.toUpperCase();
  const category =
    record.category.length > 0
      ? `[${record.category.map((part) => stripVTControlCharacters(part)).join(":")}] `
      : "";
  const messageLines = stripVTControlCharacters(record.message).split("\n");
  const lines = [`${timestamp} ${level} ${category}${messageLines[0] ?? ""}`];
  for (const continuation of messageLines.slice(1)) {
    lines.push(`  ${continuation}`);
  }
  for (const key of Object.keys(record.properties).sort()) {
    const rendered =
      `  ${stripVTControlCharacters(key)}: ${safelyInspect(record.properties[key])}`.split("\n");
    lines.push(rendered[0] ?? "");
    for (const continuation of rendered.slice(1)) {
      lines.push(`    ${continuation}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function isExistsError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "EEXIST"
  );
}

async function openDestinationHandle(
  destination: LogDestination,
  runInfo: LogRunInfo,
): Promise<FileHandle> {
  if (destination.file !== undefined) {
    await mkdir(dirname(destination.file), { recursive: true });
    return open(destination.file, destination.append === false ? "w" : "a");
  }

  await mkdir(destination.dir, { recursive: true });
  const format = destination.format ?? "jsonl";

  if (destination.filename !== undefined) {
    const rawName =
      typeof destination.filename === "function"
        ? destination.filename(runInfo)
        : destination.filename;
    const validated = validateFilename(rawName, "log.filename");
    return open(join(destination.dir, validated), "a");
  }

  const { stem, ext } = defaultRunFilenameParts(runInfo, format);
  for (let attempt = 0; attempt < MAX_COLLISION_ATTEMPTS; attempt += 1) {
    const suffix = attempt === 0 ? "" : `-${attempt}`;
    const candidate = join(destination.dir, `${stem}${suffix}.${ext}`);
    try {
      return await open(candidate, "wx");
    } catch (error) {
      if (isExistsError(error)) continue;
      throw error;
    }
  }
  throw new Error(`Could not create a unique log file in ${destination.dir}`);
}

/** Create a printer that writes structured log events to a file or per-run directory. */
export function createFileLogPrinter(
  destination: LogDestination,
  options: FileLogPrinterOptions = {},
): FileLogPrinter {
  const validated = validateDestination(destination);
  const format = validated.format ?? "jsonl";
  const minLevel = validated.level ?? "trace";
  let handle: FileHandle | undefined;
  let closed = false;

  const getRunInfo = (record: LogRecord): LogRunInfo => {
    if (typeof options.runInfo === "function") return options.runInfo();
    if (options.runInfo) return options.runInfo;
    return {
      category: record.category,
      startedAt: new Date(record.timestamp),
      pid: process.pid,
    };
  };

  return {
    async print(event: PrintEvent): Promise<void> {
      if (event.type !== "log") return;
      if (!meetsLogLevel(event.record.level, minLevel)) return;
      if (closed) return;
      if (!handle) {
        handle = await openDestinationHandle(validated, getRunInfo(event.record));
      }
      const line =
        format === "text" ? formatLogRecordText(event.record) : formatLogRecordJsonl(event.record);
      await handle.write(line, undefined, "utf8");
    },
    async close(): Promise<void> {
      closed = true;
      const current = handle;
      handle = undefined;
      if (current) await current.close();
    },
  };
}

/** Fan out each print event to every target printer in order, keeping synchronous printers synchronous. */
export function combinePrinters(printers: readonly Printer[]): Printer {
  if (printers.length === 1) return printers[0]!;
  return {
    print(event) {
      let pending: Promise<void> | undefined;
      let firstError: unknown;
      let hasError = false;

      const recordError = (error: unknown): void => {
        if (!hasError) {
          firstError = error;
          hasError = true;
        }
      };

      for (const printer of printers) {
        if (pending) {
          pending = pending.then(async () => {
            try {
              await printer.print(event);
            } catch (error) {
              recordError(error);
            }
          });
          continue;
        }
        try {
          const result = printer.print(event);
          if (result) {
            pending = Promise.resolve(result).catch(recordError);
          }
        } catch (error) {
          recordError(error);
        }
      }

      if (pending) {
        return pending.then(() => {
          if (hasError) throw firstError;
        });
      }
      if (hasError) throw firstError;
    },
  };
}
