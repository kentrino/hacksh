import { emitKeypressEvents } from "node:readline";
import { PassThrough } from "node:stream";
import type { HackshPromptErrorReason, PromptErrorDetails, PromptKind } from "./errors.ts";
import { HackshPromptError } from "./errors.ts";
import type { Printer, PromptState } from "./printer.ts";

export interface SelectOption<T extends string> {
  value: T;
  label?: string;
  hint?: string;
}

export interface SelectOptions<T extends string> {
  message: string;
  options: readonly SelectOption<T>[];
  initialValue?: T;
}

export interface ConfirmOptions {
  message: string;
  initialValue?: boolean;
}

export interface TextOptions {
  message: string;
  placeholder?: string;
  validate?(value: string): string | undefined;
}

export interface Prompter {
  select<const T extends string>(options: SelectOptions<T>): Promise<T>;
  confirm(options: ConfirmOptions): Promise<boolean>;
  text(options: TextOptions): Promise<string>;
}

interface Key {
  name?: string;
  ctrl?: boolean;
  sequence?: string;
}

interface PromptInput {
  isTTY?: boolean;
  isRaw?: boolean;
  setRawMode?(mode: boolean): unknown;
  isPaused?(): boolean;
  readonly readableFlowing?: boolean | null;
  resume?(): unknown;
  pause?(): unknown;
  on(event: string, listener: (...args: never[]) => void): unknown;
  removeListener(event: string, listener: (...args: never[]) => void): unknown;
}

interface PromptControllerOptions {
  interactive: boolean;
  input: unknown;
  print(event: Parameters<Printer["print"]>[0]): Promise<void>;
}

function details(
  kind: PromptKind,
  message: unknown,
  choices?: readonly string[],
): PromptErrorDetails {
  let normalizedMessage: string;
  try {
    normalizedMessage = typeof message === "string" ? message : String(message);
  } catch {
    normalizedMessage = "[Unserializable prompt message]";
  }
  return {
    kind,
    message: normalizedMessage,
    ...(choices === undefined ? {} : { choices }),
  };
}

function promptError(
  reason: HackshPromptErrorReason,
  prompt: PromptErrorDetails,
  message: string,
  cause?: unknown,
): HackshPromptError {
  return new HackshPromptError(
    reason,
    prompt,
    message,
    cause === undefined ? undefined : { cause },
  );
}

function validateMessage(kind: PromptKind, message: unknown, choices?: readonly string[]): void {
  if (typeof message !== "string" || message.length === 0) {
    throw promptError(
      "invalid-options",
      details(kind, message, choices),
      `Invalid ${kind} prompt: message must be a non-empty string`,
    );
  }
}

function asInput(value: unknown, prompt: PromptErrorDetails): PromptInput {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof Reflect.get(value, "on") !== "function" ||
    typeof Reflect.get(value, "removeListener") !== "function"
  ) {
    throw promptError("input-error", prompt, "Interactive input is not a readable stream");
  }
  return value as PromptInput;
}

export class PromptController implements Prompter {
  readonly #interactive: boolean;
  readonly #inputValue: unknown;
  readonly #printEvent: PromptControllerOptions["print"];
  #active = false;

  constructor(options: PromptControllerOptions) {
    this.#interactive = options.interactive;
    this.#inputValue = options.input;
    this.#printEvent = (event) => options.print(event);
  }

