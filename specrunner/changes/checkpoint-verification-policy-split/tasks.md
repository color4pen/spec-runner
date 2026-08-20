# Tasks: checkpoint 検証の分離 — generic integrity と use-case policy の二層化

## T-01: `checkpoint-policy.ts` を作成し policy インターフェースと attachResumePolicy を実装する

- [ ] `src/core/attach/checkpoint-policy.ts` を新規作成する
- [ ] `PolicyVerificationContext` インターフェースを定義する: `{ state: NormalizedJobState; slug: string; treeFiles: string[] }`
- [ ] `CheckpointVerificationPolicy` インターフェースを定義する: `{ verify(ctx: PolicyVerificationContext): void }`
- [ ] `attachResumePolicy` 実装オブジェクトを定義する:
  - `verify()` 内で `(a)` status チェック (`state.status !== "awaiting-resume"` → `not-quiescent` エラー) を実装する
  - `verify()` 内で `(c)` resumePoint + pipeline definition 解決 (`resume-step-unresolvable` / `pipeline-unresolvable`) を実装する
  - `verify()` 内で `(d-new)` resume step reads() 必須入力の存在検査 (`resume-reads-unevaluable` / `resume-input-missing`) を実装する
- [ ] 必要な import を整理する: `getPipelineDescriptor`, `getPipelineId`, `resolveResumeStep`, `buildAllowedStepSet`, `checkpointNotAttachableError`, `NormalizedJobState`, `StepDeps`

**Acceptance Criteria**:
- `src/core/attach/checkpoint-policy.ts` が存在し、`CheckpointVerificationPolicy`、`PolicyVerificationContext`、`attachResumePolicy` をエクスポートする
- `bun run typecheck` が green
- `attachResumePolicy.verify({ state: awaitingArchiveState, slug, treeFiles })` を直接呼んで `not-quiescent` エラーが発火することをコード上確認できる
- corrupted journal の checkpoint で `policy.verify()` が呼ばれる前に `journal-corrupted` で throw することがテストで確認できる（generic → policy の実行順序 pin、TC-004）

---

## T-02: `verify-checkpoint.ts` を二層構造に再実装する

- [ ] `verify-checkpoint.ts` に `CheckpointVerificationPolicy`、`PolicyVerificationContext`、`attachResumePolicy` を `checkpoint-policy.ts` からインポートする
- [ ] `verifyCheckpoint` 関数の第二引数として `policy: CheckpointVerificationPolicy = attachResumePolicy` を追加する（既存の第一引数 `input` は変更しない）
- [ ] 現在 `verify-checkpoint.ts` にある resume 固有の checks `(a)(c)(d-new)` を削除する:
  - `(a)` status チェック（L172–L177）を削除する
  - `(c)` descriptor/resume step 解決（L180–L204）を削除する
  - `(d-new)` reads() 必須入力検査（L206–L238）を削除する
  - これらに関連する `import { getPipelineDescriptor }`, `import { getPipelineId }`, `import { resolveResumeStep, buildAllowedStepSet }` を削除する（`checkpoint-policy.ts` に移動した）
- [ ] `(b-new)(b)(b-new)(profile)(d)(e)` の generic 検証ブロック通過後、identity 検証（(e)）の前に `policy.verify({ state, slug, treeFiles })` を呼び出す
  - 呼び出し位置: profile 検証の後、request.md 存在確認（(d)）の前
- [ ] `verifyCheckpoint` の JSDoc コメントの検証順序列挙 (L54–58) を更新し、`(a)(c)(d-new)` が policy に委譲されることを明示する

**Acceptance Criteria**:
- `verify-checkpoint.ts` に `getPipelineDescriptor`, `getPipelineId`, `resolveResumeStep`, `buildAllowedStepSet` の直接 import がなくなる
- `verify-checkpoint.ts` に `status === "awaiting-resume"` の文字列が残っていない
- `bun run typecheck` が green
- 既存テスト `tests/attach/verify-checkpoint.test.ts` および `tests/attach/verify-checkpoint-r1-assurance.test.ts` が無改変で green

---

## T-03: rebind primitive の policy 注入を pin するテストを追加する

新規テストファイル `tests/attach/checkpoint-policy.test.ts` を作成する。

- [ ] generic integrity が policy と独立していることを pin するテストを書く:
  - `status === "awaiting-archive"` かつ構造的に intact な checkpoint に対して、`verify()` が no-op のスタブ policy を注入した `verifyCheckpoint` を呼ぶ
  - 結果: `VerifiedCheckpoint` が返る（policy スタブが resume 検査をスキップしたため通過）
  - 意味: `status === "awaiting-archive"` の拒否が policy 層の責任であり、generic 層には残っていないことの証拠
- [ ] generic 検証が policy より先に発火することを pin するテストを書く（TC-004）:
  - corrupted な `events.jsonl` を持つ checkpoint + 記録用スタブ policy で `verifyCheckpoint` を呼ぶ
  - 結果: `journal-corrupted` reason で throw し、スタブ policy の `verify()` は一度も呼ばれていない
- [ ] `attachResumePolicy` 単体テストを書く:
  - `status !== "awaiting-resume"` → `not-quiescent` で reject
  - resumePoint 解決失敗（`resumePoint = null` かつ `state.step` が resumable allowed step set に無い — 実際の throw 条件。non-null resumePoint は検証なしで passthrough されるため fixture に使わない） → `resume-step-unresolvable` で reject
  - reads() 必須入力 (`tasks.md`) が treeFiles に欠落 → `resume-input-missing` で reject

**Acceptance Criteria**:
- `tests/attach/checkpoint-policy.test.ts` が存在する
- スタブ policy で `awaiting-archive` checkpoint が通過することを確認するテストが green
- corrupted journal の checkpoint で `policy.verify()` が呼ばれる前に `journal-corrupted` で throw することがテストで確認できる（generic → policy の実行順序 pin、TC-004）
- `attachResumePolicy` の3種の拒否ケース（status 不一致 / resumePoint 解決失敗 / reads() 入力欠落）がそれぞれ独立したテストで green
- `tests/unit/architecture/arch-allowlist.ts` に新エントリが追加されていない

---

## T-04: 全テストスイートと型チェックの green を確認する

- [ ] `bun run typecheck` を実行し green を確認する
- [ ] `bun run test` を実行し green を確認する（特に `tests/attach/` 配下全ファイル）
- [ ] `tests/unit/architecture/` が green であることを確認する（allowlist 変更なし）

**Acceptance Criteria**:
- `bun run typecheck` exit code 0
- `bun run test` exit code 0（既存テスト無改変 + 新規テスト全 green）
- `tests/unit/architecture/` サブスイートが green
