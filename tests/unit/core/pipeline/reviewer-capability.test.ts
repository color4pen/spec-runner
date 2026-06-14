/**
 * T-03: Unit tests for descriptorHasReviewerInsertionPoint (pure predicate).
 * T-04: Alignment test — composer real output ⟺ guard predicate.
 *
 * T-03 verifies:
 *   - registry 3 descriptors: standard → true, fast → true, design-only → false
 *   - CONFORMANCE anchor: CONFORMANCE-present-without-code-review → true;
 *                         code-review-present-without-CONFORMANCE → false
 *   - id non-dependence: id="design-only" + CONFORMANCE-present → true;
 *                        id="standard" + CONFORMANCE-absent → false
 *
 * T-04 verifies:
 *   - For each descriptor in PIPELINE_REGISTRY, composeReviewerDescriptor is called
 *     with a fake reviewer and the fake's reachability in the composed output is
 *     compared against descriptorHasReviewerInsertionPoint(d).
 *   - The reachability check does NOT re-derive the CONFORMANCE anchor internally;
 *     it observes whether any base-descriptor step follows the fake reviewer in the
 *     composed steps list (pure positional observation from composer output).
 */
import { describe, it, expect } from "vitest";
import {
  descriptorHasReviewerInsertionPoint,
} from "../../../../src/core/pipeline/reviewer-capability.js";
import {
  STANDARD_DESCRIPTOR,
  FAST_DESCRIPTOR,
  DESIGN_ONLY_DESCRIPTOR,
  PIPELINE_REGISTRY,
} from "../../../../src/core/pipeline/registry.js";
import { composeReviewerDescriptor } from "../../../../src/core/pipeline/compose-reviewers.js";
import type { PipelineDescriptor } from "../../../../src/core/pipeline/types.js";
import type { ReviewerSnapshot } from "../../../../src/core/reviewers/types.js";
import { STEP_NAMES } from "../../../../src/core/step/step-names.js";

// ---------------------------------------------------------------------------
// T-03-1: registry 3 descriptors
// ---------------------------------------------------------------------------

