import { describe, expect, it } from "vitest";
import * as savedViews from "../../packages/core/src/views/index";

describe("saved views client boundary", () => {
  it("keeps the client-facing views entrypoint free of server-only parser exports", () => {
    expect(savedViews).not.toHaveProperty("parseSavedQcViews");
    expect(savedViews).toHaveProperty("applySavedQcView");
    expect(savedViews).toHaveProperty("resolveSavedQcViews");
  });
});
