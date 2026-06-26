# Tasks: resume-from-progress

## T-01: `resolveResumeStep` に `stateStep` フォールバックを追加する

対象ファイル: `src/core/resume/resolve-step.ts`

- [x] 関数シグネチャに第 3 引数 `stateStep?: string` を追加する。
- [x] 解決優先順序を以下の順に実装する。
  1. `from` が `ALL_STEP_NAMES_SET` に含まれる → `toStepName(from)` を return。
  2. `from` が定義済みだが不正 → 既存の `Invalid --from value` エラーをそのまま throw（変更なし）。
  3. `from` が undefined かつ `resumePoint !== null` → `resumePoint.step` を return（変更なし）。
  4. `from` が undefined かつ `resumePoint === null` かつ `stateStep` が `ALL_STEP_NAMES_SET` に含まれる → `toStepName(stateStep)` を return。
  5. すべて該当しない → `"Cannot resolve resume step: no --from, no resumePoint, and no progress recorded (state.step is absent or not a pipeline step)."` を throw。
- [x] JSDoc コメントに解決優先順序 4 の説明を追記する。

**Acceptance Criteria**:

- `resolveResumeStep(undefined, null, "design")` は `"design"` を返す。
- `resolveResumeStep(undefined, null, "init")` は throw する（"init" は pipeline step ではない）。
- `resolveResumeStep(undefined, null, undefined)` は throw する。
- `resolveResumeStep(undefined, resumePoint, "design")` は `resumePoint.step` を返す（stateStep より resumePoint が優先）。
- `resolveResumeStep("implementer", null, "design")` は `"implementer"` を返す（`--from` が最優先）。
- 既存の `from` 不正値エラーパスは変更されていない。

---

## T-02: `resume.ts` のプリガードを削除し `state.step` を渡す

対象ファイル: `src/core/command/resume.ts`

- [x] 163-166 行目のブロック（`resumePoint === null && this.options.from === undefined` → throw）を削除する。
- [x] `resolveResumeStep(this.options.from, resumePoint)` の呼び出しを `resolveResumeStep(this.options.from, resumePoint, state.step)` に変更する。
  - この時点で参照する `state` は stale 検出後の回復済み state（`awaiting-resume` 遷移後）であること。`state.step` の値は遷移前後で変わらないため問題ない。
- [x] `resolveResumeStep` のインポートシグネチャが変わる場合は import を更新する（型が変わらなければ不要）。

**Acceptance Criteria**:

- `status=running` / `step="design"` / `resumePoint=null` / pid 死 のジョブに `resume` を呼び出したとき、163-166 行目の guard で失敗せずに `resolveResumeStep` に到達し、`"design"` が選択される。
- `status=running` / `step="init"` / `resumePoint=null` / pid 死 のジョブは `resolveResumeStep` の throw 経路で失敗し、exit code 1 が返る。
- `resumePoint` が存在するジョブは従来通り `resumePoint.step` から再開する（回帰なし）。

---

## T-03: `resolveResumeStep` の単体テストを作成する

対象ファイル: `src/core/resume/__tests__/resolve-step.test.ts`（新規作成）

- [x] AC1（hard-crash fallback）: `resolveResumeStep(undefined, null, "design")` が `"design"` を返すことを固定するテストを追加する。
- [x] AC2（未開始ジョブ）: `resolveResumeStep(undefined, null, "init")` と `resolveResumeStep(undefined, null, undefined)` が throw することを固定するテストを追加する。
- [x] AC3（resumePoint 優先 — 回帰）: `resumePoint` が存在する場合、`stateStep` を渡しても `resumePoint.step` が選ばれることを固定するテストを追加する。
- [x] `--from` 優先（回帰）: `from` が有効 step 名の場合、`resumePoint` も `stateStep` も無視されて `from` が返ることをテストする。
- [x] `--from` 不正値（回帰）: `from` が不正な step 名の場合、利用可能 step 名リスト付きのエラーが throw されることをテストする。
- [x] 各テストケースにコメントで AC 番号または意図を記載する。

