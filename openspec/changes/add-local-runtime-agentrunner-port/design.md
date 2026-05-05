## Context

spec-runner の現状:

- `src/core/step/executor.ts` が ~600 LOC。`runAgentStep` 内に session 作成（`SessionClient.create`）、event streaming、polling、register_branch dispatch、verifyPath / verifyBranch のすべてが集約されている
- `step-execution-architecture` spec の Requirement「StepExecutor Manages Lifecycle and Emits Events」では agent step の 1〜10 番ステップが `StepExecutor` の責務として明文化されている
- `module-boundary` spec は `core` が `@anthropic-ai/sdk` を直接 import しないことを保証するため `adapter/anthropic/` を経由する
- `register-branch-tool` spec は handler が SSE dispatch table から呼ばれることを前提にしているが、これは Managed Agents の SSE protocol に固有の概念

ローカル実行 runtime（Claude Code SDK）を導入するには 2 つの session protocol が並存することになるが、それぞれ:

- Managed Agents: SDK 経由の `createSession` → `sendUserMessage` → SSE stream → custom_tool dispatch → polling → `getResultFile`
- Claude Code SDK: `query({ cwd, prompt, additionalInstructions })` を呼ぶだけ。agent が cwd 内で直接 git 操作する。result は agent が書き出したファイルを `fs.readFile` で取る

両者を `StepExecutor` の `if/else` で分岐させると core 層が両 SDK に結合してしまい、`module-boundary` invariant を破壊する。port を 1 段切る必要がある。

stakeholders:

- **作者**: dogfooding コスト削減のため local mode が主要な使用形態になる
- **将来の利用者**: managed mode（cloud 隔離 / 並列実行）も保ちたい
- **architect**: hexagonal-lite 原則と `module-boundary` invariant を守る境界設計が必要

## Goals / Non-Goals

**Goals:**

- agent step の lifecycle 全体（session 作成・通信・結果取得・register_branch dispatch・verifyPath / verifyBranch）を **AgentRunner port 1 つ** に集約する
- managed adapter / claude-code adapter は **完全に独立**（相互 import なし）に保つ
- `StepExecutor` から session protocol への結合を完全に切る（AgentRunner.run() を呼んで結果を parse + state 更新するだけにする）
- managed mode の動作は完全に regression-free（既存テストが green、既存 dogfooding と同一挙動）
- local mode で propose → implementer → verification → code-review の pipeline が完走する
- `specrunner init --runtime local` を **API 呼び出しゼロ**で完了させる（AgentSyncer skip）

**Non-Goals:**

- CliStep（VerificationStep / PrCreateStep）への runtime 切替適用は対象外（CliStep は SDK 非依存）
- managed mode と local mode を **同一 PR 内で混在実行する** 機能は対象外（job ごとに 1 runtime）
- code-review / spec-review の verdict format / parser 共通化（既存の `parseReviewVerdict` を踏襲）
- top-level `specReview` / `specFixer` timeout config の rename（cli-config-store 既存方針通り）

## Decisions

### D1. AgentRunner は単一メソッド `run(context): Promise<AgentRunResult>`

**Decision**: `AgentRunner` interface は `run` ただ 1 つを持つ。

```ts
type AgentRunContext = {
  step: AgentStep;          // step.agent / step.name / step.toolHandlers / buildMessage / resultFilePath
  state: JobState;          // 現状 state（branch など含む）
  branch: string;           // INPUT: CLI が決めた feat/<slug>
  slug: string;
  cwd: string;              // worktree path
  requestContent: string;   // request.md / pipeline-context.md などプロンプト材料
  config: SpecRunnerConfig; // runtime 固有 config 含む
  emit: (e: DomainEvent) => void;
};

type AgentRunResult = {
  completionReason: "success" | "error" | "timeout";
  resultContent: string | null;  // adapter が adapter 固有手段で取得済み（managed: GitHub API, local: fs.readFile）
  sessionId?: string;            // managed のみ。local では undefined
  error?: Error;
};
```

**Rationale**: 1 メソッドにすることで `StepExecutor` の dispatch がただの `await runner.run(ctx)` になる。multi-method（`createSession` / `pollUntilComplete` / `getResult` を別 method に分ける）案は managed 向けには自然だが、local では何もすることがない（`query()` は同期的にすべて完結）ため inversion of control が逆に複雑になる。

**Alternatives considered**:

