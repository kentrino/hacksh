import { afterEach, describe, expect, expectTypeOf, it, vi } from "vite-plus/test";
import { z } from "zod";
import {
  defineCommand,
  parseArgs,
  runCommand,
  HackshValidationError,
  type Logger,
} from "./index.ts";
import { createJsonPrinter, type LogRecord, type PrintEvent } from "./printer-api.ts";

afterEach(() => vi.restoreAllMocks());

describe("run logger", () => {
  it("emits every level and info kind as structured, interpolated records", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_797_000_000_000);
    const records: LogRecord[] = [];
    const result = { unchanged: true };
    const command = defineCommand({
      name: "tool",
      run({ logger }) {
        expectTypeOf(logger).toEqualTypeOf<Logger>();
        logger.trace("trace {value}", { value: 1 });
        logger.debug("debug", { value: 2 });
        logger.info("info", { value: 3 });
        logger.warn("warn", { value: 4 });
        logger.error("error", { value: 5 });
        logger.fatal("fatal", { value: 6 });
        logger.step("step", { value: 7 });
        logger.success("success", { value: 8 });
        return result;
      },
    });

    const received = await runCommand(command, [], {
      printer: {
        print(event) {
          if (event.type === "log") records.push(event.record);
        },
      },
    });
    expect(received).toBe(result);

    expect(records.map(({ level, kind }) => [level, kind])).toEqual([
      ["trace", "message"],
      ["debug", "message"],
      ["info", "message"],
      ["warning", "message"],
      ["error", "message"],
      ["fatal", "message"],
      ["info", "step"],
      ["info", "success"],
    ]);
    expect(records[0]).toEqual({
      level: "trace",
      kind: "message",
      category: ["tool"],
      message: "trace 1",
      rawMessage: "trace {value}",
      properties: { value: 1 },
      timestamp: 1_797_000_000_000,
    });
  });

  it("merges bound properties with call precedence and composes child categories", async () => {
    const records: LogRecord[] = [];
    const leaf = defineCommand({
      run({ logger }) {
        expect(logger.category).toEqual(["root", "group", "leaf"]);
        logger
          .with({ app: "bound", env: "prod", attempt: 1 })
          .with({ attempt: 2 })
          .getChild("upload")
          .info("Deploying {app} to {env}, attempt {attempt}: {missing}", {
            app: "explicit",
            attempt: 3,
          });
        return;
      },
    });
    const root = defineCommand({
      name: "root",
      subCommands: { group: defineCommand({ subCommands: { leaf } }) },
    });

    await runCommand(root, ["group", "leaf"], {
      printer: {
        print(event) {
          if (event.type === "log") records.push(event.record);
        },
      },
    });

    expect(records[0]).toMatchObject({
      category: ["root", "group", "leaf", "upload"],
      message: "Deploying explicit to prod, attempt 3: {missing}",
      rawMessage: "Deploying {app} to {env}, attempt {attempt}: {missing}",
      properties: { app: "explicit", env: "prod", attempt: 3 },
    });
  });

  it("keeps records and the run result when placeholder values cannot be converted", async () => {
    const records: LogRecord[] = [];
    const nullPrototypeValue = Object.create(null) as object;
    const nullPrototypeProperties = Object.assign(Object.create(null), {
      value: nullPrototypeValue,
    }) as Record<string, unknown>;
    const throwingValue = {
      toString(): string {
        throw new Error("cannot format");
      },
    };
    const result = { unchanged: true };
    const command = defineCommand({
      run({ logger }) {
        logger.info("Null prototype: {value}", nullPrototypeProperties);
        logger.info("Throwing conversion: {value}", { value: throwingValue });
        return result;
      },
    });

    const received = await runCommand(command, [], {
      printer: {
        print(event) {
          if (event.type === "log") records.push(event.record);
        },
      },
    });
    expect(received).toBe(result);

    expect(records).toHaveLength(2);
    expect(records.map(({ message }) => message)).toEqual([
      "Null prototype: {value}",
      "Throwing conversion: {value}",
    ]);
    expect(records[0]?.properties.value).toBe(nullPrototypeValue);
    expect(records[1]?.properties.value).toBe(throwingValue);
  });

  it("retains Error inputs as canonical structured properties", async () => {
    const records: LogRecord[] = [];
    const failure = new Error("connection lost", { cause: new Error("socket closed") });
    const command = defineCommand({
      run({ logger }) {
        logger.with({ requestId: "req-1" }).error(failure, { retryable: true });
        return;
      },
    });

    await runCommand(command, [], {
      printer: {
        print(event) {
          if (event.type === "log") records.push(event.record);
        },
      },
    });

    expect(records[0]).toMatchObject({
      level: "error",
      message: "connection lost",
      rawMessage: "connection lost",
      properties: {
        requestId: "req-1",
        retryable: true,
        error: {
          kind: "error",
          name: "Error",
          message: "connection lost",
          cause: { kind: "error", name: "Error", message: "socket closed" },
        },
      },
    });
    expect(records[0]?.properties.error).not.toBe(failure);
  });

  it("canonically summarizes actual validation errors in log properties and nested causes", async () => {
    const invalid = defineCommand({
      name: "invalid",
      args: z.object({ count: z.number() }),
    });
    const validation = await parseArgs(invalid, ["--count", "nope"]).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(validation).toBeInstanceOf(HackshValidationError);
    const outer = new Error("outer", { cause: validation });
    (validation as HackshValidationError & { related: Error }).related = outer;

    const events: PrintEvent[] = [];
    await runCommand(
      defineCommand({
        run({ logger }) {
          logger.info("validation", { validation });
          return;
        },
      }),
      [],
      { printer: { print: (event) => void events.push(event) } },
    );

    const log = events[0];
    expect(log).toMatchObject({
      type: "log",
      record: {
        properties: {
          validation: {
            kind: "validation",
            name: "HackshValidationError",
            issues: [{ arg: "--count", code: "invalid_type" }],
          },
        },
      },
    });
    if (log?.type !== "log") throw new Error("Expected a log event");
    const summary = log.record.properties.validation as {
      properties: { related: { cause: unknown } };
    };
    expect(summary).not.toHaveProperty("command");
    expect(summary.properties.related.cause).toBe(summary);
    expect(summary).not.toHaveProperty("issues.0.issue.inst");
  });

  it("preserves class serialization and Buffer identity before JSON normalization", async () => {
    class Money {
      constructor(
        readonly cents: number,
        readonly error: Error,
      ) {}

      toJSON(): string {
        return `$${(this.cents / 100).toFixed(2)}`;
      }
    }

    const money = new Money(250, new Error("not part of the display value"));
    const buffer = Buffer.from([1, 2, 3]);
    const events: PrintEvent[] = [];
    await runCommand(
      defineCommand({
        run({ logger }) {
          logger.info("payment", { money, buffer });
          return;
        },
      }),
      [],
      { printer: { print: (event) => void events.push(event) } },
    );

    const log = events[0];
    if (log?.type !== "log") throw new Error("Expected a log event");
    expect(log.record.properties.money).toBe(money);
    expect(log.record.properties.buffer).toBe(buffer);

    const lines: string[] = [];
    const printer = createJsonPrinter({ stderr: { write: (value) => void lines.push(value) } });
    await printer.print(log);
    expect(JSON.parse(lines[0]!).record.properties).toMatchObject({
      money: "$2.50",
      buffer: { type: "Buffer", data: [1, 2, 3] },
    });
  });

  it("serializes log writes and drains them before preserving the run result", async () => {
    const sequence: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const result = { status: "complete" };
    const invocation = runCommand(
      defineCommand({
        run({ logger }) {
          logger.info("first");
          logger.info("second");
          return result;
        },
      }),
      [],
      {
        printer: {
          async print(event) {
            if (event.type !== "log") return;
            sequence.push(`start:${event.record.message}`);
            if (event.record.message === "first") {
              await new Promise<void>((resolve) => {
                releaseFirst = resolve;
              });
            }
            sequence.push(`end:${event.record.message}`);
          },
        },
      },
    );

    await vi.waitFor(() => expect(releaseFirst).toBeTypeOf("function"));
    expect(sequence).toEqual(["start:first"]);
    releaseFirst?.();
    const received = await invocation;
    expect(received).toBe(result);
    expect(sequence).toEqual(["start:first", "end:first", "start:second", "end:second"]);
  });

  it("rejects after run when an asynchronous log write fails", async () => {
    const failure = new Error("log failed");
    const command = defineCommand({
      run({ logger }) {
        logger.info("queued");
        return "run result";
      },
    });

    await expect(
      runCommand(command, [], {
        printer: {
          print: async (event) =>
            event.type === "log" ? Promise.reject(failure) : Promise.resolve(),
        },
      }),
    ).rejects.toBe(failure);
  });
});
