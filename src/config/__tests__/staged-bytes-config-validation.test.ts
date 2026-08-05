/**
 * Unit tests for pipeline.maxStagedBytes config field validation.
 *
 * Covers:
 *   TC-038 (must): invalid pipeline.maxStagedBytes values are rejected with CONFIG_INVALID
 *   TC-039 (must): valid and omitted pipeline.maxStagedBytes values validate successfully
 *                  without injecting defaults
 *
 * RED state: all tests fail until:
 *   - T-04: maxStagedBytes added to PipelineConfig in types.ts and validation.ts
 *
 * Mirror of staging-config-validation.test.ts style.
 * Do NOT modify staging-config-validation.test.ts.
 */

import { describe, it, expect } from "vitest";
import { validateConfig } from "../schema.js";

// ---------------------------------------------------------------------------
// TC-038: invalid pipeline.maxStagedBytes values are rejected with CONFIG_INVALID
// ---------------------------------------------------------------------------

describe("TC-038: invalid pipeline.maxStagedBytes values are rejected with CONFIG_INVALID", () => {
  it(
    // TC-038
    "TC-038: pipeline.maxStagedBytes: 0 throws CONFIG_INVALID",
    () => {
      // GIVEN a config with pipeline.maxStagedBytes: 0 (must be positive)
      const raw = {
        version: 1,
        agents: {},
        pipeline: {
          maxStagedBytes: 0,
        },
      };

      // WHEN the config is validated
      // THEN validation throws an error with code CONFIG_INVALID
      let caught: unknown;
      try {
        validateConfig(raw);
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeDefined();
      expect((caught as { code?: string }).code).toBe("CONFIG_INVALID");
    },
  );

  it(
    // TC-038
    "TC-038: pipeline.maxStagedBytes: -1 (negative) throws CONFIG_INVALID",
    () => {
      const raw = {
        version: 1,
        agents: {},
        pipeline: {
          maxStagedBytes: -1,
        },
      };

      let caught: unknown;
      try {
        validateConfig(raw);
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeDefined();
      expect((caught as { code?: string }).code).toBe("CONFIG_INVALID");
    },
  );

  it(
    // TC-038
    "TC-038: pipeline.maxStagedBytes: 1.5 (non-integer) throws CONFIG_INVALID",
    () => {
      const raw = {
        version: 1,
        agents: {},
        pipeline: {
          maxStagedBytes: 1.5,
        },
      };

      let caught: unknown;
      try {
        validateConfig(raw);
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeDefined();
      expect((caught as { code?: string }).code).toBe("CONFIG_INVALID");
    },
  );

  it(
    // TC-038
    "TC-038: pipeline.maxStagedBytes: -100 (large negative) throws CONFIG_INVALID",
    () => {
      const raw = {
        version: 1,
        agents: {},
        pipeline: {
          maxStagedBytes: -100,
        },
      };

      let caught: unknown;
      try {
        validateConfig(raw);
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeDefined();
      expect((caught as { code?: string }).code).toBe("CONFIG_INVALID");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-039: valid and omitted pipeline.maxStagedBytes values validate successfully
// ---------------------------------------------------------------------------

describe("TC-039: valid and omitted pipeline.maxStagedBytes values validate successfully without injecting defaults", () => {
  it(
    // TC-039
    "TC-039: valid pipeline.maxStagedBytes: 104857600 is accepted and preserved",
    () => {
      // GIVEN a config with pipeline.maxStagedBytes: 104857600 (100 MiB)
      const raw = {
        version: 1,
        agents: {},
        pipeline: {
          maxStagedBytes: 104_857_600,
        },
      };

      // WHEN the config is validated
      const cfg = validateConfig(raw);

      // THEN validation succeeds and the field is preserved
      expect(cfg.pipeline?.maxStagedBytes).toBe(104_857_600);
    },
  );

  it(
    // TC-039
    "TC-039: valid pipeline.maxStagedBytes: 1 (minimum positive integer) is accepted",
    () => {
      const raw = {
        version: 1,
        agents: {},
        pipeline: {
          maxStagedBytes: 1,
        },
      };

      const cfg = validateConfig(raw);
      expect(cfg.pipeline?.maxStagedBytes).toBe(1);
    },
  );

  it(
    // TC-039
    "TC-039: config omitting pipeline.maxStagedBytes validates unchanged — no default injected at config layer",
    () => {
      // GIVEN a config that omits pipeline.maxStagedBytes
      const raw = {
        version: 1,
        agents: {},
      };

      // WHEN the config is validated
      const cfg = validateConfig(raw);

      // THEN validation succeeds and the field is absent (no default injected)
      expect(cfg.pipeline?.maxStagedBytes).toBeUndefined();
    },
  );

  it(
    // TC-039
    "TC-039: config with empty pipeline block validates without injecting maxStagedBytes default",
    () => {
      const raw = {
        version: 1,
        agents: {},
        pipeline: {},
      };

      const cfg = validateConfig(raw);
      expect(cfg.pipeline?.maxStagedBytes).toBeUndefined();
    },
  );

  it(
    // TC-039
    "TC-039: maxStagedFiles and stagingExcludePatterns are unaffected when maxStagedBytes is set alongside",
    () => {
      // GIVEN all three fields set together
      const raw = {
        version: 1,
        agents: {},
        pipeline: {
          maxStagedFiles: 5000,
          maxStagedBytes: 104_857_600,
          stagingExcludePatterns: ["vendor/**"],
        },
      };

      // WHEN the config is validated
      const cfg = validateConfig(raw);

      // THEN all three fields are preserved
      expect(cfg.pipeline?.maxStagedFiles).toBe(5000);
      expect(cfg.pipeline?.maxStagedBytes).toBe(104_857_600);
      expect(cfg.pipeline?.stagingExcludePatterns).toEqual(["vendor/**"]);
    },
  );

  it(
    // TC-039
    "TC-039: existing pipeline fields (maxStagedFiles, stagingExcludePatterns) are unaffected when maxStagedBytes is omitted",
    () => {
      const raw = {
        version: 1,
        agents: {},
        pipeline: {
          maxStagedFiles: 2000,
          stagingExcludePatterns: [".cargo-tmp/**"],
        },
      };

      const cfg = validateConfig(raw);

      // Existing fields still present; new field absent
      expect(cfg.pipeline?.maxStagedFiles).toBe(2000);
      expect(cfg.pipeline?.stagingExcludePatterns).toEqual([".cargo-tmp/**"]);
      expect(cfg.pipeline?.maxStagedBytes).toBeUndefined();
    },
  );
});
