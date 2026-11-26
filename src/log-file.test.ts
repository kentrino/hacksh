import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { defineCommand, HackshError, runCommand, runMain } from "./index.ts";
import {
  combinePrinters,
  createFileLogPrinter,
  filterLogPrinter,
  type LogRecord,
  type PrintEvent,
} from "./printer-api.ts";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "hacksh-log-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("file and directory log destinations", () => {
  it("writes structured JSONL records to a single file while keeping terminal output", async () => {
    const root = await makeTempDir();
    const logPath = join(root, "nested", "app.jsonl");
    const stderr: string[] = [];

    const command = defineCommand({
      name: "deploy",
      run({ logger, output }) {
        output.println("ok");
        logger.step("Deploying {app}", { app: "web" });
        logger.with({ env: "prod" }).success("Deployed {app}", { app: "web" });
      },
    });

    await expect(
      runCommand(command, [], {
        output: "pretty",
        unicode: false,
        env: { NO_COLOR: "1" },
        stdout: { isTTY: false, write: () => undefined },
        stderr: { isTTY: false, write: (chunk) => void stderr.push(chunk) },
        log: { file: logPath },
      }),
    ).resolves.toBe(0);

    expect(stderr.join("")).toContain("Deploying web");
    expect(stderr.join("")).toContain("Deployed web");

    const lines = (await readFile(logPath, "utf8")).trim().split("\n");
    expect(lines).toHaveLength(2);
    const records = lines.map((line) => JSON.parse(line) as LogRecord);
    expect(records[0]).toMatchObject({
      level: "info",
      kind: "step",
      category: ["deploy"],
      message: "Deploying web",
      rawMessage: "Deploying {app}",
      properties: { app: "web" },
    });
    expect(records[1]).toMatchObject({
      level: "info",
      kind: "success",
      category: ["deploy"],
      message: "Deployed web",
      properties: { app: "web", env: "prod" },
    });
  });

  it("appends by default and truncates when append is false", async () => {
    const root = await makeTempDir();
    const appendPath = join(root, "append.jsonl");
    const overwritePath = join(root, "overwrite.jsonl");
    const command = defineCommand({
      run({ logger }) {
        logger.info("entry");
      },
    });

    for (let i = 0; i < 2; i += 1) {
      await runCommand(command, [], {
        env: {},
        printer: { print: () => undefined },
        log: [{ file: appendPath }, { file: overwritePath, append: false }],
      });
    }

    const appended = (await readFile(appendPath, "utf8")).trim().split("\n");
    const overwritten = (await readFile(overwritePath, "utf8")).trim().split("\n");
    expect(appended).toHaveLength(2);
    expect(overwritten).toHaveLength(1);
  });

  it("formats text logs without ANSI escape codes and preserves multiline messages and properties", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-27T01:56:00.123Z"));
    const root = await makeTempDir();
    const logPath = join(root, "app.log");

    const command = defineCommand({
      name: "tool",
      run({ logger }) {
        logger.warn("\u001b[31mLine one\u001b[0m\nLine two", {
          beta: 2,
          alpha: "\u001b[32mclean\u001b[0m",
        });
      },
    });

    await runCommand(command, [], {
      env: {},
      printer: { print: () => undefined },
      log: { file: logPath, format: "text" },
    });

    const content = await readFile(logPath, "utf8");
    expect(content).not.toContain("\u001b[");
    expect(content).toBe(
      [
        "2026-11-27T01:56:00.123Z WARNING [tool] Line one",
        "  Line two",
        "  alpha: clean",
        "  beta: 2",
        "",
      ].join("\n"),
    );
  });

  it("creates log files lazily only when at least one log record matches", async () => {
    const root = await makeTempDir();
    const filePath = join(root, "unused.jsonl");
    const dirPath = join(root, "unused-dir");

    const command = defineCommand({
      name: "quiet",
      run({ logger, output }) {
        output.println("just output");
        logger.debug("below threshold");
      },
    });

    await runCommand(command, [], {
      env: {},
      printer: { print: () => undefined },
      log: [
        { file: filePath, level: "info" },
        { dir: dirPath, level: "warning" },
      ],
    });

    await expect(stat(filePath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(dirPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("writes one file per invocation inside dir with collision avoidance", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-27T01:56:00.123Z"));
    const root = await makeTempDir();
    const logDir = join(root, "runs");

    const leaf = defineCommand({
      run({ logger }) {
        logger.info("hello");
      },
    });
    const cli = defineCommand({
      name: "mycli",
      subCommands: { deploy: leaf },
    });

    await runCommand(cli, ["deploy"], {
      env: {},
      printer: { print: () => undefined },
      log: { dir: logDir },
    });
    await runCommand(cli, ["deploy"], {
      env: {},
      printer: { print: () => undefined },
      log: { dir: logDir },
    });

    const files = (await readdir(logDir)).sort();
    expect(files).toEqual([
      `2026-11-27T01-56-00-123Z-mycli-deploy-${process.pid}-1.jsonl`,
      `2026-11-27T01-56-00-123Z-mycli-deploy-${process.pid}.jsonl`,
    ]);
    for (const file of files) {
      const parsed = JSON.parse((await readFile(join(logDir, file), "utf8")).trim()) as LogRecord;
      expect(parsed).toMatchObject({ category: ["mycli", "deploy"], message: "hello" });
    }
  });

  it("uses .log extension for text format in dir and supports custom filename builders", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-27T01:56:00.000Z"));
    const root = await makeTempDir();
    const textDir = join(root, "text-runs");
    const customDir = join(root, "custom-runs");

    const command = defineCommand({
      name: "build",
      run({ logger }) {
        logger.info("compiled");
      },
    });

    await runCommand(command, [], {
      env: {},
      printer: { print: () => undefined },
      log: [
        { dir: textDir, format: "text" },
        {
          dir: customDir,
          filename: ({ category, pid }) => `${category.join("_")}-${pid}.custom.jsonl`,
        },
      ],
    });

    expect(await readdir(textDir)).toEqual([`2026-11-27T01-56-00-000Z-build-${process.pid}.log`]);
    expect(await readdir(customDir)).toEqual([`build-${process.pid}.custom.jsonl`]);
  });

  it("filters primary output and each file destination independently by level", async () => {
    const root = await makeTempDir();
    const debugFile = join(root, "debug.jsonl");
    const errorFile = join(root, "error.jsonl");
    const primaryEvents: PrintEvent[] = [];

    const command = defineCommand({
      name: "app",
      run({ logger, output }) {
        output.println("result");
        logger.trace("t");
        logger.debug("d");
        logger.info("i");
        logger.warn("w");
        logger.error("e");
        logger.fatal("f");
      },
    });

    await runCommand(command, [], {
      env: {},
      logLevel: "warning",
      printer: { print: (event) => void primaryEvents.push(event) },
      log: [
        { file: debugFile, level: "debug" },
        { file: errorFile, level: "error" },
      ],
    });

    expect(
      primaryEvents.filter((event) => event.type === "log").map((event) => event.record.level),
    ).toEqual(["warning", "error", "fatal"]);
    expect(primaryEvents.some((event) => event.type === "output")).toBe(true);

    const debugLevels = (await readFile(debugFile, "utf8"))
      .trim()
      .split("\n")
      .map((line) => (JSON.parse(line) as LogRecord).level);
    const errorLevels = (await readFile(errorFile, "utf8"))
      .trim()
      .split("\n")
      .map((line) => (JSON.parse(line) as LogRecord).level);
    expect(debugLevels).toEqual(["debug", "info", "warning", "error", "fatal"]);
    expect(errorLevels).toEqual(["error", "fatal"]);
  });

  it("never suppresses thrown command errors when logLevel is fatal", async () => {
    const stderr: string[] = [];
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    const command = defineCommand({
      run({ logger }) {
        logger.error("suppressed log");
        throw new HackshError("fatal command failure");
      },
    });

    await expect(
      runMain(command, {
        argv: [],
        output: "json",
        logLevel: "fatal",
        env: {},
        stdout: { isTTY: false, write: () => undefined },
        stderr: { isTTY: false, write: (chunk) => void stderr.push(chunk) },
      }),
    ).rejects.toThrow("exit:1");

    expect(stderr).toHaveLength(1);
    expect(JSON.parse(stderr[0]!)).toMatchObject({
      type: "error",
      error: { message: "fatal command failure" },
    });
  });

  it("supports HACKSH_LOG_LEVEL, HACKSH_LOG_FILE, and HACKSH_LOG_DIR environment variables", async () => {
    const root = await makeTempDir();
    const envFile = join(root, "env.jsonl");
    const envDir = join(root, "env-dir");
    const optFile = join(root, "opt.jsonl");
    const primaryLevels: string[] = [];

    const command = defineCommand({
      name: "svc",
      run({ logger }) {
        logger.debug("dbg");
        logger.info("inf");
        logger.error("err");
      },
    });

    await runCommand(command, [], {
      logLevel: "debug",
      log: { file: optFile },
      env: {
        HACKSH_LOG_LEVEL: "error",
        HACKSH_LOG_FILE: envFile,
        HACKSH_LOG_DIR: envDir,
      },
      printer: {
        print(event) {
          if (event.type === "log") primaryLevels.push(event.record.level);
        },
      },
    });

    expect(primaryLevels).toEqual(["error"]);
    expect((await readFile(optFile, "utf8")).trim().split("\n")).toHaveLength(3);
    expect((await readFile(envFile, "utf8")).trim().split("\n")).toHaveLength(3);
    const dirFiles = await readdir(envDir);
    expect(dirFiles).toHaveLength(1);
    expect((await readFile(join(envDir, dirFiles[0]!), "utf8")).trim().split("\n")).toHaveLength(3);
  });

  it("ignores empty HACKSH_LOG_FILE and HACKSH_LOG_DIR values", async () => {
    const command = defineCommand({
      run({ logger }) {
        logger.info("ok");
      },
    });

    await expect(
      runCommand(command, [], {
        env: { HACKSH_LOG_FILE: "", HACKSH_LOG_DIR: "   " },
        printer: { print: () => undefined },
      }),
    ).resolves.toBe(0);
  });

  it.each([
    { label: "neither file nor dir", options: { log: {} as never } },
    { label: "both file and dir", options: { log: { file: "a.log", dir: "logs" } as never } },
    { label: "empty file", options: { log: { file: "   " } } },
    { label: "empty dir", options: { log: { dir: "" } } },
    { label: "invalid format", options: { log: { file: "a.log", format: "xml" as never } } },
    {
      label: "invalid destination level",
      options: { log: { file: "a.log", level: "loud" as never } },
    },
    { label: "invalid append", options: { log: { file: "a.log", append: "yes" as never } } },
    {
      label: "path traversal filename",
      options: { log: { dir: "logs", filename: "../escape.log" } },
    },
    { label: "nested filename", options: { log: { dir: "logs", filename: "sub/file.log" } } },
    { label: "invalid logLevel option", options: { logLevel: "verbose" as never } },
    { label: "invalid HACKSH_LOG_LEVEL", options: { env: { HACKSH_LOG_LEVEL: "verbose" } } },
    { label: "empty HACKSH_LOG_LEVEL", options: { env: { HACKSH_LOG_LEVEL: "" } } },
  ])("rejects invalid configuration before execution: $label", async ({ options }) => {
    const run = vi.fn();
    const onError = vi.fn();
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(
      runMain(defineCommand({ run }), {
        argv: [],
        env: {},
        ...options,
        onError,
        printer: { print: () => undefined },
      }),
    ).rejects.toBeInstanceOf(TypeError);

    expect(run).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it("rejects dynamic filename returning traversal segments", async () => {
    const root = await makeTempDir();
    const command = defineCommand({
      run({ logger }) {
        logger.info("hello");
      },
    });

    await expect(
      runCommand(command, [], {
        env: {},
        printer: { print: () => undefined },
        log: { dir: join(root, "logs"), filename: () => "../bad.jsonl" },
      }),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it("rejects the invocation when a log file destination cannot be opened", async () => {
    const root = await makeTempDir();
    const command = defineCommand({
      run({ logger }) {
        logger.info("cannot write to directory path");
      },
    });

    await expect(
      runCommand(command, [], {
        env: {},
        printer: { print: () => undefined },
        log: { file: root },
      }),
    ).rejects.toMatchObject({ code: "EISDIR" });
  });

  it("exposes composable printer helpers from hacksh/printer", async () => {
    const root = await makeTempDir();
    const filePath = join(root, "composed.jsonl");
    const seen: string[] = [];

    const filePrinter = createFileLogPrinter({ file: filePath, level: "info" });
    const combined = combinePrinters([
      filterLogPrinter(
        {
          print(event) {
            if (event.type === "log") seen.push(event.record.message);
          },
        },
        "warning",
      ),
      filePrinter,
    ]);

    try {
      await combined.print({
        type: "log",
        record: {
          level: "info",
          kind: "message",
          category: ["demo"],
          message: "info message",
          rawMessage: "info message",
          properties: {},
          timestamp: 1_797_000_000_000,
        },
      });
      await combined.print({
        type: "log",
        record: {
          level: "warning",
          kind: "message",
          category: ["demo"],
          message: "warn message",
          rawMessage: "warn message",
          properties: {},
          timestamp: 1_797_000_000_001,
        },
      });
    } finally {
      await filePrinter.close();
    }

    expect(seen).toEqual(["warn message"]);
    const written = (await readFile(filePath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => (JSON.parse(line) as LogRecord).message);
    expect(written).toEqual(["info message", "warn message"]);
  });
});
