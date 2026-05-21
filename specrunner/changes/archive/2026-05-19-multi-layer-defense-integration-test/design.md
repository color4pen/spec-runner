# Design: multi-layer-defense-integration-test

## Overview

PR #285 (Sub-A: dsv rule), #289 (Sub-B: spec-review prompt), #290 (Sub-C: design checklist) の 3 層防衛が連携して動作することを保証する integration test を `tests/multi-layer-defense.test.ts` に追加する。

既存 `tests/pipeline-integration.test.ts` の TC-DSV-INT-* と同型の mock-based integration test。pipeline state machine は実物駆動、agent は mock。

## Design Decisions

### D1: 独立テストファイル

`tests/pipeline-integration.test.ts` に追加するのではなく `tests/multi-layer-defense.test.ts` として分離する。

**理由**: pipeline-integration.test.ts は既に 2000+ 行。テーマが異なる（単体ステップ遷移 vs 多層連携保証）ため分離する方が可読性・メンテ性が高い。

### D2: テストヘルパーの複製

`buildPipelineMockClient`, `buildMockGithubClient`, `buildRunner`, `makeJobState`, `buildConfig`, `buildRequest` を新ファイルにコピーする。共有 helper への抽出は行わない。

**理由**: 共有 helper 化は pipeline-integration.test.ts の変更を伴い、本 request のスコープを超える。テストヘルパーは ~100 行で、独立して進化する可能性がある（例: multi-layer 固有の buildRequest default が `type: "spec-change"`）。

### D3: TC 命名規則

`TC-MLD-0X` (Multi-Layer Defense) で統一する。

| ID | Scenario | 検証観点 |
|---|---|---|
| TC-MLD-01 | Happy path | 3 層全正常 → pipeline 完走 |
| TC-MLD-02 | Sub-B catch | dsv approved → spec-review needs-fix → spec-fixer → dsv → spec-review approved |
| TC-MLD-03 | Sub-A catch | dsv needs-fix → delta-spec-fixer → dsv approved → spec-review approved |
| TC-MLD-04 | 5-a: design + spec-review fail | dsv が残存 1 層として catch |
| TC-MLD-05 | 5-b: design + dsv fail | spec-review が残存 1 層として catch |

### D4: 2 層同時 failure の表現方法

5-a / 5-b は state transition 的には TC-MLD-03 / TC-MLD-02 と同型だが、以下の差分で「2 層 failure」を表現する:

| Test | dsv mock | spec-review mock | violation type |
|---|---|---|---|
| TC-MLD-03 (Sub-A catch) | `needs-fix` → `ok` | `approved` | `legacy-flat-file` |
| TC-MLD-04 (5-a) | `needs-fix` → `ok` | `approved` | `no-specs-for-required-type` (PR #282 reproduction) |
| TC-MLD-02 (Sub-B catch) | always `ok` | `needs-fix` → `approved` | — |
| TC-MLD-05 (5-b) | always `ok` | `needs-fix` → `approved` | — |

TC-MLD-04 は PR #282 (4 層全突破) と同じ `no-specs-for-required-type` violation を使い、reproduction scenario を明示する。
TC-MLD-05 は TC-MLD-02 と mock 構成が同一だが、テストコメントで「dsv が bugged であっても spec-review が catch する」セマンティクスを記録する。

### D5: request type

`buildRequest()` のデフォルトを `type: "spec-change"` にする。`no-specs-for-required-type` rule が `spec-change` / `new-feature` で発火する設計に合わせたセマンティクス。mock ベースのため実 rule は動かないが、テストの意図が読み取りやすくなる。

### D6: delta spec 不要

本変更はテストファイル 1 件の新規追加のみ。既存 capability の追加・変更・削除がないため delta spec は作成しない。

## State Transition Traces

### TC-MLD-01 (Happy path)
```
design(success) → dsv(approved) → spec-review(approved) → test-case-gen → implementer → verification → code-review → adr-gen → pr-create → end
```

### TC-MLD-02 / TC-MLD-05 (spec-review catches)
```
design(success) → dsv(approved) → spec-review(needs-fix) → spec-fixer(approved) → dsv(approved) → spec-review(approved) → test-case-gen → ... → end
```
- dsv: 2 runs (both approved)
- spec-review: 2 runs (needs-fix, approved)
- spec-fixer: 1 run

### TC-MLD-03 / TC-MLD-04 (dsv catches)
```
design(success) → dsv(needs-fix) → delta-spec-fixer(approved) → dsv(approved) → spec-review(approved) → test-case-gen → ... → end
```
- dsv: 2 runs (needs-fix, approved)
- delta-spec-fixer: 1 run
- spec-review: 1 run (approved)

## Files Changed

| File | Action | Role |
|------|--------|------|
| `tests/multi-layer-defense.test.ts` | 新規作成 | 3 層連携 integration test (5 TC) |

## Non-Goals

- テストヘルパーの共有化 (pipeline-integration.test.ts のリファクタ)
- Sub-C (design checklist) の string assertion 追加 (既存 TC-CL-001 でカバー済)
- 実 LLM 呼び出し