- **A. method を 3 つ（session create / message send / result fetch）に分ける**: managed には自然だが、local では空 method が並ぶ。Liskov 違反気味
- **B. AgentRunner ではなく StepExecutor 自体を runtime 別に 2 つ作る**: `StepExecutor` は CliStep の責務も持つため、二重実装になる。step.kind === "cli" の経路がまったく重複する
- **C. callback 駆動（runner が StepExecutor の hook を呼ぶ）**: 非同期 callback の順序が両 runtime で揃わず、テストが難しい

### D2. ResultReader port は切らず AgentRunner が resultContent を返す

**Decision**: AgentRunResult は `resultContent: string | null` を持ち、adapter が適切な手段で取得して返す。

- managed: `GitHubClient.getFileContent(branch, path)` で取得
- local: `fs.readFile(path.join(cwd, resultFilePath))` で取得

**Rationale**: result の取得手段は session protocol と密に結合しており（managed では agent が push した結果を branch から fetch する必要がある、local では cwd 内のファイル）、AgentRunner の中に閉じ込めるのが自然。別 port を切ると `StepExecutor` が AgentRunner と ResultReader の 2 つを呼び分ける必要がでて、結局 runtime 分岐が漏れる。

**Trade-off**: AgentRunner の責務は若干広いが、step lifecycle の終端で「結果を読む」ところまで含むのは run() の自然な範囲。ResultReader を将来分離したくなれば、AgentRunner 内部の helper として抽出して再分離できる。

### D3. register_branch Custom Tool は managed-agent adapter 内に閉じ込める

**Decision**: `src/core/tools/register-branch.ts` 相当を `src/adapter/managed-agent/tools/register-branch.ts` に移動。core/step は register_branch を知らない。

**Rationale**: register_branch は Managed Agents の SSE protocol（`agent.custom_tool_use` event → handler dispatch → `user.custom_tool_result`）に固有。local runtime では agent が直接 `git checkout -b` する（cwd 経由）ため tool 自体不要。core 層に置くと local runtime にも漏れる。

`register-branch-tool` spec の Requirement「definition と handler は同一モジュールに colocate される」は維持され、所有層が adapter に下る変更となる。

**Alternatives considered**:

- **A. core に置いたまま runtime === "local" のときだけ tool 登録を skip する**: core が runtime 概念を知ることになり module-boundary 違反気味
- **B. register_branch を Step 自身の `toolHandlers` に持たせる（既存の step-execution-architecture 仕様通り）**: ProposeStep は managed / local 両 runtime で使われる共通実装になるため、tool definition を持つかどうかが runtime 依存になり Step が runtime を意識せざるを得なくなる。tool definition は managed-agent adapter が ProposeStep の `agent.role === "propose"` を見て **adapter 側で注入する** 形に変える

`step-execution-architecture` spec の Scenario「register_branch handler is owned by ProposeStep」は MODIFIED 対象（次の RENAMED 併記が必要）。

### D4. Branch は CLI が `feat/<slug>` で決定論的に導出して prompt に注入

**Decision**: 現在 propose agent が `register_branch` で「自分が作った branch を教える」モデルを、「CLI が決めて agent に渡す」モデルに変更。

```
slug = state.request.slug                  // 既に決まっている
branch = `feat/${slug}`                    // CLI が決定
// AgentRunContext.branch に入れて adapter に渡す
// adapter は prompt に「このブランチを使え」と instruction として注入
```

**Rationale**:

- PR #42 の slug single-source-of-truth（slug は CLI 由来、agent が再生成しない）の延長
- managed mode でも、register_branch を「branch を CLI に教える」用途ではなく「branch が確定したことを CLI に通知する ack」に格下げできる（後方互換のため tool 自体は残すが、CLI は agent からの値を信用せず CLI 側の値を canonical にする）
- local mode では tool 自体不要

**Trade-off**: 既存 branch-registration spec の「last-write-wins で agent からの値を採用する」挙動を「CLI 値を canonical とし、agent からの値は ignored / logged のみ」に弱める。これは MODIFIED Requirement として明記。

### D5. verifyPath / verifyBranch は AgentRunner adapter 内に吸収

**Decision**: 現状 `StepExecutor` 内（あるいは propose 経路の helper）に集約されている GitHub branch / path 検証を、AgentRunner adapter の `run()` 内部に移す。

- managed: 既存通り GitHub API（`GET /repos/.../contents`、`GET /repos/.../branches/<name>`）
- local: `fs.existsSync(path.join(cwd, file))` / `git branch --list <name>` で同等の検証

