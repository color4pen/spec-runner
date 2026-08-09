# Regression Gate Result — anthropic-step-model-refresh — iter 1

## Findings Ledger Verification

### Finding 1: [LOW] ProviderDefaults コメントの design.ts:12 行参照が stale

**File**: src/config/model-registry.ts  
**Status**: ✅ FIXED

現行コード（行 48–53）:
```
anthropic: designModel is omitted intentionally — design.ts already hard-codes
claude-opus-5 as its built-in default, so omitting preserves legacy scaffold
byte-equality (no extra `steps.design` block written to config).
```

`design.ts:12` という stale な行参照は存在しない。code-review-feedback-001 行 55 でも「stale な行参照が `design.ts` に修正されている」と確認済み。回帰なし。

---

### Finding 2: [LOW] ADR 内の旧モデル名（scope 外・historical 記録）

**File**: specrunner/adr/2026-05-26-project-config-overlay.md, specrunner/adr/2026-06-12-provider-neutral-pricing-table.md  
**Status**: ⚠️ STILL PRESENT（未修正・scope 外）

- `specrunner/adr/2026-05-26-project-config-overlay.md` 行 74–84: `claude-sonnet-4-6` / `claude-opus-4-6[1m]` が config 例コードブロック内に存在
- `specrunner/adr/2026-06-12-provider-neutral-pricing-table.md` 行 100: `claude-sonnet-4-6` が存在

これらは historical ADR であり、受け入れ基準 grep の対象（`src/`）外。実装への影響なし。本変更のスコープ外で意図的に未修正。

---

### Finding 3: [MEDIUM] byRequestType config 例が新既定モデルと乖離している

**File**: specrunner/project.md  
**Status**: ⚠️ STILL PRESENT（未修正・scope 外）

`specrunner/project.md` 行 103–119 の byRequestType 設定例:
```jsonc
"defaults": { "model": "claude-sonnet-4-6" },   // 行 104
"model": "claude-sonnet-4-6",                    // 行 106
"spec-change": { "model": "claude-opus-4-6[1m]" }, // 行 108
"new-feature": { "model": "claude-opus-4-6[1m]" }, // 行 109
"model": "claude-sonnet-4-6",                    // 行 113
"spec-change": { "model": "claude-opus-4-6[1m]" }  // 行 115
```

本変更のスコープ（`src/core/step/`, `src/config/`, `src/core/command/`）は `specrunner/project.md` を含まないため未修正。`needsProjectContext: true` の 9 step が step-context-builder.ts 経由でこの例を参照するため、stale なモデル名が注入される経路が残存する。runtime の backward-compat 解決で即時障害はないが、agent が例を参照して config 生成すると旧世代モデル名が書き出される知識注入リスクが継続する。

---

## Evidence Summary

| Finding | File | Status |
|---------|------|--------|
| F1 LOW: stale line ref design.ts:12 | src/config/model-registry.ts:51 | FIXED ✅ |
| F2 LOW: ADR 旧モデル名 | specrunner/adr/*.md | STILL PRESENT ⚠️ (scope-out, historical) |
| F3 MEDIUM: project.md byRequestType 例 | specrunner/project.md:103–119 | STILL PRESENT ⚠️ (scope-out) |

- **checked**: 3（全 ledger 項目を実ファイルで検証）
- **skipped**: 0
- **unverified**: 0
