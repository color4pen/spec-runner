## Context

PR #22 で `runPipeline` は `[propose, spec-review]` の 2 step を直列に実行する形になっており、spec-review が `needs-fix` を返した時点でパイプラインは停止する暫定実装になっている。本 request では openspec-workflow 本来の挙動である「spec-review needs-fix → spec-fixer → 再 spec-review」の自動修復ループを実装する。

このループは spec-review だけでなく、後続の code-review でも同型で再利用される予定であり、いま spec-fixer を実装するタイミングで Pipeline 層の汎用 loop プリミティブとして確立しておくことが構造的に正しい。

加えて、PR #19 / PR #22 で得た Managed Agents の制約（ADR-20260429-positioning-vs-gsd-and-openspec）を前提とする：

- `SessionCreateParams` に `system` フィールドはなく、per-session の system prompt 上書きはできない
- Agent の system prompt / tools / model は Agent 単位で固定される
- 同一 Agent を異なる role で再利用すると、system prompt と user message が矛盾する
- Custom Tool は Agent 単位で定義され role-specific に出し分けできない

このため spec-fixer は **専用 Agent** として実装する。propose Agent との混在を構造的に防ぐ。

依存: PR #22（merged）の `runSpecReviewStep` / `StepResult` / `runPipeline` の上に積む。

## Goals / Non-Goals

**Goals:**

- spec-review の needs-fix verdict を起点とする spec-fixer → spec-review iteration loop を自動化する
- iteration loop プリミティブを Pipeline 層に確立し、後続の code-review でも再利用できる API として設計する
- spec-fixer 専用 Agent を新設し、Managed Agents 制約を構造的に回避する
- config schema に `agents.{propose, specReview, specFixer}` を導入し、後方互換を保ったまま role 別 Agent を扱えるようにする
- `JobState.steps[stepName]` を配列化して iteration ごとの結果を時系列保存する
- retry 上限到達時の挙動を `escalation` verdict + `error.code = SPEC_REVIEW_RETRIES_EXHAUSTED` に統合する

**Non-Goals:**

- Step interface の汎用化（spec-fixer 実装後に 3 step 揃った時点で別 request）
- iteration の plateaued / regressing 検出（GAN ループ収束判定は別 request）
- spec-review 専用 Agent への移行（本 request では spec-review は既存 Agent を流用）
- implementer / code-review セッションの実装
- decision logging（subagent 横断）
- iteration 間で前回 fixer の差分を要約して spec-review に渡す高度な orchestration

## Decisions

### D1. Loop プリミティブは Pipeline 層に置く（spec-fixer step 内に閉じない）

`src/core/loop.ts` を新設し、`runLoopUntil(state, deps, opts)` を export する。

```ts
type LoopVerdict = "approved" | "needs-fix" | "escalation";

interface LoopOptions {
  body: (state: JobState, deps: PipelineDeps, iter: number) => Promise<JobState>;
  evaluator: (state: JobState) => { verdict: LoopVerdict; reason?: string };
  maxIterations: number;
  onExceeded?: (state: JobState) => Promise<JobState>; // default: escalation 書き込み
  loopName: string; // ログ・state.history のため
}

export async function runLoopUntil(
  state: JobState,
  deps: PipelineDeps,
  opts: LoopOptions,
): Promise<JobState>;
```

挙動:

1. iter = 1 から開始。`body(state, deps, iter)` を呼ぶ。
2. body 実行後 `evaluator(state)` を呼ぶ。
3. `approved` → exit（成功）。
4. `escalation` → exit（fixer 起動なし）。
5. `needs-fix` かつ `iter < maxIterations` → iter += 1 で次反復。
6. `needs-fix` かつ `iter >= maxIterations` → `onExceeded(state)` を呼んで exit。

**body は「1 iteration の中で行う処理一式」を内部で完結させる**。spec-review ループの場合、iteration N では `body = spec-fixer step（iter ≥ 2 の場合のみ）→ spec-review step` が連結される。これにより iter=1 は spec-review のみ、iter ≥ 2 は spec-fixer → spec-review の順で実行される。

**Alternatives considered:**

