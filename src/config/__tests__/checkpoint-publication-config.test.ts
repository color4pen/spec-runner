import { describe, expect, it } from "vitest";
import { validateConfig } from "../schema.js";

const config = (value: unknown) => ({
  version: 1,
  agents: {},
  pipeline: { publishCheckpointOnHalt: value },
});

describe("pipeline.publishCheckpointOnHalt", () => {
  it.each([true, false])("TC-027 accepts boolean %s", (value) => {
    expect(validateConfig(config(value)).pipeline?.publishCheckpointOnHalt).toBe(value);
  });

  it.each(["true", 1, null])("TC-027 rejects non-boolean %s", (value) => {
    expect(() => validateConfig(config(value))).toThrow();
  });
});
