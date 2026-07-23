# Code Review Feedback — iteration 1

## 検証した項目

### diff 範囲の把握
`git diff main...HEAD --stat` でスコープを確認。実装ファイル（4 ファイル）と
テストファイル（3 ファイル）、変更フォルダのアーティファクト群。

### 仕様・設計ドキュメントの読み込み
- `design.md`：D1〜D5 / D-journal の全 Decision を読み込み、実装との対応を確認
- `tasks.md`：T-01〜T-07 のすべてが `[x]` 完了マーク
- `test-cases.md`：must 15 件 / should 4 件 = 19 件の全 TC を確認

### 実装ファイルの精読

**`src/core/pipeline/reviewer-status.ts`** — `aggregateVerdict` 変更（D1）

```typescript
// 新実装: all-skip が escalation 短絡を抜けて hasNeedsFix チェックへ落ちる
for (const v of memberVerdicts) {
  if (v === "escalation") return "escalation";
  if (v === "needs-fix") { hasNeedsFix = true; }
}
return hasNeedsFix ? "needs-fix" : "approved";
```

- 全員 `"skipped"` → escalation short-circuit を通過 → `hasNeedsFix = false` → `"approved"` ✓
- `["skipped","escalation"]` → escalation short-circuit で即 return → `"escalation"` ✓（要件 3）
- `["needs-fix","skipped"]` → needs-fix フラグ立つ → `"needs-fix"` ✓

**`src/core/pipeline/parallel-review-round.ts`** — D2 / D3 の実装

- `allMembersSkipped` フラグの算出（L356-357）：`memberVerdicts.size > 0 && all "skipped"` — 正しい
- `roundError` の非設定：全 skip 時に `ROUND_ALL_MEMBERS_SKIPPED` を設定するコードが削除されている（D2）✓
- `applyRoundResults` 抑止ガード（L471）：`if (!inspectionEscalated && !allMembersSkipped)` — D3 維持 ✓
- 診断ログ（L477-481）：エラーでなく構造的 skip の証跡として保持 ✓
- HEAD guard や worktree inspection が先に `inspectionEscalated=true` にした場合、`allMembersSkipped` かつ `inspectionEscalated` の同時成立時は `"escalation"` を返す — 正しい

**`src/core/pipeline/pipeline.ts`** — D4 の実装

L391: `if (nextStep === "end" && state.status === "running")` → 常に `awaiting-archive` へ進む単一経路。
旧 `if (state.error?.code === "ROUND_ALL_MEMBERS_SKIPPED")` 分岐は完全削除 ✓

**`src/core/pipeline/reviewer-chain.ts`** — D5 の実装

L445-449: コメント「former all-members-skipped escalation → regression-gate conditional transition has been removed」。
`ROUND_ALL_MEMBERS_SKIPPED` を条件にした `on: "escalation"` 遷移は削除済み ✓
coordinator の他遷移（approved/needs-fix/skipped → 各後続）は変更なし ✓

### テスト網羅確認

**TC-003（must）** — `aggregateVerdict(["skipped","skipped"]) === "approved"` — reviewer-status.test.ts:183 に実装 ✓

**TC-007（must）** — `aggregateVerdict(["skipped","escalation"]) === "escalation"` — reviewer-status.test.ts:193 に実装 ✓

**TC-001/TC-002（must）** — 全 skip → awaiting-archive（E2E）
- TC-ACT-01: `paths: ["src/auth/**"]` reviewer が skip → `result.status === "awaiting-archive"` ✓
- TC-ACT-02（requestTypes 不一致）: `result.status === "awaiting-archive"` ✓
- TC-ACT-04 first: 単一 reviewer skip → `"awaiting-archive"` ✓
- 旧 `"awaiting-resume"` 期待から `"awaiting-archive"` への更新と破壊確認コメントが付いている ✓

**TC-004/TC-005（must）** — journal 証跡（E2E）
`events.jsonl` を `fold()` して security reviewer の step-attempt record に `verdict: "skipped"` と
`skipReason: "src/auth/**"` を確認するテストが実装 ✓

