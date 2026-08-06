# Cross-Boundary Invariants Review — issue-request-fidelity-gate — iter 1

## Scope

- **Reviewer**: cross-boundary-invariants
- **Purpose**: diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する

## Checked paths

- `src/core/command/runner.ts` — gate 挿入点（registerCleanup ↔ pipeline.run 間）
- `src/core/command/pipeline-run.ts` — `inboxOrigin` option 配線
- `src/core/command/resume.ts` — `checkConsecutiveEscalations` の呼び出し、resumePoint.step 解決
- `src/core/gate/issue-fidelity-gate.ts` — gate 評価ロジック
- `src/core/resume/safety.ts` — `checkConsecutiveEscalations` 実装
- `src/state/lifecycle.ts` — `transitionJob`、VALID_TRANSITIONS
- `src/core/runtime/local.ts` — `cleanupWorktreeOnFailure`、`teardown`
- `src/core/notify/issue-notifier.ts` — `buildEscalationComment`、`notifyJobTerminal`
- `src/errors.ts` — FATAL_ERROR_CODES 非包含の確認
- `src/core/pipeline/pipeline.ts` — FATAL_ERROR_CODES、awaiting-resume 遷移条件
- `src/core/inbox/run-inbox.ts` — `inboxOrigin: true` の渡し方

---

## Finding CBI-001 [WARN]: gate halt が `checkConsecutiveEscalations` カウンタを消費しない — 設計 D2 の記述と実装が乖離

### 経路再構成

1. `--issue N` 付き run → gate が halt（undeclared drop または fetch 失敗）
2. `transitionJob(jobState, "awaiting-resume", { patch: { resumePoint: { step: "request-review" }, error, pid } })`
   — patch に `steps` フィールドは含まれない → `state.steps["request-review"]` は空のまま
3. `deps.storeFactory(haltState.jobId).persist(haltState)` → disk に `awaiting-resume` が書かれる
4. operator が resume → `ResumeCommand.prepare()` が `startStepForCheck = resumePoint?.step = "request-review"` を導出
5. `checkConsecutiveEscalations(state, "request-review")` → `state.steps?.["request-review"]` を読む
6. step 2 で `state.steps["request-review"]` は追記されていないため、runs 配列は空 → `false` を返す
7. 何度 gate halt ↔ resume を繰り返しても `--force` 要求は発動しない

### 既存の不変条件

`checkConsecutiveEscalations`（`src/core/resume/safety.ts:81`）は `state.steps[stepName]` の末尾 N 件が `escalation | error` verdict のとき `--force` を要求する。この不変条件は「pipeline step が 3 回連続で失敗した場合に operator の明示確認を求める」という安全ネットとして機能している。

### 設計 D2 の記述

> request-review anchor での連続 escalation は `checkConsecutiveEscalations`（`resume.ts:187`）の 3 回 → `--force` 要求と同じ counter を共有する（entrance で詰まっている状態として妥当）。

### 実態

gate halt は `state.steps["request-review"]` に何も書き込まない。そのため gate halt を何度繰り返しても `--force` は要求されない。

### 機能的影響の評価

`--force` は `checkConsecutiveEscalations` チェックを迂回するだけであり、gate 自体は `--force` で迂回できない（gate は常に再評価される）。したがって「3 回 gate halt → `--force` 要求」を実装しても、gate halt ループの脱出には実質的に寄与しない。現在の実装（カウンタ非消費）は機能的に安全であり、operator が request.md を修正して何度でも retry できる点でむしろ望ましい挙動と言える。

ただし：
- 設計文書（D2）が実装と食い違っている（ドキュメント正確性）
- 「3 gate halt が --force を発動しないこと」を検証するテストが存在しない — gate halt と escalation counter の交差シナリオがテストの空白域

### テスト空白

`tests/unit/core/command/runner-fidelity-gate.test.ts` は gate halt → `pipeline.run` 未呼び出し（AC1）を検証するが、「gate halt が `state.steps["request-review"]` を変更しないこと」および「3 gate halt 後も `--force` が不要であること」はテストされていない。

---

## Finding CBI-002 [LOW]: `error.hint` テキストが fetch 失敗・wiring エラー時に誤誘導だが operator 可視出力には現れない

### 経路再構成

1. `getIssue` が throw（network / 404 / 401）→ gate が `{ kind: "halt", code: "ISSUE_FETCH_FAILED" }` を返す
2. `runner.ts` が `transitionJob` で `error: { code: "ISSUE_FETCH_FAILED", message: "...", hint: "request.md を修正（要件復元 or スコープ外宣言追記）して resume してください。" }` を patch する
3. この hint は fetch failure / wiring error に対して誤った回復手順を指示する