- spec-fixer step 内で spec-review を呼ぶ「逆ネスト」案 — spec-fixer の責務（修正）とループ制御（再評価）を混ぜることになり、code-review で再利用するときに同じ罠が再現する。却下。
- step interface 化と loop を同時に — request.md で明示的にスコープ外。spec-fixer 実装で 3 step 揃ってから別 request で実施する方が安全。却下。

### D2. iteration ごとにセッションを新規作成する（既存セッションへの追記ではない）

各 iteration は spec-fixer / spec-review それぞれ新規 `sessions.create` を呼ぶ。前 iteration のセッション ID は state に履歴として残るが再利用しない。

理由（**Author-Bias Elimination**）:

- spec-review が前回の自分の指摘を覚えていると、修正後も同じ視点に偏った評価を下しやすい
- 新規セッションで「初見」として change folder を読むことで、確証バイアスを構造的に低減する
- セッション作成コストは agent retrieve + create の API 呼び出しのみで許容範囲

**Alternatives considered:**

- 既存セッションに `events.send` で追記して再評価 — 上記バイアス問題に加え、セッションのコンテキスト窓を圧迫する。却下。

### D3. `config.pipeline.maxRetries` で iteration 上限を設定可能にする（既定 2）

既定値 2 は openspec-workflow 準拠。`config.json` に `pipeline.maxRetries` キーを追加。値の意味は「**body の最大実行回数**」（= iter=1, iter=2 で計 2 回 spec-review が走る、最大 1 回 spec-fixer が走る）。

`request.md` 由来の override（per-request 上限）は本 request ではスコープ外（design 評価結果として「設定可能化はするが per-request override は次 request」と決定）。

**Alternatives considered:**

- ハードコード 2 — 将来の調整可能性を奪う。却下。
- per-request override を同 request で実装 — request.md パーサ拡張・優先順位ルール定義が必要になり、scope が膨らむ。却下。

### D4. retry 上限到達時の verdict は `escalation` に統合し、`error.code` で詳細を区別する

新しい verdict 値（例: `retries-exhausted`）は導入しない。代わりに:

- `state.steps["spec-review"]` の最終 iteration の verdict を `escalation` で上書き
- `state.error = { code: "SPEC_REVIEW_RETRIES_EXHAUSTED", message: "...", hint: "..." }` を書き込む
- stdout に `[iter N] retries exhausted, escalating` を出力

**Alternatives considered:**

- 新 verdict `retries-exhausted` を導入 — 既存の verdict 3 値を消費する側（state file 読み取り、UI 表示など）の場合分けが増える。`escalation` で統合し詳細は `error.code` で区別する方が変更面積が小さい。却下。

### D5. spec-fixer 専用 Agent を新設（Custom Tools なし）

`src/init/agent.ts` を `createOrReuseProposeAgent` と `createOrReuseSpecFixerAgent` の 2 関数に分割する。spec-fixer Agent の定義は:

- `system_prompt`: `buildSpecFixerSystemPrompt()` 由来の文字列。修正のみ実行、レビュー・方針変更は禁止、Author-Bias Elimination の精神を明記する
- `custom_tools`: **空配列**（`register_branch` を含めない）
- `toolset`: `agent_toolset_20260401`（標準ツールのみ）
- `model`: propose Agent と同モデル（既定: claude-opus-4-7-1m）

**理由（Managed Agents 制約）:**

- spec-fixer は ブランチ登録（register_branch）の責務を持たない。propose 時点ですでにブランチは登録済みのため、spec-fixer は通常の git push のみ行う
- propose Agent と spec-fixer Agent で異なる system prompt を持たせるには Agent ごと分けるしかない
- Custom Tools が role-specific でないことから、Custom Tools を持たない Agent を別途用意する

`specrunner init` の post-init 不変条件は以下に拡張する:

- (a) `config.agents.propose.id` が retrieve 可能、`custom_tools` に `register_branch` を含み、`toolset.type = agent_toolset_20260401`
- (b) `config.agents.specFixer.id` が retrieve 可能、`custom_tools` が空、`toolset.type = agent_toolset_20260401`
- (c) `config.environment.id` が retrieve 可能

**Alternatives considered:**

- 同一 Agent を流用し user message で role を指定 — PR #22 で踏んだ罠そのもの。Managed Agents の制約として根本的に矛盾する。却下。