**Rationale**: 検証の意味は「agent が約束通り branch / file を作ったか」を確認すること。実体の場所が GitHub or local fs と分かれているため、それぞれの adapter が知っている。core にこの分岐を置くと runtime 分岐が漏れる。

### D6. adapter rename: anthropic/ → managed-agent/

**Decision**: `src/adapter/anthropic/` を `src/adapter/managed-agent/` に rename。

**Rationale**: 現状の命名は SDK ベンダー（Anthropic）名だが、Claude Code SDK も Anthropic 製なので intent が曖昧。runtime model 名（managed agent vs local Claude Code）にする。`module-boundary` spec の Source Layout 表も同時更新。

### D7. config に `runtime: "managed" | "local"` を追加（default `"managed"`）

**Decision**: `cli-config-store` schema に `runtime` field を追加。

```jsonc
{
  "version": 1,
  "runtime": "managed", // ← 新設
  "anthropic": { "apiKey": "..." },
  "agents": { "...": { "agentId": "...", ... } },
  // ...
}
```

- 未設定の既存 config は load 時に `runtime: "managed"` に migration（idempotent）
- `specrunner init --runtime managed` は既存挙動。`AgentSyncer.syncAll()` を実行
- `specrunner init --runtime local` は config に `runtime: "local"` を書くのみ。`AgentSyncer` は呼ばない（API key も `anthropic.apiKey` が空でも許容）。`agents` map も空のまま

**Rationale**: cli-config-store の「`getAgentId` は config.agents から解決」ロジックは managed mode のみ呼ばれる。local mode では agent の解決が不要（Claude Code SDK は agent ID 概念を持たない）。

`agent-syncer` spec に「runtime === local では syncAll() を skip する」Scenario を追加する形で modify。

### D8. CLI composition root で adapter 注入

**Decision**: `src/cli/` の composition root が `config.runtime` を見て:

```ts
const runner: AgentRunner =
  config.runtime === "local"
    ? new ClaudeCodeRunner({ cwd: worktreePath, additionalInstructions: gitOps })
    : new ManagedAgentRunner({ sessionClient, githubClient, configStore });
```

`StepExecutor` のコンストラクタに `runner` を注入。`StepExecutor` 自身は runtime を知らない。

**Rationale**: `module-boundary` の「composition root wires concrete implementations」原則そのまま。core は port のみを見る。

### D9. prompts/ は runtime-neutral、git 操作 instruction は adapter が inject

**Decision**: `src/prompts/*.ts` は runtime に依存しない（既存のまま）。adapter の `run()` が `additionalInstructions` として runtime 固有の git 操作指示（local: 「cwd で `git checkout -b feat/<slug>` してから commit」、managed: 「register_branch を call し、push まで完了」）を prompt に追加する。

**Rationale**: prompt は「何をするか」（仕様レベル）を述べ、「どう環境を操作するか」（実行レベル）は runtime 依存。両者を分離するのが自然。Step.buildMessage は spec レベルの prompt を返し、adapter がそこに instructions を append する形。

### D10. Phase 分割と reversibility

**Decision**: 4 Phase（リファクタ → managed adapter 完成 → CLI 統合 → propose local 対応）を分離。Phase 1 で動作変更ゼロを保証してから Phase 2-4 で local mode を build up。

- Phase 1 完了時点で main にマージ可能な中間状態（managed mode 完全互換）を作れる
- Phase 2-3 完了時点で polling-style step（spec-review 等）が local で動く
- Phase 4 完了時点で full pipeline が local で動く

**Rationale**: 大規模 refactor（executor.ts ~250 LOC 移動 + 2 新 adapter + config schema 変更 + 命名変更 + 4 spec の MODIFIED）を 1 PR で投入するとレビュー困難。Phase 境界で動作 invariant を保つ事で部分的 revert 可能。

ただし本 change は **1 つの delta** として spec を書く（Phase 単位で change を分割するのは spec management の overhead が大きい）。tasks.md で Phase 別に sequence する。

## Risks / Trade-offs