**Acceptance Criteria**:

- 上記 5 分類のテストがすべて pass する。
- 既存の `resolveResumeStep` ロジック（from / resumePoint パス）の回帰が検出できる。

---

## T-04: `ResumeCommand.prepare()` の hard-crash シナリオを単体テストで固定する

対象ファイル: `src/core/command/__tests__/resume-hard-crash.test.ts`（新規作成）

- [x] `state.step` から再開する happy path テストを追加する。
  - `status=running` / `step="design"` / `resumePoint=null` / `pid=<存在しない pid>` のジョブ state を用意する。
  - 必要な依存（`JobStateStore`、`loadStateByJobId`、`resolveJobStateBySlug`、`parseRequestMd`、`loadConfig`、`isStaleRunning`、`transitionJob`、`resolveStateStoreByJobId`、`resolveRepoRoot`、`livenessJsonPath`）を vi.mock でモックする。
  - `ResumeCommand` を構築して `prepare()` を（`execute()` 経由か `prepare()` を直接 spy 経由で）呼び出す。
  - `startStep` が `"design"` であることを確認する（PrepareResult または pipeline 呼び出しの引数で検証）。
- [x] `state.step === "init"` の場合（未開始ジョブ）は `PrepareError` が throw され exit code 1 になることを確認するテストを追加する。
- [x] `resumePoint` が存在する通常ケースが従来通り動くことを確認する回帰テストを追加する。

> Note: `prepare()` は `protected` メソッドのため、`execute()` を spy するか、サブクラスを作成してアクセスするか、`as unknown as { prepare(): Promise<PrepareResult> }` でキャストするかを実装者が選択する。モックの量が多い場合は E2E に近いテストより `resolveResumeStep` 単体テスト（T-03）の方が信頼性が高い。このタスクは `resume.ts` 側の guard 削除と引数変更が正しく組み合わさることを確認する目的の最小テストで可とする。

**Acceptance Criteria**:

- hard-crash 状態（`step="design"`, `resumePoint=null`, pid 死）の job を resume したとき、`startStep` として `"design"` が選ばれる経路がテストで保証される。
- `step="init"`, `resumePoint=null` の job では失敗経路がテストで保証される。
- `resumePoint` 有りの job は既存挙動のまま（回帰テスト）。

---

## T-05: inbox 自動回復のテストを追加する（`resumePoint` 無し stale running job）

対象ファイル: `src/core/inbox/__tests__/run-inbox.test.ts`（既存ファイルに追記）

- [x] `status=running` / `step="design"` / `resumePoint=null` / `staleRecovery=null` のジョブを `JobStateStore.list` の mock が返すよう設定する。
- [x] `effects.isStale` が `true` を返すよう設定する（stale running job として扱わせる）。
- [x] `effects.resumeJob` が `vi.fn().mockResolvedValue(undefined)` で成功するよう設定する。
- [x] `runInboxOrchestrator` を実行し、`summary.recovered` にそのジョブが含まれること、`summary.escalated` が空であることを検証する。
- [x] `effects.resumeJob` が 1 回だけ呼び出されたことを検証する（1 サイクルで回復）。

> Note: このテストは inbox の recover/escalate ルーティングが正しく機能することを確認する。`resumeJob` は mock で成功させるため、`resolveResumeStep` の fix が実際に効いていることは T-03 / T-04 のテストで担保する。

**Acceptance Criteria**:

- 上記テストが pass する。
- `summary.escalated` は空であること（3 回失敗 → escalation 経路に入らない）。
- `effects.resumeJob` が `slug` 引数で 1 回呼ばれること。

---

## T-06: typecheck と test が green であることを確認する

対象: リポジトリ全体

- [x] `bun run typecheck` が error なしで完了すること。
- [x] `bun run test` が全テスト pass で完了すること。

**Acceptance Criteria**:

- `typecheck` 出力に error が 0 件。
- `test` 出力に failed テストが 0 件。
