# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### Tasks (T-01〜T-13) — 全チェックボックス [x] 確認済み

tasks.md のすべての checkbox が `[x]` であることを目視確認。

### Judgment 1 — Request 受け入れ基準との適合

**AC1: シナリオ歯 (end-to-end)**
`tests/occupancy-e2e.test.ts` (TC-051) が
「awaiting-resume halt → 同 slug start が SLUG_OCCUPIED で拒否 → cancel が自 jobId sidecar を削除 → 後続 start 成功」
を実テンポラリディレクトリで固定。`state.json` 件数チェックで新 state 生成なしも検証済み。

**AC2: guard 単体テスト**
`tests/unit/core/occupancy/guard.test.ts` (TC-011〜TC-022) が網羅:
- `awaiting-resume` 先住 → SLUG_OCCUPIED
- `running` + pid 生存 → SLUG_OCCUPIED (wait/cancel hint)
- `running` + pid 死亡 → SLUG_OCCUPIED (resume/cancel hint)
- terminal のみ → 許可
- state 読取不能 → SLUG_STATE_UNREADABLE
- managed runtime の占有拒否・terminal-only 許可

**AC3: cancel のテスト**
`tests/unit/core/cancel/sidecar-teardown.test.ts` (TC-027〜TC-032):
- 自 jobId 一致 sidecar → 通常 cancel で削除 (TC-027)
- 他 jobId sidecar → 残存 (TC-028)
- managed marker の jobId gating (TC-029/TC-032)
- `--purge` の directory 削除条件 (TC-030/TC-031)

**AC4: 解決のテスト**
`tests/unit/core/resume/state-based-resolve.test.ts` (TC-033〜TC-036):
- 非 terminal 1 件 + terminal (updatedAt 新しい) → 非 terminal を返す
- 非 terminal 0 件 → null
- 非 terminal ≥2 件 → SLUG_OCCUPANCY_AMBIGUOUS throw (jobId/status/updatedAt 列挙)

**AC5: doctor のテスト**
`tests/unit/core/doctor/checks/storage/slug-occupancy.test.ts`: breach (≥2 非 terminal) と mismatch 検出、clean → pass。
`tests/unit/core/occupancy/repair.test.ts`: unique 非 terminal + mismatch → re-point、≥2 非 terminal → 拒否 (列挙)、already-correct → no-op。

**AC6: Next 案内のテスト**
`tests/unit/cli/progress-halt-guidance.test.ts` (TC-045〜TC-047):
- `awaiting-resume` → `Next: specrunner job resume <slug>`
- `awaiting-archive` → `Next: specrunner job archive <slug>`
- その他 status → Next 印字なし

**AC7: 既存テスト無変更 green**
669 ファイル / 9952 テスト全パス。
`duplicate-slug-guard.test.ts` / `local-duplicate-guard.test.ts` の期待値のみ更新（TC-052/TC-053 として R1/R2 帰属付き）。

**AC8: typecheck && test green**
verification-result.md: build/typecheck/test/lint/changed-line-coverage 全フェーズ passed。

---

### Judgment 2 — Design 決定との適合

**D1: job 生成入口での enforcement**
`assertSlugUnoccupied` は `pipeline-run.ts` の `assertNoDuplicateLiveJob?.()` 経由で pre-`bootstrapJob` preflight に位置。`local.ts:913` / `managed.ts:601` ともに `assertSlugUnoccupied` へ委譲。

**D2: `src/core/occupancy/` が単一所有者**
`scan.ts` / `guard.ts` / `claim.ts` / `repair.ts` が配置され、guard・resolver・sidecar claim・doctor repair の全経路が同一分類ロジックを使う。

**D3: 非 terminal = TERMINAL_STATUSES の補集合**
`TERMINAL_STATUSES = { archived, canceled }`。`scan.ts` / `resolve-job.ts` / `slug-occupancy.ts` (doctor check) / `run-inbox.ts` のすべてで `!TERMINAL_STATUSES.has(status)` を使用。ACTIVE_STATUSES は未使用。

**D4: fail-closed**
`scan.ts:tryReadStateJson` が ENOENT 以外の read error / JSON parse error / shape 異常を `unreadable` として記録。`guard.ts` は `unreadable !== null` で即 SLUG_STATE_UNREADABLE を throw。

観察（blocking なし）: `scan.ts` は `state.json` を直接読む（journal 再生不使用）。T-01 が「同一 split-layout composition」と言うが、scan 目的での直読みは同等の fail-closed 効果を持つ（state.json が壊れていれば unreadable 判定）。journal が壊れていても state.json が有効なら scan は読めたと判定するが、これは保守的な方向（non-terminal とみなして拒否）。

**D5: resolver の return 型保持・throw は breach 時のみ**
`resolveJobStateBySlug` は `Promise<JobState | null>` のまま。`cli/resume.ts:48-52` / `cli/reopen.ts:59-63` ともに try/catch で wrap 済み。