### D6. config schema 拡張と backward compat

新フォーマット:

```json
{
  "version": 1,
  "anthropic": { "apiKey": "..." },
  "agents": {
    "propose": { "id": "agent_01x", "definitionHash": "...", "lastSyncedAt": "..." },
    "specFixer": { "id": "agent_02y", "definitionHash": "...", "lastSyncedAt": "..." }
  },
  "agent": { "id": "agent_01x", "definitionHash": "...", "lastSyncedAt": "..." },
  "environment": { "id": "env_z", "lastSyncedAt": "..." },
  "github": { "accessToken": "...", "tokenObtainedAt": "...", "scopes": [] },
  "pipeline": { "maxRetries": 2 }
}
```

読み取り側のフォールバック規則:

1. `config.agents.{role}.id` が存在 → それを使う
2. なければ `config.agent.id`（旧形式）にフォールバック → propose role のみ許可。spec-fixer / specReview ロールでは `CONFIG_INCOMPLETE` エラーで `Run 'specrunner init' to create role-specific agents.` を返す
3. `config.pipeline.maxRetries` 未設定 → 既定 2 を使う

書き込み側:

- `specrunner init` は新規 / 更新時に必ず `config.agents.{propose, specFixer}` を書き込む
- `config.agent.id` も propose Agent の ID と同期して書き続ける（旧コードパスとの互換のため）。deprecation コメントを JSON コメントではなく型定義の TSDoc に記す（JSON はコメント不可）

**Alternatives considered:**

- 旧形式の即廃止 — 既に書き込まれた config を破壊する。却下。
- `agents` のみで `agent` を消す — config を読む既存コード（ps コマンド等）が壊れる可能性。残しつつフォールバックチェーンに組み込む。

### D7. `JobState.steps[stepName]` を配列化、`StepResult.iteration` を必須化

```ts
interface StepResult {
  iteration: number; // 1-origin
  session: { id: string; agentId: string; environmentId: string };
  verdict: "approved" | "needs-fix" | "escalation" | null;
  findingsPath: string | null;
  completedAt: string | null;
  error: ErrorInfo | null;
}

interface JobState {
  // ...既存フィールド
  steps: Record<string, StepResult[]>;
}
```

書き込み:

- spec-fixer / spec-review は完了時に `pushStepResult(state, stepName, partial)` を呼ぶ（直接 `.push()` ではなくヘルパ経由）
- `result.iteration` は `state.steps[stepName].length` 由来で振る（push 前の長さ + 1）
- 既存の merge-style `appendStepResult`（`src/state/schema.ts`）は本 delta で削除し、全呼び出し元を `pushStepResult` に置換する

読み取り（後方互換ヘルパ）:

- `getLatestStepResult(state, stepName): StepResult | undefined` を提供
- 既存コードが `state.steps["spec-review"].verdict` 形式で参照していた場合は `getLatestStepResult` 経由に置換
- `pushStepResult` と `getLatestStepResult` はペアヘルパとして `src/state/helpers.ts` に配置する

旧形式（オブジェクト）の状態ファイルとの互換:

- 状態ファイル読み込み層 (`src/state/io.ts`) で `state.steps[name]` がオブジェクトだった場合、長さ 1 の配列 `[{ ...obj, iteration: 1 }]` に正規化してから返す
- version は据え置き（version: 1 のまま）。スキーマ変更だが破壊的ではない

**Alternatives considered:**

- 別キー（`steps_v2` 等）を新設 — 二重管理が発生し読み手側の場合分けが増える。`steps` を直接拡張し読み込み層で正規化する方がシンプル。却下。
- version をバンプして migration を強制 — 後方互換ロジックの方が CLI の usability を保てる。却下。

### D8. `runPipeline` リファクタ — step + loop の合成（`PipelineDeps` を `src/core/types.ts` に切り出し）

`PipelineDeps` 型は `src/core/types.ts` に切り出す（module-architect decision 行 1 / module-analysis 2.2 より）。`src/core/pipeline.ts` と `src/core/loop.ts` の双方が `types.ts` からこの型を import することで、`pipeline.ts` ↔ `loop.ts` の循環 import を構造的に防ぐ。`src/core/steps/*.ts` も同様に `types.ts` から import する。

