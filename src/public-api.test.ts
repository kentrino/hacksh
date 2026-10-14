import { describe, expect, expectTypeOf, it, vi } from "vite-plus/test";
import { z } from "zod";
import * as mini from "zod/mini";
import { defineCommand, parseArgs, renderUsage, showUsage, ZittyValidationError } from "./index.ts";

describe("public parsing API", () => {
  it("returns only validated zod output and awaits async validation", async () => {
    const command = defineCommand({
      args: z.object({
        count: z.coerce.number().transform(async (value) => value * 2),
        label: z.string().default("default"),
      }),
    });
    const parsed = parseArgs(command, ["--count", "3"]);
    expectTypeOf(parsed).toEqualTypeOf<Promise<{ count: number; label: string }>>();
    await expect(parsed).resolves.toEqual({ count: 6, label: "default" });
  });

  it("infers zod/mini output and throws existing validation errors", async () => {
    const command = defineCommand({
      args: mini.object({ value: mini._default(mini.string(), "mini") }),
    });
    const parsed = parseArgs(command, []);
    expectTypeOf(parsed).toEqualTypeOf<Promise<{ value: string }>>();
    await expect(parsed).resolves.toEqual({ value: "mini" });

    const invalid = defineCommand({ args: z.object({ count: z.coerce.number() }) });
    await expect(parseArgs(invalid, ["--count", "bad"])).rejects.toBeInstanceOf(
      ZittyValidationError,
    );
  });

  it("does not write output or exit", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exit = vi.spyOn(process, "exit");
    const command = defineCommand({ args: z.object({ value: z.string() }) });

    await expect(parseArgs(command, [])).rejects.toBeInstanceOf(ZittyValidationError);
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });
});

describe("public usage API", () => {
  it("shares rendering, supports async writers, and keeps rendering side-effect free", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exit = vi.spyOn(process, "exit");
    const command = defineCommand({
      name: "tool",
      args: z.object({ value: z.string().describe("A value") }),
    });

    const rendered = renderUsage(command);
    expectTypeOf(rendered).toEqualTypeOf<Promise<string>>();
    const text = await rendered;
    expect(text).toContain("USAGE tool [OPTIONS]");
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();

    const written: string[] = [];
    const result = showUsage(command, {
      async write(value) {
        await Promise.resolve();
        written.push(value);
      },
    });
    expectTypeOf(result).toEqualTypeOf<Promise<void>>();
    await result;
    expect(written).toEqual([text]);
  });

  it("writes to console.log by default", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await showUsage(defineCommand({ name: "tool" }));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("USAGE tool"));
  });
});
