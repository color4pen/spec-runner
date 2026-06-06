/**
 * Unit tests for aggregateUsage and renderUsageSummary in usage-summary.ts
 *
 * TC-019: modelUsage が null の entry は aggregateUsage から除外される
 * TC-020: 複数 slug の bySlug 集計が正しく分離される
 * TC-021: 同一 step × model の token が複数 invocation で加算される
 * TC-022: renderUsageSummary の slug 行がアルファベット昇順に並ぶ
 * TC-023: step 内の model がコスト降順に並ぶ
 * TC-024: step の同点コスト時は step 名昇順に並ぶ
 * TC-025: skippedCount が 0 のとき skip 注記が出ない
 * TC-026: 未登録 model が 0 件のとき Total cost 行に除外注記が出ない
 * TC-027: ヘッダに archive entry 数が表示される
 * TC-028: grand total 行に全 model の token 合計が表示される
 * TC-001: job step の usage が step × model 行として出る (renderUsageSummary)
 * TC-002: stepName を持たない invocation は command 名でバケットされる
 * TC-003: slug 別集計が引き続き表示される
 * TC-004: 各集計行に cost 列が付く
 * TC-008: 未登録 model が $? で表示され total から除外される
 * TC-009: 高コスト step が先頭に並ぶ
 * TC-010: usage.json 不在 archive が skip される (not tested here — IO-level)
 */
import { describe, it, expect } from "vitest";
import { aggregateUsage, renderUsageSummary } from "../../../src/core/command/usage-summary.js";
import type { SlugUsage } from "../../../src/core/command/usage-summary.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInv(
  stepName: string | undefined,
  command: "job" | "request-review" | "request-generate",
  model: string,
  inputTokens: number,
  outputTokens: number = 0,
  cacheReadInputTokens: number = 0,
  cacheCreationInputTokens: number = 0,
) {
  return {
    command,
    timestamp: "2026-01-01T00:00:00.000Z",
    modelUsage: {
      [model]: { inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens },
    },
    ...(stepName !== undefined ? { stepName } : {}),
  };
}

function makeNullInv() {
  return {
    command: "job" as const,
    timestamp: "2026-01-01T00:00:00.000Z",
    modelUsage: null,
    stepName: "design",
  };
}

// ---------------------------------------------------------------------------
// aggregateUsage
// ---------------------------------------------------------------------------

describe("TC-019: modelUsage null entries are excluded from aggregation", () => {
  it("skips null-modelUsage invocations in byStepModel, bySlug, grandTotal", () => {
    const collected: SlugUsage[] = [
      {
        slug: "alpha",
        invocations: [
          makeNullInv(),
          makeInv("implementer", "job", "claude-sonnet-4-6", 100),
        ],
      },
    ];
    const agg = aggregateUsage(collected);
    // Only the non-null invocation should appear
    expect(agg.byStepModel["implementer"]).toBeDefined();
    expect(agg.byStepModel["design"]).toBeUndefined();
    expect(agg.grandTotal["claude-sonnet-4-6"]?.inputTokens).toBe(100);
  });
});

describe("TC-020: multiple slugs are aggregated separately in bySlug", () => {
  it("alpha and beta totals do not bleed into each other", () => {
    const collected: SlugUsage[] = [
      {
        slug: "alpha",
        invocations: [makeInv("implementer", "job", "claude-sonnet-4-6", 200)],
      },
      {
        slug: "beta",
        invocations: [makeInv("implementer", "job", "claude-sonnet-4-6", 300)],
      },
    ];
    const agg = aggregateUsage(collected);
    expect(agg.bySlug["alpha"]?.["claude-sonnet-4-6"]?.inputTokens).toBe(200);
    expect(agg.bySlug["beta"]?.["claude-sonnet-4-6"]?.inputTokens).toBe(300);
  });
});

describe("TC-021: same step×model accumulates across multiple invocations", () => {
  it("sums inputTokens across 2 invocations for the same step and model", () => {
    const collected: SlugUsage[] = [
      {
        slug: "alpha",
        invocations: [
          makeInv("implementer", "job", "claude-sonnet-4-6", 100),
          makeInv("implementer", "job", "claude-sonnet-4-6", 100),
        ],
      },
    ];
    const agg = aggregateUsage(collected);
    expect(agg.byStepModel["implementer"]?.["claude-sonnet-4-6"]?.inputTokens).toBe(200);
  });
});