旧:

```ts
state = await runProposeStep(state, deps);
if (state.status !== "success") return state;
state = await runSpecReviewStep(state, deps);
return state;
```

新:

```ts
state = await runProposeStep(state, deps);
if (state.status !== "success") return state;

state = await runLoopUntil(state, deps, {
  loopName: "spec-review",
  maxIterations: deps.config.pipeline.maxRetries,
  body: async (s, d, iter) => {
    if (iter > 1) {
      s = await runSpecFixerStep(s, d); // 内部で writeJobState を呼ぶ
    }
    s = await runSpecReviewStep(s, d); // 内部で writeJobState を呼ぶ
    // runLoopUntil 自体は writeJobState を呼ばない。persist は step 関数の責務
    return s;
  },
  evaluator: (s) => {
    const last = getLatestStepResult(s, "spec-review");
    return { verdict: last?.verdict ?? "escalation" };
  },
  onExceeded: async (s) => {
    const last = getLatestStepResult(s, "spec-review");
    if (last) last.verdict = "escalation";
    s.error = {
      code: "SPEC_REVIEW_RETRIES_EXHAUSTED",
      message: `spec-review did not approve after ${deps.config.pipeline.maxRetries} iterations`,
      hint: "Review spec-review-result-<NNN>.md and adjust the request manually.",
    };
    return s;
  },
});

return state;
```

公開 API（`runPipeline(state, deps)`）のシグネチャは無変更。内部実装のみ書き換える。

### D9. `src/core/steps/spec-fixer.ts` と `src/prompts/spec-fixer-system.ts` の責務

**`src/core/steps/spec-fixer.ts`** — `runSpecFixerStep(state, deps): Promise<JobState>` を export。

責務:

1. 直前の spec-review iteration の `findingsPath`（`spec-review-result-{NNN}.md`）を `state.steps["spec-review"]` の末尾要素から取得
2. spec-fixer Agent ID を `getAgentId(deps.config, "specFixer")` で解決
3. `client.beta.agents.sessions.create({ agent: { id, type: "agent" }, environment_id, resources: [{ type: "github_repository", ... }] })` でセッション作成（Custom Tools なし、リポジトリマウントあり）
4. `events.send` で初回 user message を送信（`<user-request>` XML タグで囲む）。本文に: change folder のパス、findings ファイルのパス、ブランチ名、spec-fixer system prompt 由来の修正手順
5. `pollUntilComplete({ timeoutMs: config.specFixer?.timeoutMs ?? 600_000 })` で完了まで待機
6. 完了後 `state.steps["spec-fixer"].push({ iteration, session, verdict: null, findingsPath: null, completedAt, error: null })`
7. spec-fixer は verdict を返さないため `verdict: null`。findings も生成しないため `findingsPath: null`
8. ブランチへの commit + push は session 内部の標準ツール（git）で行う。spec-fixer step 自体は session 完了を確認するのみ

**`src/prompts/spec-fixer-system.ts`** — `buildSpecFixerSystemPrompt(input): string` を export。

system prompt の核:

- 「あなたは spec-fixer です。spec-review の findings に対する **修正のみ** を行います」
- 「レビュー、方針変更、新たな要件追加は禁止です」
- 「findings の各行（`# | Severity | Category | File | Description | How to Fix`）に対して、`How to Fix` を実装してください」
- 「修正完了後、必ずブランチに commit + push してください。push が完了するまで session を終了しないでください」
- 「修正不能な findings に対しては、proposal.md または design.md の末尾に `<!-- spec-fixer-deferred: ... -->` でメモを残し、それ以外を可能な限り修正してください」
- Author-Bias Elimination の精神: 「**新規セッションのため前回の文脈を持ちません**。findings ファイルと change folder の現状のみを見て修正してください」

### D10. iteration progress stdout

`runLoopUntil` 内部で標準フォーマットを採用:

- iter 開始時: `[iter N/MAX] starting <loopName>` （N=現在 iter、MAX=maxIterations）
- spec-review 完了時（loop body 内で書き出し）: `[iter N] spec-review verdict: <verdict>`
- needs-fix → 次 iter 突入: `[iter N] spec-review verdict: needs-fix → spawning spec-fixer`
- approved exit: `[iter N] spec-review verdict: approved → done`
- escalation exit: `[iter N] spec-review verdict: escalation → halt`
- 上限超過: `[iter N] retries exhausted, escalating`

