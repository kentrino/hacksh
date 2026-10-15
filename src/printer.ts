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
  let pending = Promise.resolve();
  let failure: unknown;
  let failed = false;

  const printer: Printer = {
    print(event) {
      pending = pending
        .then(() => target.print(event))
        .catch((error: unknown) => {
          if (!failed) failure = error;
          failed = true;
        });
      return pending;
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
