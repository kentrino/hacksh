import { createPrettyPrinter } from "./pretty.ts";
import {
  createJsonPrinter,
  resolveOutputMode,
  type OutputMode,
  type OutputPreference,
  type OutputWriter,
  type Printer,
  type TerminalInput,
  type TerminalOutput,
} from "./printer.ts";

export interface OutputOptions {
  output?: OutputPreference;
  /** Use Unicode presentation symbols in pretty output. Defaults to true. */
  unicode?: boolean;
  env?: Readonly<Record<string, string | undefined>>;
  stdin?: TerminalInput;
  stdout?: TerminalOutput;
  stderr?: OutputWriter;
}

function consoleWriter(method: "log" | "error"): OutputWriter {
  return {
    write(text) {
      console[method](text.endsWith("\n") ? text.slice(0, -1) : text);
    },
  };
}

/** Resolve the automatic output policy and select its printer for one operation. */
export function selectOutputPrinter(
  options: OutputOptions,
  override?: Printer,
  resolvedMode?: OutputMode,
): Printer {
  const stdin = options.stdin ?? process.stdin;
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const mode =
    resolvedMode ??
    resolveOutputMode({
      output: options.output,
      env: options.env,
      inputIsTTY: stdin.isTTY,
      outputIsTTY: stdout.isTTY,
    });
  if (override) return override;
  if (mode.format === "json") return createJsonPrinter({ stdout, stderr });

  const useConsole = options.stdout === undefined && options.stderr === undefined;
  return createPrettyPrinter({
    color: mode.color,
    unicode: options.unicode ?? true,
    stdout: options.stdout ?? (useConsole ? consoleWriter("log") : stdout),
    stderr: options.stderr ?? (useConsole ? consoleWriter("error") : stderr),
  });
}