最終結果サマリは runPipeline 終了時に `Pipeline finished: spec-review iterations=N, final verdict=<v>` を 1 行で出す。詳細な verdict 推移は `state.steps["spec-review"]` の各要素を辿れば再現可能。

### D11. spec-fixer のセッション完了検知と timeout

spec-fixer は spec-review と同様 `pollUntilComplete` で `status === "idle"` を待つ。timeout は config.specFixer?.timeoutMs（既定 10 分）。`status === "terminated"` で `error.code = "SESSION_TERMINATED"`、timeout で `error.code = "SESSION_TIMEOUT"` を state.steps["spec-fixer"] の末尾要素に書き込む。loop の evaluator は spec-review 結果を見るため、spec-fixer の失敗自体は次 iter の spec-review に再評価を委ねる。ただし spec-fixer step が `state.status = "failed"` を返した場合は loop body 自体が失敗扱いとなり runPipeline は即座に return する（runPipeline の既存契約）。

## Risks / Trade-offs

- **[Risk] iteration ごとに新規セッションを作るためコストが増える** → spec-review の API 呼び出しは agent retrieve + session create + events.send + poll で 1 回の追加ループあたり数十円〜数百円のオーダー。許容範囲（コスト最適化は別 request）。
- **[Risk] `JobState.steps` の配列化で既存テスト・ps コマンドの場合分けが破綻する可能性** → 読み込み層で旧形式 → 配列正規化を一元的に行う。既存テストは `getLatestStepResult` ヘルパ経由に置換し、外向けインターフェースは維持。
- **[Risk] spec-fixer Agent の system prompt が修正範囲を逸脱して新規要件追加に走る** → system prompt 内で「修正のみ・方針変更禁止」を強く明記し、verification（next request）で spec-fixer 出力に対する spec-review 再評価ループを回す（本 request の loop そのもの）。プロンプトインジェクション耐性は `<user-request>` XML タグで担保（spec-review と同パターン）。
- **[Risk] retry 上限到達時に `escalation` を上書きする処理が前回の `needs-fix` を覆い隠す** → state.steps["spec-review"] は配列なので過去 iteration の verdict は全て保存される。最終要素のみ `escalation` で書き換えるため、履歴は失われない。
- **[Risk] spec-fixer の git push が API rate limit に当たる** → spec-fixer の標準ツール（git）が認証付きで push する。rate limit 個別対応は本 request ではスコープ外（標準ツールの retry 任せ）。
- **[Risk] `config.agents.specFixer.id` が無いまま run コマンドが起動される** → run 開始時に `getAgentId(config, "specFixer")` がフォールバックチェーンを辿り、見つからない場合 `CONFIG_INCOMPLETE` エラーで `Run 'specrunner init' to create the spec-fixer agent.` を返す。
- **[Trade-off] `config.agent.id` の deprecated 化を即時行わない** → 既存の ps コマンド・古い config を破壊しないため。将来の clean-up request で削除する前提。

## Session Lifecycle Helper Extraction

module-analysis 2.1 / module-architect decision 行 3 で採用。`spec-review.ts` と `spec-fixer.ts` の session 作成〜poll〜終了判定ロジック（約 80 行）を `src/core/session-runner.ts` に集約する。

**ヘルパシグネチャ:**

```ts
interface ManagedAgentSessionInput {
  agentId: string;
  environmentId: string;
  repo: { owner: string; name: string };
  githubToken: string;
  initialMessage: string; // <user-request>...</user-request> 包み済み
  timeoutMs: number;
  stepName: string; // ログ・エラーコード用
}

interface ManagedAgentSessionResult {
  sessionId: string;
  status: "idle" | "terminated" | "timeout";
  error?: { code: string; message: string };
}

export async function runManagedAgentSession(
  deps: PipelineDeps,
  input: ManagedAgentSessionInput,
): Promise<ManagedAgentSessionResult>;
```

**責務範囲（ヘルパ内部で完結する）:**