### 既存コードとの交差

`handleResult`（`runner.ts:402`）は `status === "awaiting-resume"` に対して `error.hint` を表示しない（`SPEC_REVIEW_RESULT_NOT_FOUND` だけ hint を表示する特別処理がある）。`buildEscalationComment` も `error.hint` を含めない。

**結果**: 誤誘導 hint は `state.json` の `error.hint` フィールドに永続化されるが、CLI 出力・GitHub issue コメントのいずれにも表示されない。operator が直接参照することは稀。

### wiring エラー時の追加問題

comparator 未注入（step 4）・`readRequestMd` 失敗（step 5）・comparator throw（step 7）がすべて `ERROR_CODES.ISSUE_FETCH_FAILED` を使用。これは `getIssue` 失敗（step 6）と区別できない。operator が `state.json` を直接参照して原因診断しようとした場合、誤った結論に至る可能性がある。

機能的影響は低い（すべてのケースが `awaiting-resume` → resume 可能であり、`FATAL_ERROR_CODES` 外であることは確認済み）。

---

## Observations（追加所見）

### OBS-1: scope-config 警告が gate halt 時にも出力される

`runner.ts` の `scopeConfigWarningForJob` 呼び出しは gate 評価後・halt 分岐判定前に実行されるため、gate halt 時にも scope-config 警告が表示される。機能的影響なし（情報ログ）。

### OBS-2: 非伝播不変条件は構造的に保証されているが drop 記述の LLM 依存部分は prompt レベルのみ

`evaluateIssueFidelityGate` が返す `GateDecision` は issue body を含まない（構造的保証）。`log()` に issue body を渡すコードパスも存在しない。一方、`comparison.undeclaredDrops` 要素（LLM 生成）は `state.resumePoint.reason` / `state.error.message` / history / GitHub issue コメントに記録される。prompt が "Do NOT copy issue body text verbatim" と指示しているが、LLM が遵守しない場合 issue body 断片が上記に伝播する。これは設計が明示的に受け入れているリスク（「照合 LLM の精度チューニング」はスコープ外）であり、findings とはしない。

### OBS-3: `cleanupWorktreeOnFailure` の disk 読み込みが gate halt persist 失敗時に worktree を削除し得る

gate halt persist（`deps.storeFactory.persist(haltState)`）がエラーで catch された場合、disk 上の state は `status: "running"` のまま。その後 `teardown → cleanupWorktreeOnFailure` が disk state を読み `"running"` を見てワークツリーを削除する可能性がある。この場合 `resume-recreated` パスで再作成されるが feature branch の local 未 push コミットは失われる。

ただし初回 gate halt の時点では pipeline step がまだ実行されておらず、worktree には request.md 初期コミットしかない。また persist 失敗時に同様のリスクが生じるのは既存の pipeline halt パスでも同様であり、本変更が新たに導入した invariant 違反ではない。

---

## Invariants confirmed as preserved

| 不変条件 | 確認内容 | 結果 |
|---------|---------|------|
| FATAL_ERROR_CODES 非包含 | `ISSUE_FIDELITY_UNDECLARED_DROP` / `ISSUE_FETCH_FAILED` がいずれも `FATAL_ERROR_CODES` に存在しない | ✓ |
| `inboxOrigin` ライフサイクル維持 | bootstrap → persist → reload → gate 評価すべて `inboxOrigin` を保持。`transitionJob` patch が `inboxOrigin` を上書きしない | ✓ |
| `awaiting-resume` からの resume 遷移 | `VALID_TRANSITIONS["running"]` に `"awaiting-resume"` が含まれ、`transitionJob(jobState="running", "awaiting-resume")` は合法 | ✓ |
| worktree 保持（awaiting-resume 時） | `cleanupWorktreeOnFailure` は disk state が `"awaiting-resume"` なら即 return。gate halt persist 成功時は保持される | ✓ |
| resume 経路での gate 再評価 | `recopyDraftToChangeFolder` → gate が change folder の修正済み request.md を読む | ✓ |
| 非伝播（構造的） | `GateDecision` に issue body フィールドなし、`log()` 引数に issue body なし | ✓ |
| pipeline step 未実行（halt 時） | `buildPipelineForJob` / `pipeline.run` は `gateDecision.kind === "halt"` 分岐で呼ばれない | ✓ |
| `notifyJobTerminal` 二重呼び出し無し | gate halt 時は pipeline 未起動のため pipeline.ts 側の `notifyJobTerminal` は発火しない | ✓ |
| `startStep` 解決（resume 経路） | `resumePoint.step = "request-review"` → `resolveResumeStep` が `"request-review"` を返す（StepName union に存在） | ✓ |
