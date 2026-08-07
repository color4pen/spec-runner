# Cross-Boundary Invariants Review — dead-code-core — iter 1

## Reviewer: cross-boundary-invariants

変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。
実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグが対象。

---

## Review Scope

66 ファイル変更。src/ 側は削除のみ（+2376 は specrunner/changes/ 配下の artifact）。
不変条件の観点から以下の 12 境界を走査した。

---

## Boundary Walk

### B-01: FinishFs — `src/core/finish/types.ts` 部分削除

**対象**: `PrViewData`・`ResolvedTarget`・`FinishContext`・`FinishFlags` の削除、`FinishFs` は残存。

確認した消費者:
- `src/core/archive/orchestrator.ts:20`
- `src/core/archive/post-merge-cleanup.ts:11`
- `src/core/archive/merge-then-archive.ts:26`
- `src/cli/archive.ts:16`
- `src/core/archive/__tests__/orchestrator.test.ts:19`

**判定**: 全消費者が `FinishFs` のみを参照。削除された 4 型への import は専用 test（削除済み）のみ。境界侵害なし。

---

### B-02: ERROR_CODES 削除 — 生き残りコードへの影響

**削除**: `AUTO_MERGE_UNAVAILABLE`・`GH_SUBPROCESS_FAILED`・`OPENSPEC_ARCHIVE_FAILED`・`SPEC_FIXER_NO_FINDINGS`・`AUTHORITY_SPEC_EDIT_VIOLATION`・`STEP_HALTED_NO_TOOL_CALL`・`NO_COMMIT_DETECTED`

**保護**: `BRANCH_NOT_REGISTERED`・`STATE_FILE_INVALID`・`STEP_INPUT_MISSING`・`SESSION_CREATE_FAILED` は残存。

確認した本番参照:
- `src/store/job-location-resolver.ts:43` → `ERROR_CODES.STATE_FILE_INVALID` ✓
- `src/core/finish/job-state-update.ts:70` → `ERROR_CODES.STATE_FILE_INVALID` ✓
- `src/core/runtime/local.ts:1414,1481` → `ERROR_CODES.STEP_INPUT_MISSING` ✓
- `src/core/runtime/managed.ts:536` → `ERROR_CODES.STEP_INPUT_MISSING` ✓
- `src/adapter/managed-agent/error-helpers.ts:26,45` → `"SESSION_CREATE_FAILED"` literal ✓
- `src/core/pipeline/pipeline.ts:20` → `"SESSION_CREATE_FAILED"` literal ✓

削除された 7 コードの本番参照: grep 0 件。境界侵害なし。

---

### B-03: factory 7 個削除 — 本番呼び出し経路

**確認**: `sessionCreateFailedError` は managed-agent adapter が inline 構築（`error-helpers.ts`）で代替済み。
`stepInputMissingError` は runtime が `ERROR_CODES.STEP_INPUT_MISSING` を直接使用済み。
他 5 factory の本番呼び出し: grep 0 件。

`guardCommit` / `NO_COMMIT_DETECTED` 系の変更は本 diff より前の変更で既に除去済み（`agent-runner.ts:17` に "guardCommit / preSessionHeadSha removed" と明記）。
本 diff ではテストの説明文を現状に合わせて更新しただけで、assertion の変更はない。境界侵害なし。

---

### B-04: `DoctorContext` const 削除 — 値 import の有無

**削除**: `export const DoctorContext: undefined = undefined`

全 import 確認: `import type { DoctorContext }` または JSDoc のみ。`import { DoctorContext }` 形式（値 import）は grep 0 件。
const の削除はランタイムに影響しない。

**注意**: `src/core/doctor/types.ts:86` の JSDoc が「The const below co-exists with the interface」と記述しているが、const は削除済みのため記述が宙に浮く。ランタイム影響なし。

---

### B-05: `derive-usage.ts` 削除 — orchestrator の no-op call 除去

**確認した実装**: `git show main:src/core/finish/derive-usage.ts` で確認済み。
`deriveAndWriteUsage` は常に `{ ok: true, skipped: true }` を返し副作用ゼロ（`T-10: Usage is now appended per-step`）。

orchestrator の削除 block:
```ts
try {
  const usageResult = await deriveAndWriteUsage({...});
  if (!usageResult.skipped) stdoutWrite(usageResult.message);  // skipped=true なので never
} catch {
  stderrWrite(`Warning: failed to derive usage...`);  // never thrown
}
```

