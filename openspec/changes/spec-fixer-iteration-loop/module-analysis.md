# Module Analysis — spec-fixer-iteration-loop

Step 2.5 mechanical analysis. In-scope axes: testability, readability, cohesion, coupling, reusability, SRP. Out-of-scope: extensibility, deployment independence, security boundary, domain boundary.

This document is informational. The implementer is free to accept, modify, or ignore each recommendation.

## 1. 既存コードパターン一覧

- **Step ファイル配置パターン** — `src/core/steps/{step}.ts` に `run{Step}Step(state, deps): Promise<JobState>` を 1 関数 export する規約が確立済み (`propose.ts`, `spec-review.ts`)。新設 `spec-fixer.ts` は同形で書ける。
- **Prompt ファイル配置パターン** — `src/prompts/{role}-system.ts` に `build{Role}SystemPrompt(input): string` と `build{Role}InitialMessage(input): string` の 2 関数を export する規約 (`spec-review-system.ts`)。spec-fixer も同形で書ける。
- **Session ライフサイクル定型処理** — propose / spec-review いずれも `appendHistory(started)` → `createSession` → `updateJobState({session})` → `appendHistory(ok)` → `sendEvents(<user-request>...)` → `pollUntilComplete` → terminated/timeout 分岐 → `appendStepResult` の同じシーケンスを各ステップで再実装している。
- **エラーパス state アタッチパターン** — エラー throw 時に `(err as Record<string, unknown>)["state"] = state` で state を貼り付け、`runPipeline` 側が `errWithState.state` を取り出す方式。`propose.ts` と `spec-review.ts` の両方で踏襲。
- **State 書き込みパターン** — `appendHistory` / `updateJobState` / `appendStepResult` / `failJobState` の 4 種を経由し、最後に `persistJobState` を呼ぶ。中断耐性のため step 完了点ごとに persist。
- **Verdict 規約** — `Verdict = "approved" | "needs-fix" | "escalation"` の 3 値固定。`null` は未確定。

## 2. 共通化すべき箇所と理由

### 2.1 Managed Agent session ライフサイクルのヘルパ化 — axis: reusability

**観測根拠**: `src/core/steps/propose.ts` の L26-79（session 作成）、`src/core/steps/spec-review.ts` の L117-247（session 作成 + 初期メッセージ + polling + terminated/timeout 分岐）。両者でほぼ同じ 80 行が重複している。

**推奨**: `src/core/session-runner.ts`（仮）に `runManagedAgentSession({ agentId, environmentId, repo, githubToken, initialMessage, timeoutMs, stepName })` を新設し、spec-review / spec-fixer の両 step がこれを consume する。propose 側は SSE が絡むため別経路で良いが、`createSession` 部分のみ共有可能。

**効果**: 後続 code-fixer / code-review session でも同じヘルパが使える。loop プリミティブ導入の本来の意図（汎用化）と整合する。

### 2.2 PipelineDeps 型の専用モジュール切り出し — axis: coupling

**観測根拠**: `src/core/pipeline.ts` の L10-21 で `PipelineDeps` を定義し、`steps/propose.ts:14` と `steps/spec-review.ts:12` の両方が `import type { PipelineDeps } from "../pipeline.js"` で参照。新設 `src/core/loop.ts` も同型を必要とする（design D1）。`pipeline.ts` 自体が `loop.ts` を import すると循環 import 候補になる。

**推奨**: `src/core/types.ts` または `src/core/deps.ts` に `PipelineDeps` を切り出す。`pipeline.ts` / `loop.ts` / `steps/*.ts` のすべてがそこから import するように整える。

### 2.3 spec-review-result ファイル名生成のヘルパ化 — axis: cohesion

**観測根拠**: `src/core/steps/spec-review.ts:50` の `const filePath = \`openspec/changes/${slug}/spec-review-result.md\`` がハードコードされている。task 6.2/6.3 で `spec-review-result-{NNN}.md` への変更が必要。spec-fixer 側も初回メッセージで同じパスを参照するため、組み立てロジックが 2 箇所に出現する。

**推奨**: `src/core/spec-review-paths.ts`（仮）に `buildSpecReviewResultPath(slug, iteration): string`（3 桁ゼロ埋め）を 1 関数だけ export。spec-review.ts と spec-fixer.ts の両者がこれを consume。テスト容易性も向上する。

### 2.4 config 読み取りアクセサの同居 — axis: cohesion

**観測根拠**: 既存 `src/config/schema.ts:80` に `checkConfigComplete(cfg)` が、tasks 1.3 で新規 `src/config/getAgentId.ts` が要求されている。両者とも「config 読み取り時の検証 + フォールバック」という同じ関心事。

**推奨**: `src/config/access.ts` に `getAgentId(cfg, role)` と `checkConfigComplete(cfg)` を集約する。`schema.ts` は型定義と最小バリデータのみに留める。

## 3. 既存ヘルパー / ユーティリティの活用候補