describe("T-03-1: registry descriptors — true / true / false", () => {
  it("STANDARD_DESCRIPTOR has reviewer insertion point (CONFORMANCE present)", () => {
    expect(descriptorHasReviewerInsertionPoint(STANDARD_DESCRIPTOR)).toBe(true);
  });

  it("FAST_DESCRIPTOR has reviewer insertion point (CONFORMANCE present)", () => {
    expect(descriptorHasReviewerInsertionPoint(FAST_DESCRIPTOR)).toBe(true);
  });

  it("DESIGN_ONLY_DESCRIPTOR has no reviewer insertion point (CONFORMANCE absent)", () => {
    expect(descriptorHasReviewerInsertionPoint(DESIGN_ONLY_DESCRIPTOR)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T-03-2: anchor discrimination — CONFORMANCE, not code-review
// ---------------------------------------------------------------------------

describe("T-03-2: predicate follows CONFORMANCE anchor, not code-review", () => {
  it("steps with CONFORMANCE but no code-review → true", () => {
    // Build a synthetic descriptor: has CONFORMANCE but NOT code-review
    const synth: PipelineDescriptor = {
      ...STANDARD_DESCRIPTOR,
      steps: STANDARD_DESCRIPTOR.steps.filter(
        ([name]) => name !== STEP_NAMES.CODE_REVIEW,
      ),
    };
    // Verify our synthetic descriptor indeed lacks code-review
    expect(synth.steps.some(([n]) => n === STEP_NAMES.CODE_REVIEW)).toBe(false);
    // Must still have CONFORMANCE
    expect(synth.steps.some(([n]) => n === STEP_NAMES.CONFORMANCE)).toBe(true);

    expect(descriptorHasReviewerInsertionPoint(synth)).toBe(true);
  });

  it("steps with code-review but no CONFORMANCE → false", () => {
    // Build a synthetic descriptor: has code-review but NOT CONFORMANCE
    const synth: PipelineDescriptor = {
      ...STANDARD_DESCRIPTOR,
      steps: STANDARD_DESCRIPTOR.steps.filter(
        ([name]) => name !== STEP_NAMES.CONFORMANCE,
      ),
    };
    // Verify our synthetic descriptor indeed has code-review
    expect(synth.steps.some(([n]) => n === STEP_NAMES.CODE_REVIEW)).toBe(true);
    // Must lack CONFORMANCE
    expect(synth.steps.some(([n]) => n === STEP_NAMES.CONFORMANCE)).toBe(false);

    expect(descriptorHasReviewerInsertionPoint(synth)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T-03-3: id non-dependence — predicate must ignore descriptor.id
// ---------------------------------------------------------------------------

describe("T-03-3: predicate ignores descriptor.id (capability-derived, not name-derived)", () => {
  it("id='design-only' but steps include CONFORMANCE → true", () => {
    const synth: PipelineDescriptor = {
      ...STANDARD_DESCRIPTOR,
      id: "design-only", // identity of design-only, but standard's steps
    };
    expect(descriptorHasReviewerInsertionPoint(synth)).toBe(true);
  });

  it("id='standard' but steps lack CONFORMANCE → false", () => {
    const synth: PipelineDescriptor = {
      ...DESIGN_ONLY_DESCRIPTOR,
      id: "standard", // identity of standard, but design-only's steps (no CONFORMANCE)
    };
    expect(descriptorHasReviewerInsertionPoint(synth)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T-04: alignment test — composer real output ⟺ guard predicate
//
// For each descriptor in the registry, we:
//   1. Call composeReviewerDescriptor(d, [fake]) — real composer, no anchor re-derivation.
//   2. Find the fake reviewer's index in the composed steps list.
//   3. Determine "reachable": does any base-descriptor step follow the fake in composed output?
//      A base step following the fake means the fake is NOT appended to the tail → reachable.
//   4. Assert reachable === descriptorHasReviewerInsertionPoint(d).
//
// This test does NOT look for CONFORMANCE in the observation logic.  It purely observes
// whether the fake reviewer ends up before or after all base steps — an observable
// positional fact from the composer's output.  This prevents the X ⟺ X tautology.
// ---------------------------------------------------------------------------

describe("T-04: alignment — composeReviewerDescriptor real output ⟺ descriptorHasReviewerInsertionPoint", () => {
  const FAKE_REVIEWER_NAME = "align-fake";

  const fakeReviewer: ReviewerSnapshot = {
    name: FAKE_REVIEWER_NAME,
    maxIterations: 1,
    purpose: "p",
    criteria: "c",
    judgment: "j",
    freeText: "",
  };

  it("all registry descriptors: composer reachability matches guard predicate", () => {
    for (const [id, d] of Object.entries(PIPELINE_REGISTRY)) {
      const composed = composeReviewerDescriptor(d, [fakeReviewer]);

      const composedNames = composed.steps.map(([n]) => n);
      const fakeIdx = composedNames.indexOf(FAKE_REVIEWER_NAME);

      // fakeIdx must exist — composeReviewerDescriptor always inserts it
      expect(fakeIdx).toBeGreaterThanOrEqual(0);

      // Collect the base descriptor's step names (before composition)
      const baseNames = new Set(d.steps.map(([n]) => n));

      // Reachable = at least one base step follows the fake in composed output.
      // If the fake is inserted before CONFORMANCE: base steps like CONFORMANCE, adr-gen, pr-create
      // follow it → reachable.
      // If the fake is appended at the end (no CONFORMANCE anchor): no base step follows → not reachable.
      const reachable = composedNames.slice(fakeIdx + 1).some((n) => baseNames.has(n));

      expect(
        reachable,
        `descriptor "${id}": composer reachability (${reachable}) must match guard predicate (${descriptorHasReviewerInsertionPoint(d)})`,
      ).toBe(descriptorHasReviewerInsertionPoint(d));
    }
  });
});
