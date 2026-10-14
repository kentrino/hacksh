import { describe, expect, it } from "vite-plus/test";
import { greet } from "./index.ts";

describe("greet", () => {
  it("greets by name", () => {
    expect(greet("zitty")).toBe("Hello, zitty!");
  });
});