describe("aggregateUsage — stepName absent uses command name as step key", () => {
  it("places request-review invocation under 'request-review' step key", () => {
    const inv = {
      command: "request-review" as const,
      timestamp: "2026-01-01T00:00:00.000Z",
      modelUsage: {
        "claude-haiku-4-5": { inputTokens: 50, outputTokens: 10, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
      },
      // no stepName
    };
    const collected: SlugUsage[] = [{ slug: "alpha", invocations: [inv] }];
    const agg = aggregateUsage(collected);
    expect(agg.byStepModel["request-review"]).toBeDefined();
    expect(agg.byStepModel["request-review"]?.["claude-haiku-4-5"]?.inputTokens).toBe(50);
  });
});

describe("aggregateUsage — entryCount equals number of SlugUsage entries", () => {
  it("returns entryCount equal to length of collected array", () => {
    const collected: SlugUsage[] = [
      { slug: "alpha", invocations: [makeInv("design", "job", "claude-sonnet-4-6", 10)] },
      { slug: "beta", invocations: [makeInv("design", "job", "claude-sonnet-4-6", 20)] },
      { slug: "gamma", invocations: [makeInv("design", "job", "claude-sonnet-4-6", 30)] },
    ];
    const agg = aggregateUsage(collected);
    expect(agg.entryCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// renderUsageSummary
// ---------------------------------------------------------------------------

function makeSimpleAgg(): ReturnType<typeof aggregateUsage> {
  const collected: SlugUsage[] = [
    {
      slug: "zebra",
      invocations: [makeInv("implementer", "job", "claude-sonnet-4-6", 1_000_000, 1_000_000)],
    },
    {
      slug: "alpha",
      invocations: [makeInv("design", "job", "claude-haiku-4-5", 500_000, 200_000)],
    },
  ];
  return aggregateUsage(collected);
}

describe("TC-022: slug rows are sorted alphabetically ascending", () => {
  it("'alpha' appears before 'zebra' in By slug section", () => {
    const agg = makeSimpleAgg();
    const output = renderUsageSummary(agg, 0);
    const slugSection = output.slice(output.indexOf("By slug:"), output.indexOf("By step"));
    const alphaPos = slugSection.indexOf("alpha:");
    const zebraPos = slugSection.indexOf("zebra:");
    expect(alphaPos).toBeGreaterThanOrEqual(0);
    expect(zebraPos).toBeGreaterThan(alphaPos);
  });
});

describe("TC-027: header includes archive entry count", () => {
  it("first line contains '2 archive entries'", () => {
    const agg = makeSimpleAgg();
    const output = renderUsageSummary(agg, 0);
    expect(output).toContain("2 archive entries");
  });
});

describe("TC-003: slug section still appears in output", () => {
  it("output contains 'By slug:' section with slug names and model lines", () => {
    const agg = makeSimpleAgg();
    const output = renderUsageSummary(agg, 0);
    expect(output).toContain("By slug:");
    expect(output).toContain("alpha:");
    expect(output).toContain("zebra:");
    // Model lines should contain in/out tokens
    expect(output).toContain("in=");
    expect(output).toContain("out=");
  });
});

describe("TC-001: job step usage appears in By step × model section", () => {
  it("output contains 'By step × model:' and implementer step", () => {
    const collected: SlugUsage[] = [
      {
        slug: "slug-a",
        invocations: [makeInv("implementer", "job", "claude-opus-4-6[1m]", 1000, 500)],
      },
    ];
    const agg = aggregateUsage(collected);
    const output = renderUsageSummary(agg, 0);
    expect(output).toContain("By step × model:");
    expect(output).toContain("implementer:");
    expect(output).toContain("claude-opus-4-6[1m]");
  });
});

describe("TC-002: stepName-absent invocation appears under command name", () => {
  it("request-review step key appears in By step × model section", () => {
    const inv = {
      command: "request-review" as const,
      timestamp: "2026-01-01T00:00:00.000Z",
      modelUsage: {
        "claude-haiku-4-5": { inputTokens: 100, outputTokens: 50, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
      },
    };
    const agg = aggregateUsage([{ slug: "s", invocations: [inv] }]);
    const output = renderUsageSummary(agg, 0);
    expect(output).toContain("request-review:");
    expect(output).toContain("claude-haiku-4-5");
  });
});

describe("TC-004: all summary lines include cost= column", () => {
  it("slug lines and grand total lines contain 'cost='", () => {
    const agg = makeSimpleAgg();
    const output = renderUsageSummary(agg, 0);
    // Count cost= occurrences — should be in slug model lines, step model lines, grand total lines
    const matches = output.match(/cost=\$/g) ?? [];
    expect(matches.length).toBeGreaterThan(0);
  });

  it("step×model lines contain 'cost='", () => {
    const agg = makeSimpleAgg();
    const output = renderUsageSummary(agg, 0);
    const stepSection = output.slice(output.indexOf("By step × model:"));
    expect(stepSection).toContain("cost=");
  });
});

describe("TC-008: unknown model shows $? and is excluded from Total cost", () => {
  it("unregistered model row shows cost=$? and Total cost has excludes note", () => {
    const collected: SlugUsage[] = [
      {
        slug: "s",
        invocations: [
          makeInv("implementer", "job", "gpt-99-turbo-unknown", 1_000_000, 1_000_000),
          makeInv("implementer", "job", "claude-sonnet-4-6", 1_000_000, 1_000_000),
        ],
      },
    ];
    const agg = aggregateUsage(collected);
    const output = renderUsageSummary(agg, 0);
    expect(output).toContain("cost=$?");
    expect(output).toContain("excludes 1 unpriced model(s)");
  });
});

describe("TC-009: high-cost step appears first in By step × model", () => {
  it("expensive step is listed before cheap step", () => {
    // implementer: uses opus (expensive), design: uses haiku (cheap)
    const collected: SlugUsage[] = [
      {
        slug: "s",
        invocations: [
          makeInv("design", "job", "claude-haiku-4-5", 1_000, 500),
          makeInv("implementer", "job", "claude-opus-4-6", 1_000_000, 1_000_000),
        ],
      },
    ];
    const agg = aggregateUsage(collected);
    const output = renderUsageSummary(agg, 0);
    const stepSectionStart = output.indexOf("By step × model:");
    const grandTotalStart = output.indexOf("Grand Total:");
    const stepSection = output.slice(stepSectionStart, grandTotalStart);
    const implPos = stepSection.indexOf("implementer:");
    const designPos = stepSection.indexOf("design:");
    expect(implPos).toBeGreaterThanOrEqual(0);
    expect(designPos).toBeGreaterThan(implPos);
  });
});

describe("TC-023: model rows within a step are sorted by cost descending", () => {
  it("expensive model appears before cheap model within a step", () => {
    const collected: SlugUsage[] = [
      {
        slug: "s",
        invocations: [
          makeInv("implementer", "job", "claude-haiku-4-5", 1_000, 500),
          makeInv("implementer", "job", "claude-opus-4-6", 1_000_000, 1_000_000),
        ],
      },
    ];
    const agg = aggregateUsage(collected);
    const output = renderUsageSummary(agg, 0);
    const stepSection = output.slice(
      output.indexOf("implementer:"),
      output.indexOf("\n", output.indexOf("implementer:") + 15) + 200,
    );
    const opusPos = stepSection.indexOf("claude-opus-4-6");
    const haikuPos = stepSection.indexOf("claude-haiku-4-5");
    expect(opusPos).toBeGreaterThanOrEqual(0);
    expect(haikuPos).toBeGreaterThan(opusPos);
  });
});

describe("TC-024: equal-cost steps sorted by step name ascending", () => {
  it("'a-step' appears before 'z-step' when costs are equal", () => {
    // Use the same model+tokens for both steps → equal cost
    const collected: SlugUsage[] = [
      {
        slug: "s",
        invocations: [
          makeInv("z-step", "job", "claude-haiku-4-5", 100, 50),
          makeInv("a-step", "job", "claude-haiku-4-5", 100, 50),
        ],
      },
    ];
    const agg = aggregateUsage(collected);
    const output = renderUsageSummary(agg, 0);
    const stepSectionStart = output.indexOf("By step × model:");
    const grandTotalStart = output.indexOf("Grand Total:");
    const stepSection = output.slice(stepSectionStart, grandTotalStart);
    const aPos = stepSection.indexOf("a-step:");
    const zPos = stepSection.indexOf("z-step:");
    expect(aPos).toBeGreaterThanOrEqual(0);
    expect(zPos).toBeGreaterThan(aPos);
  });
});

describe("TC-025: skippedCount=0 produces no skip note", () => {
  it("output does not contain 'skipped' when skippedCount is 0", () => {
    const agg = makeSimpleAgg();
    const output = renderUsageSummary(agg, 0);
    expect(output).not.toContain("skipped");
  });
});

describe("TC-026: no unpriced models means no 'excludes' note in Total cost", () => {
  it("Total cost line has no 'excludes' when all models are priced", () => {
    const collected: SlugUsage[] = [
      {
        slug: "s",
        invocations: [makeInv("design", "job", "claude-sonnet-4-6", 1000, 500)],
      },
    ];
    const agg = aggregateUsage(collected);
    const output = renderUsageSummary(agg, 0);
    const totalLine = output.split("\n").find((l) => l.startsWith("Total cost:")) ?? "";
    expect(totalLine).not.toContain("excludes");
  });
});

describe("TC-028: grand total shows per-model token totals", () => {
  it("Grand Total section contains model name and in/out tokens", () => {
    const collected: SlugUsage[] = [
      {
        slug: "s",
        invocations: [
          makeInv("design", "job", "claude-sonnet-4-6", 1_000_000, 500_000),
          makeInv("implementer", "job", "claude-haiku-4-5", 200_000, 100_000),
        ],
      },
    ];
    const agg = aggregateUsage(collected);
    const output = renderUsageSummary(agg, 0);
    const gtSection = output.slice(output.indexOf("Grand Total:"));
    expect(gtSection).toContain("claude-sonnet-4-6");
    expect(gtSection).toContain("claude-haiku-4-5");
    expect(gtSection).toContain("in=1000000");
    expect(gtSection).toContain("in=200000");
  });
});

describe("renderUsageSummary — skipped note when skippedCount > 0", () => {
  it("appends skip note at the end", () => {
    const agg = makeSimpleAgg();
    const output = renderUsageSummary(agg, 3);
    expect(output).toContain("(3 archive entries skipped — no usage.json)");
  });
});