**TC-006（must）** — skip + error 混在 → escalation（round-level unit test）
A: `{kind:"skipped"}` / B: `{kind:"halt"}` で `round.run` の outcome が `"escalation"` ✓

**TC-009（must）** — 全 skip 後も member は `"pending"` のまま
`resultState.reviewerStatuses[0].status === "pending"` かつ `!== "skipped"` を assert ✓

**TC-010（must）** — 後方回復（E2E）
`error: null` / `status: "running"` / `step: CUSTOM_REVIEWERS_STEP_NAME` の seed state から
`buildPipelineForJob` → `pipeline.run(coordinatorStep, ...)` → `finalState.status === "awaiting-archive"` ✓
（tasks.md T-06: "start 経路の選択は implementer が deterministic な方を採用する" の許容範囲）

**TC-015（must）** — sticky ROUND_ALL_MEMBERS_SKIPPED error のクリア
`state.error = { code: "ROUND_ALL_MEMBERS_SKIPPED" }` を seed して round 実行後 `resultState.error === null` ✓

**TC-016/TC-017（must）** — 静的 dead-code チェック
`tests/unit/pipeline/round-all-skip-pass-through-static.test.ts` で `pipeline.ts` と
`reviewer-chain.ts` に `ROUND_ALL_MEMBERS_SKIPPED` の参照がないことを fs.readFile で検証 ✓

**TC-018/TC-019（must）** — canon 束縛テストと executor 活性化テストが無変更で green
verification-result.md 上 632 test files / 9374 tests passed ✓

### 破壊確認の記録確認

各テストに `// Destruction confirmation (TC-NNN): reverting ... causes ... to fail.` の形式で
旧挙動に戻した場合に失敗するテストが明記されている。
D3 guard / aggregateVerdict / roundError 設定の各箇所に対応 ✓

### commit-orchestrator との接点確認

`commitRound` L594: `error: roundError` で state.error を毎 round 上書き。
`roundError = null`（all-skip 時）→ sticky な旧 ROUND_ALL_MEMBERS_SKIPPED error がクリアされる ✓
（TC-015 / 後方回復要件 6 の技術基盤として正しい）

## 検証できなかった項目

- `commitRound` 内の `projectSkip` がループ中の state.reviewerStatuses を変更するかどうかの詳細
  （コード上は step 2 で `reviewerStatuses` パラメータで上書きされるため最終出力には影響なし、
  機能的に問題ないと判断）
- managed runtime 上での TC-010 backward recovery（E2E は local runtime 経由の mock で実行）

## Findings 詳細

### F-001: `src/state/helpers.ts` の stale コメント（低）

**場所**: `src/state/helpers.ts:122-124`

```
* "sticky" behaviour to detect ROUND_ALL_MEMBERS_SKIPPED at the end-of-pipeline
* check (the error set by commitRound is still present after regression-gate /
* conformance / pr-create succeed).
```

D4 で `pipeline.ts` の ROUND_ALL_MEMBERS_SKIPPED 終端分岐を削除したため、
この NOTE の「なぜ sticky behavior が必要か」の説明（ROUND_ALL_MEMBERS_SKIPPED 検出のため）
が stale になっている。`pushStepResult` 自体が state.error を保持する挙動は正しいが、
その理由として ROUND_ALL_MEMBERS_SKIPPED を挙げているコメントが誤解を招く。

影響: 将来のメンテナーが旧挙動を復元しようとする動機になりうる。機能への影響なし。

### F-002: `implementation-notes.md` の欠如（低）

受け入れ基準（request.md）には「更新対象を implementation-notes に列挙する」と明記されている。
更新対象の一覧は `design.md` の「テスト影響」節と各テストコードのコメント（`// CHANGE from ...`）
に記載されており、情報は揃っている。独立したアーティファクトとして
`specrunner/changes/round-all-skip-pass-through/implementation-notes.md` が存在しない。

影響: トレーサビリティ artifact の欠如。機能・テストへの影響なし。
