import type { Printer } from "./printer.ts";

/** Writes a command's results to stdout, separately from logs. */
export interface Output {
  /** Write text exactly as given. */
  print(text: string): void;
  /** Write text followed by a newline. */
  println(text?: string): void;
  /** Write a JSON value. */
  json(value: unknown): void;
}

/** Create the output for one command invocation. */
export function createOutput(printer: Printer): Output {
  function print(text: string): void {
    void printer.print({ type: "output", kind: "text", text });
  }
  return {
    print,
    println: (text = "") => print(`${text}\n`),
    json: (data) => void printer.print({ type: "output", kind: "json", data }),
  };
}