- **[Risk] Claude Code SDK の API が安定していない可能性** → ClaudeCodeRunner 実装前に SDK の query() signature と event model を verify-don't-trust 原則で実装前調査する。SDK が想定外の挙動なら `Open Questions` で escalation
- **[Risk] register_branch を adapter に移すと既存 ProposeStep の責務契約が変わる** → `step-execution-architecture` spec の MODIFIED Requirement に「ProposeStep は toolHandlers を持たず、tool 注入は adapter が行う」明記。RENAMED で旧 header `Custom Tool Spec and Handler Co-located With Step` を新 header に併記
- **[Risk] managed mode 既存テスト（特に session lifecycle / register_branch dispatch）が AgentRunner port 経由になることでブレイク** → Phase 1 完了時点で全既存テスト green を受け入れ基準に含める。`bun run typecheck && bun test` を Phase 1 PR の必須 gate
- **[Risk] `runtime: "local"` で API key 不在を許容すると、誤って managed の expectation で実行される経路に漏れる** → `getAgentId(config, role)` を呼ぶ全箇所が runtime === "managed" 限定になっていることを invariant 化。CLI composition root で runtime に応じた gating を集中させる
- **[Risk] Branch を CLI 主導にすると agent が異なる branch を実際に作るリスク（commit 先がズレる）** → adapter 側で agent 完了後に `git rev-parse --abbrev-ref HEAD` (local) / GitHub API で branch existence (managed) で実態を検証。期待 branch と乖離していれば error / escalation
- **[Trade-off] AgentRunner port が広い（lifecycle 全責務）** → 将来「lifecycle の一部だけ replace したい」要求が来たら port を sub-port に分解する余地は残す。現在 2 runtime のみで sub-port 不要

## Migration Plan

### Phase 1: AgentRunner port 抽出（リファクタ・動作変更なし）

1. `src/core/port/agent-runner.ts` に interface 定義
2. `src/adapter/anthropic/` → `src/adapter/managed-agent/` rename（git mv で履歴維持）
3. `executor.ts` から session lifecycle ロジックを `ManagedAgentRunner` に移動
4. register_branch を `src/core/tools/` から `src/adapter/managed-agent/tools/` に移動
5. CLI composition root で `ManagedAgentRunner` を注入
6. Gate: `bun run typecheck && bun test` 全 green、既存 dogfood で regression なし

### Phase 2: Claude Code SDK adapter 実装

7. `package.json` に `@anthropic-ai/claude-code` 追加
8. `src/adapter/claude-code/agent-runner.ts` 実装
9. polling-style step（spec-review 等）の単体テスト追加
10. Gate: ClaudeCodeRunner の単体テスト green

### Phase 3: config + CLI 統合

11. `cli-config-store` schema に runtime 追加
12. ConfigStore migration ロジック追加
13. CLI composition root で runtime → adapter 分岐
14. `specrunner init --runtime local` 経路追加
15. Gate: `specrunner init --runtime local` が API 呼び出しゼロで完了

### Phase 4: propose step の local 対応

16. ProposeStep の buildMessage を branch INPUT 対応に更新
17. ClaudeCodeRunner の additionalInstructions（git checkout / commit / push）追加
18. local mode で full pipeline 実行確認
19. Gate: local mode で propose → implementer → verification → code-review → pr-create が完走

### Rollback strategy

- Phase 1 PR: revert で元の `executor.ts` + `adapter/anthropic/` に戻る
- Phase 2-4: `runtime: "managed"` を default にしているため、新規 config を作らない既存ユーザは無影響。問題が起きても `runtime: "managed"` で回避

## Open Questions

- **Q1**: `@anthropic-ai/claude-code` の `query()` は中断・再開できるか？ local mode で長時間 step（implementer など）を中断したいケースで Phase 2 着手前に SDK 仕様を verify-don't-trust で確認する
- **Q2**: local mode で複数 step を同一 worktree で連続実行する際、SDK の session state が leakage しないか？ 各 `query()` が独立 session として完結する前提だが、Phase 2 実装時に検証
- **Q3**: register_branch を managed adapter 内に閉じ込めた後、`branch-registration` spec の API（`requests.branch_name` DB 更新、`getRequestDetail` レスポンス）も managed mode 固有になるか？ → 現状 managed mode 専用 DB スキーマと整理、local mode では state.branch を memory のみで持つ。`request-management` 系 spec への波及は本 change の scope 外（実装後に必要であれば別 request で）
- **Q4**: Phase 4 で「local mode でも GitHubClient は pr-create 時のみ使う」とした場合、local mode でも `gh auth` は必須か？ → 必須。`specrunner login` は runtime 非依存で必要（本 change では既存挙動踏襲）