1. `sessions.create({ agent, environment_id, resources })` — セッション作成
2. `events.send` — 初回 user message 送信
3. `pollUntilComplete({ timeoutMs })` — 完了ポーリング
4. `terminated` / timeout 分岐でエラー結果を返す

**step 関数側の責務（ヘルパ外）:**

- `pushStepResult(state, stepName, ...)` の呼び出し
- `writeJobState(state)` の呼び出し（persist は step 関数の責務）
- AgentID の解決（`getAgentId(config, role)`）

**task 5.0 として tasks.md に追加済み。** `runSpecReviewStep`（task 6.1）と `runSpecFixerStep`（task 5.4/5.5）の session ライフサイクル部分はヘルパ呼び出しに置き換える。propose.ts は SSE 経由のため本ヘルパの対象外とする。

## Deprecation Plan for `config.agent.id`

`config.agent.id`（および `config.agent.definitionHash` / `config.agent.lastSyncedAt`）は本 request で deprecated とマークするが、即時削除はしない。以下の条件と手順に従って将来の clean-up request で削除する。

**削除条件（いずれかひとつを満たした時点で別 request を起票する）:**

- spec-runner Phase 2 GA 時（code-review loop が安定した段階）
- または `specrunner init` の新形式（`agents.propose` / `agents.specFixer`）への移行が既存ユーザーの実質的な全数に行き渡った確認が取れた時

**移行スクリプトの要否:**

- `specrunner init` 実行時に自動的に `agents.propose.id = agent.id` への書き込みが行われるため、明示的な移行スクリプトは不要。ただし `specrunner init` を実行しないユーザー向けに、`specrunner run` 起動時に `agent.id` が旧形式であれば propose ロールのフォールバックを許容しながら「`specrunner init` を再実行してください」の警告 (stderr) を出す。

**`config.version` バンプの判断基準:**

- `config.agent.*` の削除時に `version: 2` にバンプする。現時点では `version: 1` を維持（スキーマ変更は additive であり破壊的でない）。

**本 request での対応:**

- 型定義の TSDoc に `@deprecated` コメントを付与する（JSON はコメント不可のため型定義のみ）
- `getAgentId(config, "specFixer")` は legacy フォールバックを行わない（`CONFIG_INCOMPLETE` を返す）

## Migration Plan

1. config schema 拡張（`agents`, `pipeline.maxRetries` 追加）— 旧形式と並存
2. `specrunner init` 改修 — 既存 config に `agents.propose / agents.specFixer` を追記、Anthropic 側 Agent を冪等に作成（既存 propose Agent は再利用、spec-fixer Agent は新規作成）
3. state file 読み込み層に正規化を入れる（旧オブジェクト形式 → 長さ 1 の配列）— 既存の running ジョブが破壊されないことを保証。読み込み層は in-memory のみで正規化し、書き込み発生時（`writeJobState` 呼び出し時）に配列形式として永続化される。`specrunner ps`（読み込みのみ）では永続化が起きないため、旧形式ファイルは次回 `writeJobState` まで残る。ps コマンドは旧形式検出時に stderr へ警告を出す
4. `runLoopUntil` を新規実装、テストで単体検証
5. `runSpecFixerStep` を新規実装、`buildSpecFixerSystemPrompt` を新規実装
6. `runPipeline` を step + loop 合成にリファクタ
7. iteration progress stdout を実装
8. End-to-end テスト: spec-review needs-fix を返すフィクスチャで spec-fixer → 再 spec-review が approved を返すまでループする経路を確認

ロールバック: config の `agents` キーを無視し `config.agent.id` のみで動く旧コードパスは残しているため、`runPipeline` の loop 合成リファクタを revert すれば旧挙動に戻る。

## Open Questions

- per-request の `maxRetries` override（request.md の補足から指定可能にするか）→ 本 request では config 経由のみ。次 request で評価。
- spec-fixer が「修正不能」と自己判断した場合の早期 escalation ルート → 本 request では実装せず、retry 上限まで回す。プロンプトで `<!-- spec-fixer-deferred: ... -->` メモを残させるのみ。
- iteration 履歴を `specrunner ps` でどう表示するか → 本 request では state ファイルにすべて残るため CLI 表示は最新 iter のみ。表示拡張は別 request。
