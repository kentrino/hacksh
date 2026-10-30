import { emitKeypressEvents } from "node:readline";
import { PassThrough } from "node:stream";
import type { HackshPromptErrorReason, PromptErrorDetails, PromptKind } from "./errors.ts";
import { HackshPromptError } from "./errors.ts";
import type {
  AutocompletePromptState,
  ConfirmPromptState,
  Printer,
  PromptState,
  PromptStatus,
  SelectPromptState,
  TerminalInput,
  TextPromptState,
  WaitPromptState,
} from "./printer.ts";
import { TerminalLock } from "./terminal.ts";

export interface SelectOption<T extends string> {
  value: T;
  label?: string;
  hint?: string;
}

interface ChoiceOptions<TItem extends SelectOption<string>> {
  message: string;
  options: readonly TItem[];
  sortBy?: (item: NoInfer<TItem>) => string | number;
}

export interface SelectOptions<TItem extends SelectOption<string>> extends ChoiceOptions<TItem> {
  initialValue?: NoInfer<TItem["value"]>;
}

export interface AutocompleteOptions<
  TItem extends SelectOption<string>,
> extends ChoiceOptions<TItem> {
  placeholder?: string;
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

export interface WaitOptions {
  message?: string;
}

export interface Prompter {
  select<const TItem extends SelectOption<string>>(
    options: SelectOptions<TItem>,
  ): Promise<TItem["value"]>;
  autocomplete<const TItem extends SelectOption<string>>(
    options: AutocompleteOptions<TItem>,
  ): Promise<TItem["value"]>;
  confirm(options: ConfirmOptions): Promise<boolean>;
  text(options: TextOptions): Promise<string>;
  wait<T>(work: () => T | Promise<T>, options?: WaitOptions): Promise<T>;
}

interface Key {
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
  sequence?: string;
}

interface PromptControllerOptions {
  interactive: boolean;
  input: TerminalInput;
  print(event: Parameters<Printer["print"]>[0]): Promise<void>;
  terminal: TerminalLock;
  signal: AbortSignal;
}

interface BufferedKeypress {
  character: string | undefined;
  key: Key;
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

function validateChoices<TItem extends SelectOption<string>>(
  kind: "select" | "autocomplete",
  options: ChoiceOptions<TItem>,
): PromptErrorDetails {
  const choices = Array.isArray(options?.options)
    ? options.options.map((option) =>
        typeof option === "object" && option !== null && typeof option.value === "string"
          ? option.value
          : "[Invalid choice]",
      )
    : [];
  const prompt = details(kind, options?.message, choices);
  validateMessage(kind, options?.message, choices);
  if (!Array.isArray(options.options) || options.options.length === 0) {
    throw promptError("invalid-options", prompt, `A ${kind} prompt requires at least one choice`);
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
        `${kind === "select" ? "Select" : "Autocomplete"} choices must have valid string values`,
      );
    }
    if (seen.has(option.value)) {
      throw promptError("invalid-options", prompt, `Duplicate ${kind} choice: ${option.value}`);
    }
    seen.add(option.value);
  }
  return prompt;
}

function sortedChoices<TItem extends SelectOption<string>>(
  options: ChoiceOptions<TItem>,
  prompt: PromptErrorDetails,
): readonly TItem[] {
  const { sortBy } = options;
  if (sortBy === undefined) return options.options;
  if (typeof sortBy !== "function") {
    throw promptError("invalid-options", prompt, "sortBy must be a function");
  }
  let keyType: "string" | "number" | undefined;
  const keyed = options.options.map((item) => {
    let key: string | number;
    try {
      key = sortBy(item);
    } catch (cause) {
      throw promptError("input-error", prompt, "Choice sort key could not be computed", cause);
    }
    if (typeof key !== "string" && (typeof key !== "number" || Number.isNaN(key))) {
      throw promptError(
        "invalid-options",
        prompt,
        "sortBy must return a string or a non-NaN number",
      );
    }
    const type = typeof key as "string" | "number";
    if (keyType !== undefined && keyType !== type) {
      throw promptError("invalid-options", prompt, "sortBy keys must all have the same type");
    }
    keyType = type;
    return { item, key };
  });
  // Array.sort is stable; sorting cached keys never calls user code in the comparator.
  keyed.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return keyed.map(({ item }) => item);
}

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function asInput(value: TerminalInput, prompt: PromptErrorDetails): TerminalInput {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof Reflect.get(value, "on") !== "function" ||
    typeof Reflect.get(value, "removeListener") !== "function" ||
    typeof Reflect.get(value, "resume") !== "function" ||
    typeof Reflect.get(value, "pause") !== "function"
  ) {
    throw promptError("input-error", prompt, "Interactive input is not a readable stream");
  }
  return value;
}