- **`pollUntilComplete` (`src/core/completion.ts:58`)** — spec-fixer step は task 5.5 の指定どおり `pollUntilComplete({ timeoutMs })` をそのまま使える。`abortSignal` は不要なので `undefined` を渡す（spec-review 側と同パターン）。
- **`createSession` / `sendEvents` (`src/sdk/sessions.ts:33, 63`)** — SDK ラッパは既に薄い抽象として用意済み。spec-fixer step は SDK を直接呼ばず、このラッパ経由で呼ぶ規約を維持する。
- **`atomicWriteJson` (`src/util/atomic-write.ts`)** — `persistJobState` 経由で既に呼ばれている。spec-fixer step は新たな file I/O を増やさない。
- **`stderrWrite`, `logInfo` 等 (`src/logger/stdout.ts`)** — iteration progress stdout（task 4.2）は既存の logger ユーティリティ経由で出力する。loop プリミティブが直接 `process.stdout.write` を呼ばない。
- **`appendHistoryEntry` (`src/state/schema.ts:74`)** — pure transform。loop プリミティブから history を append する際、副作用なしで使える。

## 4. 分割単位の推奨

### 4.1 spec-review.ts の内部分割 — axis: SRP

**現状**: `src/core/steps/spec-review.ts` は 1 ファイル 310 行で session 作成・初期メッセージ送信・polling・GitHub fetch・verdict parse・state.status 更新を 1 関数に詰め込んでいる。

**推奨**: 以下 3 関数に分割（同一ファイル内 export でも良い）。

- `runSpecReviewStep(state, deps)` — オーケストレーション層（薄い）
- `fetchSpecReviewResult(deps, slug, branch, iteration)` — GitHub fetch（既存関数。シグネチャに `iteration` を追加）
- `parseSpecReviewVerdict(content)` — pure（既存関数のまま）

**効果**: iteration 引数が `fetchSpecReviewResult` に閉じ込められ、loop body の関心事が「session を回して結果を append する」だけになる。テストもパス組み立てを単独でユニットテスト可能。

### 4.2 loop プリミティブの位置づけ — axis: cohesion

**推奨配置**: `src/core/loop.ts`（design D1 のとおり）。`src/core/pipeline.ts` から完全に独立した module とし、`pipeline.ts` から一方向に import される。loop プリミティブ自体は spec-review / spec-fixer の知識を持たず、`body` / `evaluator` / `onExceeded` の純粋な injection 機構として保つ。

**反対方向の合成（loop が step を import）は禁止**: 後続の code-review loop でも同じプリミティブを再利用するため、loop 側に step 固有のロジックを入れないことが SRP の観点で重要。

### 4.3 `appendStepResult` の意味的衝突解消 — axis: SRP / readability

**観測根拠**: 既存 `src/state/schema.ts:135` の `appendStepResult` は **merge update**（`{ ...existing, ...partial }` を `Record<string, StepResult>` の単一スロットに書き込む）。task 2.3 で導入される新 `appendStepResult` は **array push**。同名で意味が反転する。

**推奨**: 新ヘルパは `pushStepResult(state, stepName, partial): JobState` という名前にして、配列末尾への push であることを明示する。`getLatestStepResult(state, stepName): StepResult | undefined` を併設。既存の `appendStepResult` は削除し、全呼び出し元（`propose.ts` L132, L179, L233, L376; `spec-review.ts` L236, L261, L288）を `pushStepResult` 経由に置換する。

**理由**: 同名で意味反転は「merge を期待していた既存呼び出し側が array push 側に黙って繋がる」事故を招く。型定義変更（`Record<string, StepResult>` → `Record<string, StepResult[]>`）でコンパイルエラーは出るが、`partial` 引数の形が同じなのでヒューマンエラーで誤った修正をしやすい。

### 4.4 spec-fixer step ファイル粒度 — axis: cohesion

**推奨**: `src/core/steps/spec-fixer.ts` に `runSpecFixerStep(state, deps)` のみ export。session ライフサイクルを 4.1 / 2.1 のヘルパに委譲する形にすれば、spec-fixer 自体は 60-80 行に収まる。

### 4.5 init.ts の Agent 作成ロジック分割 — axis: SRP

**観測根拠**: `src/cli/init.ts` L47-83 で propose Agent の作成・更新・404 fallback を 1 ブロックで処理している。task 3.5 で spec-fixer Agent の同様処理が追加される。

**推奨**: `src/init/agent-sync.ts`（仮）に `syncAgent(client, role, currentConfig, agentDef): Promise<AgentConfig>` を抽出。propose / spec-fixer の双方が同じ関数を呼ぶ。404 / hash mismatch / reuse の 3 分岐ロジックが 2 つの role に複製されるのを防ぐ。

## 5. Notes

- 拡張性 / デプロイ独立性 / セキュリティ境界 / ドメイン境界に関する判断は本分析のスコープ外（Step 2.5 契約に従う）。
- design D5 の「spec-fixer Agent は Custom Tools を持たない」はセキュリティ境界に関する不変条件であり、本分析は機械的観点のみで「propose Agent と異なる definition を持つ」事実を観察するに留める。
- 旧形式の state ファイル正規化（task 2.2）は I/O 層に閉じ込められており、in-memory の型を `Record<string, StepResult[]>` に統一する設計は健全。
