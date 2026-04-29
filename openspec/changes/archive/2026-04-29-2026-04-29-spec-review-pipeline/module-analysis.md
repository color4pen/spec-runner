# Module Analysis — 2026-04-29-spec-review-pipeline

Step 2.5 mechanical structure analysis. In-Scope axes: testability / readability / cohesion / coupling / reusability / SRP. Recommendations are non-binding inputs for spec-review and implementer.

## 1. 既存コードパターン一覧

観測対象: `src/core/`, `src/state/`, `src/prompts/`, `src/sdk/`, `src/cli/`。

- **Step 関数の不在**: 現状 `src/core/pipeline.ts` の `runProposePipeline` がセッション作成 → SSE → ポーリング → ブランチ検証 → change folder 検証までを 1 関数 (約 330 行) で担う。`src/core/steps/` ディレクトリは未作成（本 request で新設）。
- **副作用注入の慣行**: `PipelineDeps` に `client` / `config` / `repo` / `request` / `slug` / `timeoutMs` / `sleepFn` / `githubFetch` を集約し、テストで mock 注入する規約が確立済 (`src/core/pipeline.ts:18-29`)。
- **State 永続化の慣行**: `appendHistory` / `updateJobState` / `failJobState` (`src/state/store.ts:48-136`) が `persistJobState` を内部で呼ぶ「pure transform + persist」のペアで、各 step の進捗を逐次永続化する。
- **SDK ラッパー層**: `src/sdk/sessions.ts` で `createSession` / `retrieveSession` / `streamEvents` / `sendEvents` を thin re-export しており、SDK 直叩きを禁止する境界線が成立している。
- **完了検知の既存実装**: `pollUntilComplete` (`src/core/completion.ts:58-106`) が `sessions.retrieve()` ポーリング + 指数バックオフ + jitter + abort signal + timeout を既に実装済。`isProposeComplete` / `isSessionTerminated` は session オブジェクトに対する純粋関数として分離されている。
- **Prompt 構造**: `src/prompts/propose-system.ts` は `*_SYSTEM_PROMPT` 定数 + `*_INITIAL_MESSAGE_TEMPLATE` 定数 + `buildInitialMessage(input)` 関数の 3 点セットで構成される。本 request の `spec-review-system.ts` は同一パターンが期待される。
- **エラーハンドリング規約**: `SpecRunnerError` 派生のファクトリ (`branchNotRegisteredError` 等) が `src/errors.ts` に集約され、code / message / hint の 3 フィールドで failJobState に渡される。

## 2. 共通化すべき箇所と理由

### 2.1 `sessions.retrieve()` ポーリング処理 — 軸: reusability

**観測根拠**: `src/core/completion.ts:58` `pollUntilComplete(client, sessionId, abortSignal, opts)` が既に `timeoutMs` / `sleepFn` 注入 / 指数バックオフ / `terminated` 検知 / abort 観察を備える。tasks.md 4.4 は spec-review 用に「10 秒間隔・10 分 timeout・`ended`/`terminated` 検知」を新規実装する内容になっているが、これは `pollUntilComplete` の機能サブセット。

**推奨**: spec-review step は `pollUntilComplete` を `{ timeoutMs: config.specReview.timeoutMs }` で再利用する。`isProposeComplete` の `status === "idle"` 判定を spec-review でも使うか、もしくは `pollUntilComplete` に「完了とみなす status の集合」を渡せる引数（`isComplete?: (s: Session) => boolean` 注入）を追加する。

**理由**: 2 つのポーリング実装を持つと、再開（Phase 2）・リトライポリシー・jitter チューニング・`SESSION_TIMEOUT` エラーハンドリングが二重化する。今回の request で 1 つの関数に集約しておかないと、implementer / code-review 接続時に 3 重化が確定する。

**注意**: design.md は spec-review を `ended` で判定する旨記載しているが、`isProposeComplete` は `status === "idle"` で判定している。SDK の status 値の確認が必要（spec-review-session/spec.md は `ended`、completion.ts は `idle`）。これは spec-review 側で要 verification。

### 2.2 verdict パース関数 — 軸: SRP / testability

**観測根拠**: tasks.md 4.5-4.7 は spec-review.ts に「GitHub API 取得 + 404 リトライ + verdict 行 regex パース + フェイルセーフ」を 1 ファイルに含める指示。

