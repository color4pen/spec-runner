## Context

dogfood 中に発見された既存不備 2 件の小規模修正。触るファイルが完全に分離（spec vs gitignore.ts）しているため 1 request にまとめる。

### #370: module-boundary spec の grep pattern が stale

`specrunner/specs/module-boundary/spec.md` L42 の grep alternation pattern が `@anthropic-ai/(sdk|claude-code)` のまま。SDK 名は `@anthropic-ai/claude-agent-sdk` に変更済みのため、pattern にマッチしない = guard が false-negative。

### #406: ensureDotSpecrunnerGitignore の Exception 行 dedup

`src/util/gitignore.ts` の Step 2 dedup は `.specrunner/*` のみ対象。`!.specrunner/config.json` が重複した場合に dedup されない。機能影響はないが idempotency が不完全。

## Goals / Non-Goals

**Goals:**

- module-boundary spec L42 の grep pattern を `@anthropic-ai/(sdk|claude-agent-sdk)` に更新（delta spec 経由）
- `ensureDotSpecrunnerGitignore()` の Step 2 dedup logic に `!.specrunner/config.json` を追加
- Exception 行 dedup の regression test を追加

**Non-Goals:**

- `core/runtime/local.ts` の SDK 直 import 是正（別 request）
- spec.md L51-54 の独立 scenario（`@anthropic-ai/claude-code` 参照）の更新（別 request）
- gitignore.ts のその他 edge case 対応

## Decisions

### D1: grep alternation pattern の更新対象を L42 のみに限定

**Decision**: L42 の `(sdk|claude-code)` を `(sdk|claude-agent-sdk)` に変更する。L39 の prose や L51-54 の独立 scenario は本 request のスコープ外。

**Rationale**: request が明示的に「L42 の grep alternation pattern 更新のみ」と限定している。prose や他 scenario の整合性は別 request で対応。

### D2: Exception 行 dedup を既存 Step 2 に追加

**Decision**: `gitignore.ts` の Step 2 dedup block に `!.specrunner/config.json` の重複除去を追加する。既存の `.specrunner/*` dedup と同じパターン（first occurrence を keep）で統一。

**Rationale**: 既存パターンの自然な拡張。新規 step を追加するより凝集度が高い。

## Affected Specs

| Capability | Operation | Reason |
|------------|-----------|--------|
| module-boundary | MODIFIED | L42 の grep alternation pattern を新 SDK 名に更新 |
