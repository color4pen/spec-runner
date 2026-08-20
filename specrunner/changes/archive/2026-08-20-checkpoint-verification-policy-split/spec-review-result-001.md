# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだファイル

- `request.md` — 背景・要求・受け入れ基準・スコープ外
- `design.md` — D1〜D5 の設計判断
- `tasks.md` — T-01〜T-04 タスク分解
- `spec.md` — 4 Requirement × 計 9 Scenario
- `test-cases.md` — TC-001〜TC-014（14 件）
- `src/core/attach/verify-checkpoint.ts` — 現状の単一関数実装（280 行）
- `src/core/attach/orchestrator.ts` — runAttachVerification（既存呼び出し元）
- `tests/attach/verify-checkpoint.test.ts` — 既存テスト群（TC-VC-001〜TC-VC-018）
- `tests/attach/verify-checkpoint-r1-assurance.test.ts` — R1 互換テスト
- `tests/unit/architecture/arch-allowlist.ts` — アーキテクチャ allowlist
- `src/core/resume/resolve-step.ts` — resolveResumeStep 実装
- `src/core/step/step-names.ts` — toStepName 実装

### アーキテクチャ観点

- `checkpoint-policy.ts` を `src/core/attach/` に配置する判断（D2）は妥当。同ディレクトリ内の移動であり、新たな cross-layer import は発生しない。`verify-checkpoint.ts` が既に使っている `src/core/pipeline/registry.js`・`src/core/resume/resolve-step.js`・`src/store/job-state-projection.js` 等の import が `checkpoint-policy.ts` に移動するだけで、arch-allowlist に新エントリは不要。
- デフォルト引数 `policy = attachResumePolicy` による後方互換（D1）は正しい設計。既存呼び出し元（orchestrator.ts 行 84）は signature 変更後も無改変で動く。
- `PolicyVerificationContext { state, slug, treeFiles }` の最小公開原則（D4）は妥当。policy が `branch`/`expectedRepo`/`checkpointOid` に触れる必要がない。
- `verify()` が sync である判断（D5）は現時点では正しい（I/O なし）。将来 async が必要な policy が出ても `await policy.verify()` で対応できる。

### 正確性観点

- 検証順序 (profile) → policy.verify() → (d) request.md → (e) identity は元の (a)(c)(d-new) の位置に合致する。既存テストが検証順序を間接的に pin しているため、順序ずれは検出される。
- 既存テスト群（TC-VC-001〜TC-VC-018、R1 assurance）は `verifyCheckpoint` を policy 引数なしで呼ぶ。デフォルト `attachResumePolicy` が使われるため、挙動変化なし。green のままになる。
- T-03 のスタブ policy テスト（TC-003）に必要な `status: "awaiting-archive"` state は schema 的に valid（`JobStatus` の列挙に含まれる）。`composeSplitLayoutFromContent` は問題なく処理できる。
- TC-VC-014 の `vi.mock("../../src/core/pipeline/registry.js")` は vitest のモジュール registry レベルで intercept する。`getPipelineDescriptor` が `checkpoint-policy.ts` に移動しても、`verify-checkpoint.ts` → `checkpoint-policy.ts` 経由で呼ばれる同モジュールに mock は透過的に適用される。

### タスク網羅性観点

- T-01（checkpoint-policy.ts 作成）→ TC-010（export 確認）+ policy 分離の基盤 ✓
- T-02（verify-checkpoint.ts 二層化）→ TC-001（既存 caller 無改変）+ TC-011（直接 import 消滅）✓
- T-03（checkpoint-policy.test.ts）→ TC-003 / TC-005 / TC-006 / TC-007（新規 pin テスト）✓（ただし下記 Finding あり）
- T-04（全テスト green 確認）→ TC-012 / TC-013 / TC-014（gate）✓

## 検証できなかった項目

- `bun run typecheck` / `bun run test` の実行結果（実行不可）
- `arch-allowlist.ts` の実テスト通過（実行不可）
- `resolveResumeStep` が runtime で TC-006 fixture に対して実際に何を返すか（ソース読み取りでの静的分析のみ）

## Findings 詳細

### F-1: TC-006 のトリガー条件が `resolveResumeStep` の実装と整合しない

**spec.md の記述**:
> Given a checkpoint with `state.status === "awaiting-resume"` but an unresolvable `resumePoint` (e.g., references a step not present in the pipeline descriptor)
> Then it throws `CHECKPOINT_NOT_ATTACHABLE` with reason `resume-step-unresolvable`

**実際の `resolveResumeStep` 挙動**（`src/core/resume/resolve-step.ts:119-129`）:

```ts
if (resumePoint !== null) {
  const legacyResolved = LEGACY_STEP_ALIASES[resumePoint.step] ?? resumePoint.step;
  const resolvedStep = mapMemberToCoordinator(legacyResolved, reviewers);
  return toStepName(resolvedStep);  // passthrough — 例外を投げない
}
```

`toStepName` は passthrough cast（`src/core/step/step-names.ts:15-17`）。
`resumePoint` が non-null の場合、`resolvedStep` がどんな無効なステップ名でも `resolveResumeStep` は **例外を投げない**。
`resume-step-unresolvable` が発火するのは、`resolveResumeStep` 自体が throw した場合だけ。
これは `from` が無効（verify-checkpoint の使用では `from = undefined` なので非該当）か、
`resumePoint === null` かつ `stateStep` が allowed set に含まれない場合のみ。

つまり「resumePoint.step に無効なステップ名」を与えても `resume-step-unresolvable` は発火しない。
実装者が spec 記述どおりに fixture を作ると、テストが通らない（エラーが発火しない）。

**選択肢**:
A. **spec/tasks の fixture 条件を修正**（挙動保存）: TC-006 を「`resumePoint = null` かつ `stateStep` が allowed step に存在しない」に変更する。`resume-step-unresolvable` の実際のトリガーに合わせる。
B. **attachResumePolicy.verify() に descriptor membership 検査を追加**（挙動拡張）: resolved step name が pipeline descriptor に存在しない場合に `resume-step-unresolvable` を throw する。現在のコードより厳格になり、behavior-preserving の前提から逸脱する。

挙動保存（refactoring）の前提から、**A が適切**。

### F-2: T-03 の受け入れ基準に TC-004 が含まれていない

**spec.md TC-004**（must）:
> Given a corrupted `events.jsonl` checkpoint
> When `verifyCheckpoint` is called with any policy
> Then throws with reason `journal-corrupted` before `policy.verify()` is ever called

この Scenario は「generic 検証が policy より先に発火すること」を pin する。
しかし T-03 の acceptance criteria には記載がない（TC-003 / TC-005 / TC-006 / TC-007 のみ）。
TC-004 は `checkpoint-policy.test.ts` に corrupted journal + stub policy → expect `journal-corrupted` reason として追加すれば実装可能。
コードの実行順序が設計上 (generic → policy) であることから、この pin テストがないと「policy が先に呼ばれていた」バグが見逃されるリスクがある。

### F-3: test-cases.md の `automated` カウントが 11 だが実際は 14

test-cases.md の Summary:
```
- **Automated** (unit/integration): 11
```

TC-012 / TC-013 / TC-014 は "gate" カテゴリ（CLI 実行）で、automated ではあるが unit テストではない。
"automated: 11" はこれら 3 件を除いた unit/integration 数。合計 14 件すべて automated であるにもかかわらず、
summary の automated 欄が unit のみを指すのか全体を指すのか判断が曖昧。軽微な doc 不整合。
