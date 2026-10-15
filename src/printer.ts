import type { AnyCommandDef } from "./command.ts";

export type PrintStream = "stdout" | "stderr";

export interface UsagePrintEvent {
  type: "usage";
  command: AnyCommandDef;
  text: string;
  stream: PrintStream;
}

export interface VersionPrintEvent {
  type: "version";
  version: string;
}

export interface ErrorPrintEvent {
  type: "error";
  error: unknown;
  message: string;
}

/** A semantic output value emitted by hacksh. */
export type PrintEvent = UsagePrintEvent | VersionPrintEvent | ErrorPrintEvent;

/** Receives every output event produced by one command invocation. */
export interface Printer {
  print(event: PrintEvent): void | Promise<void>;
}

/** The plain-text printer used when an invocation does not select one. */
export const consolePrinter: Printer = {
  print(event) {
    switch (event.type) {
      case "usage":
        return event.stream === "stdout" ? console.log(event.text) : console.error(event.text);
      case "version":
        return console.log(event.version);
      case "error":
        return console.error(event.message);
    }
  },
};

export interface PrintQueue {
  printer: Printer;
  drain(): Promise<void>;
}

/** Serialize printer calls and retain failures until the invocation drains its output. */
export function createPrintQueue(target: Printer): PrintQueue {
  let pending: Promise<void> | undefined;
  let failure: unknown;
  let failed = false;

  function recordFailure(error: unknown): void {
    if (!failed) failure = error;
    failed = true;
  }

  function track(result: void | Promise<void>): void | Promise<void> {
    if (!result) return undefined;

    const current = Promise.resolve(result).catch(recordFailure);
    pending = current;
    void current.then(() => {
      if (pending === current) pending = undefined;
    });
    return current;
  }

  const printer: Printer = {
    print(event) {
      if (pending) return track(pending.then(() => target.print(event)));
      try {
        return track(target.print(event));
      } catch (error) {
        recordFailure(error);
      }
    },
  };

  return {
    printer,
    async drain() {
      await pending;
      if (failed) throw failure;
    },
  };
}