**推奨**: 以下 3 関数に分解する。
- `parseVerdict(content: string): "approved" | "needs-fix" | "escalation" | null` — 純粋関数、`src/core/steps/spec-review-verdict.ts` または同一ファイル内 export。
- `fetchSpecReviewResult(deps, slug, branch): Promise<string | null>` — 404 リトライ込み。
- `runSpecReviewStep(state, deps)` — 上記 2 つを組み立てて state を更新する step orchestrator。

**理由**: regex パースは regex の境界値テスト（複数 verdict 行・大文字小文字・末尾スペース）が必要であり、HTTP モック無しでテストしたい。fetch 部分は GitHub API モックでテストしたい。step 全体は両方を mock してフローテストしたい。3 階層を 1 関数に書くと、テストが「mock GitHub fetch + mock client + mock sleep」の 3 重 mock になり保守困難。

### 2.3 「session 作成 + 初回メッセージ送信 + ポーリング」の最小単位 — 軸: reusability / coupling

**観測根拠**: propose は SSE 必須なので非対称だが、spec-review / implementer / code-review はいずれも「session create → events.send → pollUntilComplete → 結果取得」の同一形状になる見込み (ADR-20260424)。

**推奨（Phase 1 では非採用、メモのみ）**: 本 request では spec-review.ts に inline で書き、implementer 接続時 (次 request) に `runStandardSession(deps, prompt, completionCheck)` のような共通 helper として抽出する。今 inline で書く理由は abstraction premature を避けるため（n=1 では設計対象が見えない）。

**理由**: 1 サンプル (spec-review) のみで abstraction を切ると、implementer / code-review の差分（Custom Tool 有無・タイムアウト・初回メッセージ構造）を予測で組み込むことになる。これは Out-of-Scope（extensibility）の判断を含むため、今回は inline 実装で良い。共通化判断は implementer 接続時 (n=2) に行う。

## 3. 既存ヘルパー/ユーティリティの活用候補

| 既存ヘルパー | 場所 | spec-review での活用 |
|---|---|---|
| `pollUntilComplete` | `src/core/completion.ts:58` | spec-review のポーリング実装の core として再利用（上記 2.1 参照） |
| `isSessionTerminated` | `src/core/completion.ts:38` | spec-review でも `terminated` 検知に流用可 |
| `createSession` / `retrieveSession` | `src/sdk/sessions.ts:33,43` | spec-review session 作成・取得で再利用 |
| `sendEvents` | `src/sdk/sessions.ts:63` | 初回メッセージ送信で再利用 |
| `appendHistory` / `updateJobState` / `failJobState` | `src/state/store.ts` | step 関数内の state 更新で再利用 |
| `getFileContent` | github-api-lib (design.md 記載) | spec-review-result.md 取得で必須再利用。404 → null の挙動が前提に組み込まれている |
| `SpecRunnerError` ファクトリ | `src/errors.ts` | `SPEC_REVIEW_RESULT_NOT_FOUND` / `SESSION_TIMEOUT` / `SESSION_TERMINATED` を新規ファクトリとして追加 |
| `PROPOSE_SYSTEM_PROMPT` の構造 | `src/prompts/propose-system.ts` | `spec-review-system.ts` のテンプレート構造の参考 |
| `buildInitialMessage` パターン | `src/prompts/propose-system.ts:33` | `<user-request>` XML タグ injection 規約をそのまま踏襲 |

未活用の懸念: tasks.md の 4.4 が `pollUntilComplete` を参照しておらず、新規ポーリングロジックを spec-review.ts 内に書くように読める。これは 2.1 で指摘した重複。

## 4. 分割単位の推奨

### 4.1 `runProposePipeline` の薄いラッパーを残すか削除するか — 軸: coupling / SRP

**観測根拠**: `src/cli/run.ts:88` が唯一の `runProposePipeline` 呼び出し元。tasks.md 6.1 で `runPipeline` への置換が予定されている。design.md の Decision 1 の「実装メモ」には「後方互換のため `runProposePipeline` は薄いラッパーとして残す（または call site を `runPipeline` 呼び出しに置換）」と両論併記。