`usageResult.skipped` は常に `true` のため `stdoutWrite` は呼ばれなかった。
`usage.json` は executor/commit-push 経路で別途書き込まれており、archive 後の読み取りに変化なし。境界侵害なし。

---

### B-06: `next-steps.test.ts` の fallback 経路

`src/core/doctor/index.ts` 削除後、`tests/unit/doctor/next-steps.test.ts:15-32` の try/catch:

```ts
try {
  const mod = await import("../../../src/core/doctor/index.js");  // 404 → catch
  ...
} catch {
  const mod = await import("../../../src/core/doctor/next-steps.js");  // 直接 import
  ...
}
```

`src/core/doctor/next-steps.ts` が存在し `deriveNextSteps` をエクスポートしていることを確認。fallback 経路は正常動作する。境界侵害なし。

---

### B-07: `checks/index.ts` の re-export block 削除 — 消費者

削除された個別 re-export（`nodeVersionCheck` 等 25 個）の本番消費者:
- `src/cli/doctor.ts:14` → `import { commonChecks, managedChecks, localChecks }` のみ（個別 check は import していない）
- 他の本番 src: 全 check が `./runtime/node.js` 等の各個ファイルから直接 import

`tests/core/doctor/doctor-cli.test.ts`: `vi.mock("...checks/index.js", () => ({ commonChecks:[], managedChecks:[], localChecks:[] }))` の形で `allChecks` を除いた形に正しく更新済み。境界侵害なし。

---

### B-08: `core/tools/` 削除 — readdir assertion

削除前: `src/core/tools/types.ts` のみの 1 ファイル ディレクトリ。
`tests/unit/adapter/managed-agent/agent-runner.test.ts:259-264` の "only types.ts remains" assertion を削除。
TC-017（`register_branch` が managed-agent の tool list にない）は別のロジックで存在し、同ファイル内に残存。観測空白なし。境界侵害なし。

---

### B-09: `core/validation/` 削除 — import repoint

`tests/unit/core/validation/registry.test.ts` と `tests/unit/parser/rules/rule-name-typesafe.test.ts` が `src/core/validation/` → `src/parser/validation/` に repoint 済み。
`src/parser/validation/registry.ts` と `src/parser/validation/types.ts` の存在と export を間接的に確認（verification passed）。境界侵害なし。

---

### B-10: `requestReviewResultPath` re-export 削除 — 消費者

全消費者を確認:
- `src/core/step/request-review.ts:10` → `from "../../util/paths.js"` ✓
- `src/templates/step-output-templates.ts:18` → `from "../util/paths.js"` ✓
- `tests/unit/util/paths.test.ts:8` → `from "../../../src/util/paths.js"` ✓

`request-review-system.ts` 経由で `requestReviewResultPath` を import しているコードは grep 0 件。境界侵害なし。

---

### B-11: `tests/unit/generate-chain-removed.test.ts:164` の stale コメント

TC-009 テスト内のコメント:
```ts
// "create" function should be removed; "list" and "resolve" remain
```

本 diff で `resolve` が削除されたため、「resolve remain」の記述が不正確になった。
テスト assertion 自体は `export async function create(` / `export function create(` の不在を確認するのみで、`resolve` の存在を assertion していない。テスト自体は正常通過する。コード上の不変条件侵害なし。ドキュメント不整合のみ。

---

### B-12: orchestrator の `jobId` ローカル変数削除

`let jobId: string` と `jobId = state.jobId` を削除。
残存する `state.jobId` 参照（`resolveWorktreePathForArchive` 内 line 88, 96）はいずれも `state` オブジェクトを直接参照しており、削除したローカル変数を経由しない。境界侵害なし。

---

## Summary

境界違反（不変条件破り）: なし。
ドキュメント不整合（ランタイム影響なし）: 2 件。

| # | 種別 | ファイル | 内容 |
|---|------|---------|------|
| D1 | stale JSDoc | `src/core/doctor/types.ts:86` | 「The const below co-exists with the interface」— const 削除後に宙に浮く |
| D2 | stale comment | `tests/unit/generate-chain-removed.test.ts:164` | 「list and resolve remain」— resolve 削除後も残存 |

両件ともランタイムに影響せず、テスト assertion も正しい。修正は次回 housekeeping で対応可能。