  async #print(state: PromptState, prompt: PromptErrorDetails): Promise<void> {
    try {
      await this.#printEvent({ type: "prompt", prompt: state });
    } catch (cause) {
      throw promptError("printer-error", prompt, "The prompt could not be displayed", cause);
    }
  }

  async #run<T>(
    prompt: PromptErrorDetails,
    initial: PromptState,
    accept: (character: string, key: Key) => T | undefined,
    update: (character: string, key: Key) => PromptState | undefined,
    submitted: (value: T) => PromptState,
  ): Promise<T> {
    if (!this.#interactive) {
      throw promptError(
        "non-interactive",
        prompt,
        `Cannot request ${prompt.kind} input in non-interactive mode: ${prompt.message}`,
      );
    }
    if (this.#active) {
      throw promptError("overlapping", prompt, "Another prompt is already active");
    }

    const input = asInput(this.#inputValue, prompt);
    this.#active = true;
    let originallyFlowing = false;
    let rawChanged = false;
    let outcome: { ok: true; value: T } | { ok: false; error: unknown };
    try {
      originallyFlowing = input.readableFlowing === true;
      if (input.setRawMode && input.isRaw !== true) {
        input.setRawMode(true);
        rawChanged = true;
      }
      await this.#print(initial, prompt);

      const value = await new Promise<T>((resolve, reject) => {
        const keypressInput = new PassThrough();
        emitKeypressEvents(keypressInput);
        let settled = false;
        let keypressQueue = Promise.resolve();
        const finish = (action: () => void): void => {
          if (settled) return;
          settled = true;
          cleanup();
          action();
        };
        const fail = (reason: HackshPromptErrorReason, message: string, cause?: unknown): void => {
          finish(() => reject(promptError(reason, prompt, message, cause)));
        };
        const handleKeypress = async (
          character: string | undefined,
          key: Key = {},
        ): Promise<void> => {
          if (settled) return;
          if ((key.ctrl && key.name === "c") || key.name === "escape") {
            fail("cancelled", "Prompt cancelled");
            return;
          }
          if (key.ctrl && key.name === "d") {
            fail("eof", "Prompt input ended before a value was submitted");
            return;
          }
          try {
            const value = accept(character ?? "", key);
            if (value !== undefined) {
              finish(() => resolve(value));
              return;
            }
            const state = update(character ?? "", key);
            if (state) await this.#print(state, prompt);
          } catch (cause) {
            if (cause instanceof HackshPromptError) finish(() => reject(cause));
            else fail("input-error", "Prompt input could not be processed", cause);
          }
        };
        const onKeypress = (character: string | undefined, key: Key = {}): void => {
          keypressQueue = keypressQueue.then(() => handleKeypress(character, key));
        };
        const onEnd = (): void => fail("eof", "Prompt input ended before a value was submitted");
        const onError = (cause: unknown): void => fail("input-error", "Prompt input failed", cause);
        const onData = (chunk: unknown): void => {
          if (typeof chunk === "string" || chunk instanceof Uint8Array) keypressInput.write(chunk);
          else fail("input-error", "Prompt input produced a non-byte value");
        };
        const cleanup = (): void => {
          keypressInput.removeListener("keypress", onKeypress);
          keypressInput.destroy();
          input.removeListener("data", onData as (...args: never[]) => void);
          input.removeListener("end", onEnd as (...args: never[]) => void);
          input.removeListener("close", onEnd as (...args: never[]) => void);
          input.removeListener("error", onError as (...args: never[]) => void);
        };
        keypressInput.on("keypress", onKeypress);
        input.on("data", onData as (...args: never[]) => void);
        input.on("end", onEnd as (...args: never[]) => void);
        input.on("close", onEnd as (...args: never[]) => void);
        input.on("error", onError as (...args: never[]) => void);
        input.resume?.();
      });
      outcome = { ok: true, value };
    } catch (cause) {
      outcome = {
        ok: false,
        error:
          cause instanceof HackshPromptError
            ? cause
            : promptError("input-error", prompt, "Prompt input could not be initialized", cause),
      };
    }

    let restoreError: HackshPromptError | undefined;
    try {
      if (rawChanged) input.setRawMode?.(false);
      if (!originallyFlowing) input.pause?.();
    } catch (cause) {
      restoreError = promptError(
        "input-error",
        prompt,
        "Prompt input could not be restored",
        cause,
      );
    }
    this.#active = false;
    if (restoreError) throw restoreError;
    if (!outcome.ok) throw outcome.error;
    this.#active = true;
    try {
      await this.#print(submitted(outcome.value), prompt);
      return outcome.value;
    } finally {
      this.#active = false;
    }
  }

  async select<const T extends string>(options: SelectOptions<T>): Promise<T> {
    const choices = Array.isArray(options?.options)
      ? options.options.map((option) =>
          typeof option === "object" && option !== null && typeof option.value === "string"
            ? option.value
            : "[Invalid choice]",
        )
      : [];
    const prompt = details("select", options?.message, choices);
    validateMessage("select", options?.message, choices);
    if (!Array.isArray(options.options) || options.options.length === 0) {
      throw promptError("invalid-options", prompt, "A select prompt requires at least one choice");
    }
    const seen = new Set<string>();
    for (const option of options.options) {
      if (
        typeof option !== "object" ||
        option === null ||
        typeof option.value !== "string" ||
        option.value.length === 0 ||
        (option.label !== undefined && typeof option.label !== "string") ||
        (option.hint !== undefined && typeof option.hint !== "string")
      ) {
        throw promptError(
          "invalid-options",
          prompt,
          "Select choices must have valid string values",
        );
      }
      if (seen.has(option.value)) {
        throw promptError("invalid-options", prompt, `Duplicate select choice: ${option.value}`);
      }
      seen.add(option.value);
    }
    let selected = options.initialValue === undefined ? 0 : choices.indexOf(options.initialValue);
    if (selected < 0) {
      throw promptError(
        "invalid-options",
        prompt,
        `Unknown initial select value: ${String(options.initialValue)}`,
      );
    }
    const state = (status: PromptState["status"] = "active"): PromptState => ({
      kind: "select",
      message: options.message,
      status,
      choices: options.options.map(({ value, label, hint }, index) => ({
        value,
        label: label ?? value,
        ...(hint === undefined ? {} : { hint }),
        selected: index === selected,
      })),
    });
    const value = await this.#run<T>(
      prompt,
      state(),
      (_character, key) =>
        key.name === "return" || key.name === "enter"
          ? options.options[selected]!.value
          : undefined,
      (_character, key) => {
        if (key.name !== "up" && key.name !== "down") return undefined;
        selected =
          (selected + (key.name === "up" ? -1 : 1) + options.options.length) %
          options.options.length;
        return state();
      },
      () => state("submitted"),
    );
    return value;
  }

  async confirm(options: ConfirmOptions): Promise<boolean> {
    const prompt = details("confirm", options?.message);
    validateMessage("confirm", options?.message);
    if (options.initialValue !== undefined && typeof options.initialValue !== "boolean") {
      throw promptError("invalid-options", prompt, "Confirm initialValue must be a boolean");
    }
    let value = options.initialValue ?? false;
    const state = (status: PromptState["status"] = "active"): PromptState => ({
      kind: "confirm",
      message: options.message,
      status,
      value: value ? "yes" : "no",
      defaultValue:
        options.initialValue === undefined ? undefined : options.initialValue ? "yes" : "no",
    });
    const result = await this.#run<boolean>(
      prompt,
      state(),
      (character, key) => {
        if (key.name === "return" || key.name === "enter") return value;
        if (character.toLowerCase() === "y") return true;
        if (character.toLowerCase() === "n") return false;
        return undefined;
      },
      (character) => {
        if (character.toLowerCase() === "y") value = true;
        else if (character.toLowerCase() === "n") value = false;
        else return undefined;
        return state();
      },
      (result) => {
        value = result;
        return state("submitted");
      },
    );
    return result;
  }

  async text(options: TextOptions): Promise<string> {
    const prompt = details("text", options?.message);
    validateMessage("text", options?.message);
    if (options.placeholder !== undefined && typeof options.placeholder !== "string") {
      throw promptError("invalid-options", prompt, "Text placeholder must be a string");
    }
    if (options.validate !== undefined && typeof options.validate !== "function") {
      throw promptError("invalid-options", prompt, "Text validate must be a function");
    }
    let value = "";
    let validationError: string | undefined;
    const state = (
      status: PromptState["status"] = validationError ? "error" : "active",
    ): PromptState => ({
      kind: "text",
      message: options.message,
      status,
      value,
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      ...(validationError === undefined ? {} : { error: validationError }),
    });
    const result = await this.#run<string>(
      prompt,
      state(),
      (_character, key) => {
        if (key.name !== "return" && key.name !== "enter") return undefined;
        let error: string | undefined;
        try {
          error = options.validate?.(value);
        } catch (cause) {
          throw promptError("input-error", prompt, "Text validation failed", cause);
        }
        if (error !== undefined && typeof error !== "string") {
          throw promptError(
            "input-error",
            prompt,
            "Text validation must return a string or undefined",
          );
        }
        validationError = error;
        return error === undefined ? value : undefined;
      },
      (character, key) => {
        if (key.name === "return" || key.name === "enter") return state();
        validationError = undefined;
        if (key.name === "backspace") value = value.slice(0, -1);
        else if (!key.ctrl && !key.name?.startsWith("f") && character.length > 0)
          value += character;
        else return undefined;
        return state();
      },
      () => state("submitted"),
    );
    return result;
  }
}
