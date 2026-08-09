# Regression Gate Result — Iteration 002

## Summary

All 3 findings from the ledger verified. No regressions detected.

---

## Finding 1 — [LOW] ProviderDefaults コメントの design.ts:12 行参照が stale

**File**: src/config/model-registry.ts:51  
**Status**: FIXED ✅

Current text at lines 51–53:
```
 * anthropic: designModel is omitted intentionally — design.ts already hard-codes
 * claude-opus-5 as its built-in default, so omitting preserves legacy scaffold
 * byte-equality (no extra `steps.design` block written to config).
```

The stale `:12` line reference is gone. The comment now reads `design.ts already hard-codes` without any line number — no regression.

---

## Finding 2 — [LOW] ADR 内の旧モデル名（scope 外・historical 記録）

**File**: specrunner/adr/2026-05-26-project-config-overlay.md:74  
**Status**: STILL PRESENT (scope 外のため対応不要)

Both ADR files retain old model names:

- `2026-05-26-project-config-overlay.md` lines 74, 76, 78, 82, 84, 85, 143: `claude-sonnet-4-6`, `claude-opus-4-6[1m]`
- `2026-06-12-provider-neutral-pricing-table.md` lines 12, 48, 100, 124: `claude-sonnet-4-5`, `claude-sonnet-4-6`

This was never expected to be fixed — the finding rationale explicitly marks them as historical ADR content outside the acceptance-criteria grep scope (`src/` のみ対象). No change occurred; not a regression.

---

## Finding 3 — [MEDIUM] byRequestType config 例が新既定モデルと乖離

**File**: specrunner/project.md:103  
**Status**: FIXED ✅

Current byRequestType 設定例 (lines 99–120):
```jsonc
{
  "version": 1,
  "steps": {
    "defaults": { "model": "claude-sonnet-5" },
    "design": {
      "model": "claude-sonnet-5",
      "byRequestType": {
        "spec-change": { "model": "claude-opus-5" },
        "new-feature": { "model": "claude-opus-5" }
      }
    },
    "code-review": {
      "model": "claude-sonnet-5",
      "byRequestType": {
        "spec-change": { "model": "claude-opus-5" }
      }
    }
  }
}
```

`claude-sonnet-4-6` and `claude-opus-4-6[1m]` are replaced by `claude-sonnet-5` and `claude-opus-5` throughout. No regression.

---

## Verdict

No regressions. All fixed findings remain fixed. Finding 2 remains present as scope-out historical content (expected).