**D6: check-and-claim・jobId スコープ解除**
`claimLivenessSidecar` が readSidecar → getJobStatus → writeSidecar の 3 ステップで非 terminal foreign sidecar を拒否。`cancelSingleJob` では sidecar/marker ともに `jobId === state.jobId` の場合のみ削除。`--purge` は foreign non-terminal sidecar を持つ dir をスキップして warning。

**D7: doctor は read-only、repair は別 function**
`createSlugOccupancyCheck` は検出のみ（repair hint を出す）。`repairSlugOccupancySidecar` が独立 core 関数。`specrunner doctor repair <slug>` が `command-registry.ts` でインライン subcommand として実装。SLUG_REGEX バリデーション付き。

**D8: 新 error code、pid-only guard のリタイア（F-1 参照）**
`SLUG_OCCUPIED` / `SLUG_STATE_UNREADABLE` / `SLUG_OCCUPANCY_AMBIGUOUS` が ERROR_CODES に追加。EXIT_CODE_MAP は `SLUG_OCCUPIED → ARG_ERROR`, `SLUG_STATE_UNREADABLE → ARG_ERROR`、`SLUG_OCCUPANCY_AMBIGUOUS` は GENERAL_ERROR fallback（未登録）。

`checkDuplicateLiveJob` は削除されずに残存（F-1）。

**D9: halt-aware Next guidance**
`progress.ts:163-171` が `p.state.status` で分岐。

**D10: inbox の occupancy pre-check**
`buildEffects.startJob` が `JobStateStore.list` → non-terminal filter → `slugOccupiedError` を throw。catch block が `SLUG_OCCUPIED + priorJobId` を検出し marker-based dedup で `postRejectComment` を1度のみ呼ぶ。

**D11: managed runtime 対称**
`managed.ts:601-604` が `assertSlugUnoccupied` を呼ぶ（旧 no-op 廃止）。cancel の managed marker も jobId gated。

---

### Judgment 3 — Spec 要件・シナリオとの適合

全 8 Requirement のすべての Scenario を確認済み:

- **start guard enforces occupancy invariant** → TC-011〜TC-014 で全 Scenario 固定
- **rejection names prior job and routes to exit** → TC-015/TC-016 で message content 固定
- **liveness sidecar write is check-and-claim** → `claim.test.ts` (TC-023〜TC-026) で固定
- **cancel tears down only for its own jobId** → TC-027/TC-028 で固定
  - 観察（design-flagged, blocking なし）: `cancelAllTerminated` (--all-terminated) の sidecar directory 削除は jobId gating なし。設計 Open Questions で明示的に out-of-scope 記載。実装は `failed`/`terminated` → `canceled` の state 遷移を追加（緩和策）した上で directory 削除は unconditional のまま。設計書の follow-up 候補として正しく記録済み。
- **change-scoped slug resolution is state-based** → TC-033〜TC-036 で固定
- **doctor detects breaches and offers mechanical repair** → slug-occupancy.test.ts + repair.test.ts で固定
- **pipeline-complete Next guidance branches on final state** → TC-045〜TC-047 で固定
- **inbox propagates occupancy rejection idempotently** → `occupancy-propagation.test.ts` で固定

---

### Judgment 4 — 品質・完全性

**Architecture alignment**: `architecture/divergence-status.md` burn-down 表に `slug-occupancy-enforcement` を記録。T-12 完了。

**Allowlist**: `arch-allowlist.ts` に `command-registry.ts` の `ctx?.repoRoot ?? process.cwd()` fallback を適切な追跡 ID + コメント付きで追加。

**Scope compliance**: スコープ外の auto-resume / resume-by-jobId / JobStatus 変更はいずれも未実装。

**Test coverage**: changed-line-coverage phase passed (44 changed files checked)。

---

## 検証できなかった項目

None。すべての要件・設計決定・受け入れ基準を実装コードとテストで確認した。

---

## Findings 詳細

### F-1: `checkDuplicateLiveJob` 削除未実施

**File**: `src/core/runtime/duplicate-slug-guard.ts`

T-03 は "Remove the pid-only `checkDuplicateLiveJob`; it has no other production caller" と明示したが、実装は関数を残して JSON 破損時の挙動を fail-closed に修正した上でテストを更新した。

**事実確認**:
- `src/` の他ファイルからの import は存在しない（grep 確認）
- テストのみが参照 (`tests/unit/core/runtime/duplicate-slug-guard.test.ts`)
- 関数は修正済み（corrupted JSON → SLUG_STATE_UNREADABLE throw）

**影響**: 機能的影響ゼロ（production code は `assertSlugUnoccupied` を呼ぶ）。将来の読者が「なぜ pid-based 関数が残っているか」を把握しにくくなる可能性。

**選択肢**:
- Option A: このまま残す（dead code として許容、将来削除）
- Option B: 関数とテストを削除する（T-03 の文字通りの実施）