export class PromptController implements Prompter {
  readonly #interactive: boolean;
  readonly #inputValue: TerminalInput;
  readonly #printEvent: PromptControllerOptions["print"];
  readonly #bufferedKeys: BufferedKeypress[] = [];
  readonly #terminal: TerminalLock;
  readonly #signal: AbortSignal;

  constructor(options: PromptControllerOptions) {
    this.#interactive = options.interactive;
    this.#inputValue = options.input;
    this.#printEvent = (event) => options.print(event);
    this.#terminal = options.terminal;
    this.#signal = options.signal;
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
    closed: () => PromptState,
    cancelOnEscape: () => boolean = () => true,
  ): Promise<T> {
    if (!this.#interactive) {
      throw promptError(
        "non-interactive",
        prompt,
        `Cannot request ${prompt.kind} input in non-interactive mode: ${prompt.message}`,
      );
    }
    if (this.#signal.aborted) {
      throw promptError("aborted", prompt, "Prompt aborted", this.#signal.reason);
    }
    const input = asInput(this.#inputValue, prompt);
    if (!this.#terminal.acquire("prompt")) {
      throw promptError(
        "overlapping",
        prompt,
        this.#terminal.owner === "exec"
          ? "A command is using the terminal"
          : "Another prompt is already active",
      );
    }
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
        let draining = false;
        let finalized = false;
        let completion: (() => void) | undefined;
        const queuedKeys = this.#bufferedKeys.splice(0);
        const finalize = (): void => {
          if (finalized || !settled || draining) return;
          finalized = true;
          cleanup();
          completion?.();
        };
        const finish = (action: () => void): void => {
          if (settled) return;
          settled = true;
          completion = action;
          finalize();
        };
        const fail = (reason: HackshPromptErrorReason, message: string, cause?: unknown): void => {
          finish(() => reject(promptError(reason, prompt, message, cause)));
        };
        const handleKeypress = async (
          character: string | undefined,
          key: Key = {},
        ): Promise<void> => {
          if (settled) return;
          if ((key.ctrl && key.name === "c") || (key.name === "escape" && cancelOnEscape())) {
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
        const drainKeys = async (): Promise<void> => {
          if (draining || finalized) return;
          draining = true;
          try {
            while (queuedKeys.length > 0) {
              if (settled) {
                this.#bufferedKeys.push(...queuedKeys.splice(0));
                break;
              }
              const next = queuedKeys.shift()!;
              await handleKeypress(next.character, next.key);
            }
          } finally {
            draining = false;
            finalize();
          }
        };
        const onKeypress = (character: string | undefined, key: Key = {}): void => {
          queuedKeys.push({ character, key });
          void drainKeys().catch((cause: unknown) =>
            fail("input-error", "Prompt input could not be processed", cause),
          );
        };
        const onEnd = (): void => fail("eof", "Prompt input ended before a value was submitted");
        const onError = (cause: unknown): void => fail("input-error", "Prompt input failed", cause);
        const onAbort = (): void => fail("aborted", "Prompt aborted", this.#signal.reason);
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
          this.#signal.removeEventListener("abort", onAbort);
        };
        keypressInput.on("keypress", onKeypress);
        input.on("data", onData as (...args: never[]) => void);
        input.on("end", onEnd as (...args: never[]) => void);
        input.on("close", onEnd as (...args: never[]) => void);
        input.on("error", onError as (...args: never[]) => void);
        this.#signal.addEventListener("abort", onAbort, { once: true });
        if (this.#signal.aborted) onAbort();
        input.resume();
        void drainKeys().catch((cause: unknown) =>
          fail("input-error", "Prompt input could not be processed", cause),
        );
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
      if (!originallyFlowing) input.pause();
    } catch (cause) {
      restoreError = promptError(
        "input-error",
        prompt,
        "Prompt input could not be restored",
        cause,
      );
    }
    const closeWithFailure = async (failure: unknown): Promise<never> => {
      try {
        await this.#print(closed(), prompt);
      } catch {
        // Preserve the error that terminated the prompt, including an earlier printer failure.
      } finally {
        this.#terminal.release();
      }
      throw failure;
    };
    if (restoreError) return closeWithFailure(restoreError);
    if (!outcome.ok) return closeWithFailure(outcome.error);
    try {
      await this.#print(submitted(outcome.value), prompt);
      return outcome.value;
    } catch (error) {
      try {
        await this.#print(closed(), prompt);
      } catch {
        // The submitted-state failure remains the primary error.
      }
      throw error;
    } finally {
      this.#terminal.release();
    }
  }

  async wait<T>(work: () => T | Promise<T>, options?: WaitOptions): Promise<T> {
    const message = options?.message === undefined ? "待機中" : options.message;
    const prompt = details("wait", message);
    validateMessage("wait", message);
    if (typeof work !== "function") {
      throw promptError("invalid-options", prompt, "Wait work must be a function");
    }
    if (this.#signal.aborted) {
      throw promptError("aborted", prompt, "Prompt aborted", this.#signal.reason);
    }
    if (!this.#terminal.acquire("prompt")) {
      throw promptError(
        "overlapping",
        prompt,
        this.#terminal.owner === "exec"
          ? "A command is using the terminal"
          : "Another prompt is already active",
      );
    }

    let frame = 0;
    let stopped = false;
    let timer: NodeJS.Timeout | undefined;
    let rendering = Promise.resolve();
    let closing: Promise<void> | undefined;
    let failure: unknown;
    const state = (status: PromptStatus): WaitPromptState => ({
      kind: "wait",
      message,
      status,
      ...(this.#interactive ? { frame } : {}),
    });
    const recordFailure = (error: unknown): void => {
      failure ??= error;
    };
    const close = (): Promise<void> => {
      stopped = true;
      clearTimeout(timer);
      timer = undefined;
      closing ??= rendering.then(() => this.#print(state("closed"), prompt)).catch(recordFailure);
      return closing;
    };
    const tick = (): void => {
      timer = undefined;
      frame += 1;
      rendering = rendering
        .then(() => this.#print(state("active"), prompt))
        .then(
          () => {
            if (!stopped) timer = setTimeout(tick, 80);
          },
          (error: unknown) => {
            recordFailure(error);
            void close();
          },
        );
    };
    const onAbort = (): void => {
      recordFailure(promptError("aborted", prompt, "Prompt aborted", this.#signal.reason));
      void close();
    };
    let outcome: { ok: true; value: T } | { ok: false; error: unknown };
    try {
      rendering = rendering.then(() => this.#print(state("active"), prompt)).catch(recordFailure);
      this.#signal.addEventListener("abort", onAbort, { once: true });
      if (this.#signal.aborted) onAbort();
      await rendering;
      if (failure !== undefined) throw failure;
      if (this.#interactive) timer = setTimeout(tick, 80);
      outcome = { ok: true, value: await work() };
    } catch (error) {
      outcome = { ok: false, error };
    } finally {
      try {
        await close();
      } finally {
        this.#signal.removeEventListener("abort", onAbort);
        this.#terminal.release();
      }
    }
    // The callback remains awaited even after abort or a failed redraw, and its error wins.
    if (!outcome.ok) throw outcome.error;
    if (failure !== undefined) throw failure;
    return outcome.value;
  }

  async select<const TItem extends SelectOption<string>>(
    options: SelectOptions<TItem>,
  ): Promise<TItem["value"]> {
    const prompt = validateChoices("select", options);
    const choices = sortedChoices(options, prompt);
    let selected =
      options.initialValue === undefined
        ? 0
        : choices.findIndex(({ value }) => value === options.initialValue);
    if (selected < 0) {
      throw promptError(
        "invalid-options",
        prompt,
        `Unknown initial select value: ${String(options.initialValue)}`,
      );
    }
    const state = (status: PromptStatus = "active"): SelectPromptState => ({
      kind: "select",
      message: options.message,
      status,
      value: choices[selected]!.value,
      choices: choices.map(({ value, label, hint }, index) => ({
        value,
        label: label ?? value,
        ...(hint === undefined ? {} : { hint }),
        selected: index === selected,
      })),
    });
    const value = await this.#run<TItem["value"]>(
      prompt,
      state(),
      (_character, key) =>
        key.name === "return" || key.name === "enter" ? choices[selected]!.value : undefined,
      (_character, key) => {
        if (key.name !== "up" && key.name !== "down") return undefined;
        selected = (selected + (key.name === "up" ? -1 : 1) + choices.length) % choices.length;
        return state();
      },
      () => state("submitted"),
      () => state("closed"),
    );
    return value;
  }

  async autocomplete<const TItem extends SelectOption<string>>(
    options: AutocompleteOptions<TItem>,
  ): Promise<TItem["value"]> {
    const prompt = validateChoices("autocomplete", options);
    if (options.placeholder !== undefined && typeof options.placeholder !== "string") {
      throw promptError("invalid-options", prompt, "Autocomplete placeholder must be a string");
    }
    const choices = sortedChoices(options, prompt);
    let query = "";
    let selected = -1;
    let filtered = choices;
    const state = (status: PromptStatus = "active"): AutocompletePromptState => ({
      kind: "autocomplete",
      message: options.message,
      status,
      query,
      phase: selected < 0 ? "input" : "select",
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      ...(selected < 0 ? {} : { value: filtered[selected]!.value }),
      choices: filtered.map(({ value, label, hint }, index) => ({
        value,
        label: label ?? value,
        ...(hint === undefined ? {} : { hint }),
        selected: index === selected,
      })),
    });
    return await this.#run<TItem["value"]>(
      prompt,
      state(),
      (_character, key) =>
        selected >= 0 && (key.name === "return" || key.name === "enter")
          ? filtered[selected]!.value
          : undefined,
      (character, key) => {
        if (key.name === "down") {
          if (selected >= filtered.length - 1) return undefined;
          selected += 1;
        } else if (key.name === "up") {
          if (selected < 0) return undefined;
          selected -= 1;
        } else if (key.name === "escape") {
          selected = -1;
        } else {
          if (key.name === "backspace") {
            const last = graphemeSegmenter.segment(query).containing(query.length - 1);
            query = last === undefined ? "" : query.slice(0, last.index);
          } else if (!key.ctrl && !key.meta && character.length > 0 && !/\p{Cc}/u.test(character)) {
            query += character;
          } else return undefined;
          selected = -1;
          const search = query.toLowerCase();
          filtered =
            search.length === 0
              ? choices
              : choices.filter(({ value, label }) =>
                  (label ?? value).toLowerCase().includes(search),
                );
        }
        return state();
      },
      () => state("submitted"),
      () => state("closed"),
      () => selected < 0,
    );
  }

  async confirm(options: ConfirmOptions): Promise<boolean> {
    const prompt = details("confirm", options?.message);
    validateMessage("confirm", options?.message);
    if (options.initialValue !== undefined && typeof options.initialValue !== "boolean") {
      throw promptError("invalid-options", prompt, "Confirm initialValue must be a boolean");
    }
    const value = options.initialValue ?? false;
    const state = (result: boolean, status: PromptStatus = "active"): ConfirmPromptState => ({
      kind: "confirm",
      message: options.message,
      status,
      value: result,
      ...(options.initialValue === undefined ? {} : { defaultValue: options.initialValue }),
    });
    const result = await this.#run<boolean>(
      prompt,
      state(value),
      (character, key) => {
        if (key.name === "return" || key.name === "enter") return value;
        if (character.toLowerCase() === "y") return true;
        if (character.toLowerCase() === "n") return false;
        return undefined;
      },
      () => undefined,
      (submitted) => state(submitted, "submitted"),
      () => state(value, "closed"),
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
      status: PromptStatus = validationError ? "error" : "active",
    ): TextPromptState => ({
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
        validationError = error || undefined;
        return validationError === undefined ? value : undefined;
      },
      (character, key) => {
        if (key.name === "return" || key.name === "enter") return state();
        validationError = undefined;
        if (key.name === "backspace") value = Array.from(value).slice(0, -1).join("");
        else if (!key.ctrl && !key.meta && character.length > 0) value += character;
        else return undefined;
        return state();
      },
      () => state("submitted"),
      () => state("closed"),
    );
    return result;
  }
}