**推奨**: ラッパーを残さず、`runProposePipeline` を `runPipeline` で完全置換し、`src/core/steps/propose.ts` のみを残す。理由は (a) 内部 API なので外部互換要件はない、(b) ラッパーが残ると将来の保守者がどちらを使うか迷う、(c) 既存テストは step 関数 + runPipeline 統合テストに置換する方針 (tasks.md 2.4, 5.6) なので、ラッパーをテストする意味がない。

### 4.2 `JobState.steps` と `state.step` / `state.session` の関係 — 軸: cohesion / readability

**観測根拠**: design.md Decision 2 は `state.steps: Record<string, StepResult>` を追加しつつ、`state.session` / `state.step` は「現在実行中の step を指す」フィールドとして残す方針。これは 2 つの真実源を作る。

**推奨**:
- `state.session` / `state.step` を「派生フィールド」と明示的に位置づけ、`updateCurrentStep(state, name)` のような 1 関数からのみ更新する。
- step 関数内で `state.session` を直接書き換えるロジック (`src/core/pipeline.ts:65-72` 相当) は、`appendStepResult(state, "spec-review", { session })` の中に移し、副作用として `state.session` も同期する形にする。
- もしくは将来的に `state.session` / `state.step` を deprecated にし `steps` のみを真実源にする方向を design に明記する。

**理由**: 2 つの真実源が並走すると、`specrunner ps` の表示・state 復元・テスト assertion でどちらを参照するか分岐が増え、SRP 違反となる。今回 `steps` を導入する責務は「N-step に拡張可能な journal」を作ることなので、レガシーフィールドの位置付けを明示せずに残すのは設計の半端な状態。

### 4.3 `src/core/steps/spec-review.ts` の内部分割 — 軸: testability / SRP

**観測根拠**: tasks.md 4.1-4.9 の全工程が単一ファイル `src/core/steps/spec-review.ts` に詰め込まれる予定。

**推奨**:
- `parseSpecReviewVerdict(content): VerdictParseResult` — 純粋関数。VerdictParseResult は `{ verdict: Verdict | null, summary?: string }`。
- `fetchSpecReviewResult({ githubFetch, token, owner, name, slug, branch, sleepFn }): Promise<string | null>` — 404 → 1秒×3 リトライ込み。
- `runSpecReviewStep(state, deps)` — session 作成・初回メッセージ・`pollUntilComplete` 呼び出し・上記 2 関数の組立・state 更新。

**理由**: 単一ファイル内で関数分離するだけでも、テストは「regex 単体テスト」「fetch リトライ単体テスト」「フロー統合テスト」の 3 軸に分けられる。特に regex は「verdict 行が複数」「先頭/末尾の空白」「`approved`/`Approved`/`APPROVED` 大文字小文字」「コードブロック内の偽 verdict」など境界条件が多く、HTTP モック抜きでテストしたい。

### 4.4 `runPipeline` の step 配列の宣言場所 — 軸: coupling / extensibility (Out-of-Scope 注記)

**観測根拠**: tasks.md 5.1 は `[runProposeStep, runSpecReviewStep]` を `runPipeline` 内に直接配列で書く想定。

**推奨（Phase 1 はこのままで OK）**: 配列を `runPipeline` 関数内 const として持つ。implementer / code-review 接続時に「配列を引数化するか、別ファイルに切り出すか」を再検討する。今回 register 機構を導入するのは過剰設計。

**Out-of-Scope 注記**: 「将来 N-step に拡張する際の register 機構の必要性」は extensibility（将来予測）の判断なので、本エージェントのスコープ外。spec-reviewer / architect のレベルで判断する。

## Notes

- **Out-of-Scope 観察事項**:
  - `runPipeline` の step 配列を将来的に register 機構（plugin system）にすべきかは extensibility の判断であり、本エージェントは推奨を出さない。
  - spec-review エージェントが Custom Tool を使わない決定 (Decision 1 of design / spec) は security boundary（プロンプトインジェクション・ファイル書き込み権限）の判断を含むため、本エージェントの分析対象外。
  - 4 セッション直列モデル（propose / spec-review / implementer / code-review）の境界はドメイン判断なので、本エージェントの分析対象外。
- **要 verification**: SDK の `BetaManagedAgentsSession.status` の取りうる値（`idle` / `ended` / `terminated`）について、design.md と既存コードで命名が分かれている（`isProposeComplete` は `idle` を使う、spec-review-session/spec.md は `ended` を使う）。実装前に SDK の実際の status enum を確認する必要がある。
