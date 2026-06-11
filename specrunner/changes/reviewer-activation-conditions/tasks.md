# Tasks: カスタムレビューワーの起動条件を宣言的に指定できるようにする

実装順は「純粋なデータ/判定層 → パース/検証 → state/snapshot/seam → 配線（executor / transitions / factory）→ scaffold → E2E」。
interface が確定する前に widget テストを書かない（scenario 先・code 後）。各タスクは原則 `typecheck && test` を green に保ったまま進める。

## T-01: glob マッチャ（純関数）

- [x] `src/core/reviewers/glob-match.ts` に `matchGlob(pattern: string, filePath: string): boolean` を実装する（design D3）。
- [x] `**`（`/` を跨ぐ 0 個以上のセグメント）/ `*`（`/` を跨がない）/ `?`（`/` 以外 1 文字）/ リテラルをサポートし、glob を RegExp へ変換して全体一致で判定する。
- [x] 正規表現メタ文字をエスケープしてから glob 記号を置換する（注入安全）。`node:fs` 等の I/O を import しない純関数とする。

**Acceptance Criteria**:
- `matchGlob("src/auth/**", "src/auth/login.ts")` が true（unit test）。
- `matchGlob("**/*.sql", "db/migrations/001.sql")` が true、`matchGlob("src/*.ts", "src/a/b.ts")` が false（`*` は `/` を跨がない、unit test）。
- リテラル一致・不一致が正しい（unit test）。

## T-02: 起動判定の純関数と型

- [x] `src/kernel/reviewer-snapshot.ts` に `ReviewerActivation { paths?: string[]; requestTypes?: string[] }` を定義する（design D6）。
- [x] `src/core/reviewers/activation.ts` に `ActivationFacts { changedFiles: string[]; requestType: string }` / `ActivationDecision { activated: boolean; reason: string }` と `evaluateActivation(cond: ReviewerActivation | undefined, facts: ActivationFacts): ActivationDecision` を実装する（design D2）。
- [x] AND セマンティクス。評価順 requestTypes → paths。両条件不在は `activated: true`。skip 時は不一致条件を表す `reason` を返す。`matchGlob`（T-01）を使用。I/O・LLM を含まない純関数。

**Acceptance Criteria**:
- 条件無指定で `activated: true`（unit test）。
- requestTypes 一致で起動、不一致で `activated: false` + 理由（unit test、受け入れ #2）。
- paths 一致で起動、不一致で `activated: false` + 理由（unit test、受け入れ #1）。
- 両条件指定時、一方でも不一致なら skip（AND、unit test）。

## T-03: frontmatter の配列パース

- [x] `src/core/reviewers/types.ts` の `ReviewerDefinition` に `paths?: string[]` / `requestTypes?: string[]` を追加する（design D1 / D8）。
- [x] `src/core/reviewers/definition.ts` の frontmatter parser を拡張し、inline flow（`paths: [a, b]`）と block sequence（key 行が空値 + 後続 `  - item` インデント行）の両記法で `paths` / `requestTypes` をパースする。要素の前後の引用符・空白を除去する。スカラ key（name / maxIterations / model）の既存挙動は不変。

**Acceptance Criteria**:
- inline flow `paths: ["src/**", "lib/**"]` が `["src/**", "lib/**"]` にパースされる（unit test）。
- block sequence 記法が同じ配列にパースされる（unit test）。
- `paths` / `requestTypes` 不在で両 field が undefined（unit test）。
- 既存の `parseReviewerDefinition` テストが無変更 green。

## T-04: 起動条件の validation

- [x] `src/core/reviewers/validate.ts` に `paths` / `requestTypes` の検査を追加する（design D8）: present 時は非空配列であり、各要素が非空文字列であること。違反は既存の違反収集フローに乗せて `ReviewerValidationError` に含める。
- [x] 既存検査（name charset / stem 一致 / maxIterations / 必須セクション / step 名衝突 / 重複）の挙動は不変。

**Acceptance Criteria**:
- `paths: []`（空配列）で throw する（unit test、design Risks）。
- `paths` の要素に空文字列を含むと throw する（unit test）。
- 条件無指定の定義は無変更で通過する（unit test、受け入れ #5 の前提）。

## T-05: state / snapshot / AgentStep への起動条件と skip 表現の追加

- [x] `src/kernel/reviewer-snapshot.ts` の `ReviewerSnapshot` に `paths?: string[]` / `requestTypes?: string[]` を追加する（design D8）。
- [x] `src/core/port/step-types.ts` の `AgentStep` に `activation?: ReviewerActivation`（kernel から import）を追加する（design D5）。
- [x] `src/state/schema.ts` の `Verdict` union に `"skipped"` を、`StepOutcome` に `skipReason?: string` を追加する（design D6）。
- [x] `src/state/helpers.ts` の `StepResultInput` に `skipReason?: string` を追加し、`pushStepResult` が outcome に条件 spread で書き込む。
- [x] `src/store/event-journal.ts` の `StepAttemptRecord.outcome` に `skipReason?` を追加し、`stepRunToRecord` と `fold` で `toolResult` と同じ条件 spread パターンで threading する。
- [x] `src/state/schema.ts` の `validateJobState` の reviewers 検査に「present 時 paths/requestTypes は配列」の軽い検査を足す（absence は OK、後方互換）。

**Acceptance Criteria**:
- `verdict: "skipped"` + `skipReason` を持つ StepRun が persist → load（fold）で round-trip 保持される（unit test、受け入れ #4）。
- `paths`/`requestTypes` を持つ snapshot が state に round-trip する（unit test）。
- 既存の schema / helpers / event-journal テストが無変更 green。

## T-06: 変更ファイル観測 seam

- [x] `src/core/port/runtime-strategy.ts` の `RuntimeStrategy` に `listChangedFiles(baseBranch: string, cwd: string, branch: string | null): Promise<string[]>` を追加する（design D4）。throw しない契約をコメントで明記する。
- [x] `src/core/runtime/local.ts` に実装する: `git diff --name-only <baseBranch>...HEAD` を `this.spawnFn` で実行し、repo-relative パス配列を返す。exit≠0 / 例外時 `[]`。
- [x] `src/core/runtime/managed.ts` に実装する: `[]` を返す（custom reviewer managed 非対応の fail-safe、既知制約コメント）。

**Acceptance Criteria**:
- local 実装が `git diff --name-only <base>...HEAD` の出力を行配列で返す（spawnFn stub の unit test）。
- spawn 失敗 / 非 0 exit で `[]`（unit test）。
- managed 実装が `[]`（unit test）。

## T-07: executor の起動ゲートと skip finalize

- [x] `src/core/step/executor.ts` の `runAgentStep` 冒頭（`store.update({step})` + `appendHistory(started)` 直後、`prepareStepArtifacts` / `runner.run` の前）に起動ゲートを挿入する（design D5）。`step.activation` がある場合のみ評価する。
- [x] `activation.paths` がある場合のみ `deps.runtimeStrategy?.listChangedFiles(baseBranch, cwd, state.branch ?? null)` で観測する（baseBranch = `deps.request.baseBranch ?? "main"`）。`evaluateActivation` で判定する。
- [x] 不一致時は新規 private `finalizeSkippedStep` を呼ぶ: agent 不起動・commit/push 不実行・template 不配置。`pushStepResult` で `verdict: "skipped"` + `skipReason`、`appendHistory({ step: "<name>-skipped", status: "warning", message })`、`verdict:parsed` emit、`persist` して return する。
- [x] `activation` を持たない step（組み込み全 step・条件無指定 reviewer）はゲートを通らず現行経路と完全一致であることを保証する。

**Acceptance Criteria**:
- 不一致 reviewer で agent runner が呼ばれず skip StepRun が記録される（runner / listChangedFiles を stub した unit test、受け入れ #1）。
- 一致 reviewer で従来どおり agent が起動する（unit test）。
- `activation` 未設定 step ではゲート評価も `listChangedFiles` 呼び出しも行われない（unit test、受け入れ #3）。

## T-08: skip の transition 配線

- [x] `src/core/pipeline/reviewer-chain.ts` の `buildReviewerChainTransitions(chain)` に、各 reviewer の `{ step: reviewer, on: "skipped", to: nextAfterReviewer(reviewer, chain) }` 行を追加する（design D7）。
- [x] `pipeline.ts` の loop bookkeeping（exit historyStatus / 自己 exhaustion / 次 loop exhaustion / episode reset）が `skipped` で false exhaustion を誘発しないことを確認する（変更が不要なら不要と明記）。

**Acceptance Criteria**:
- chain=`[code-review, A, B]` で `(A, skipped)` → B、`(B, skipped)` → conformance の行が生成される（unit test、受け入れ #5）。
- `skipped` 行が code-fixer を to に持たない（unit test）。
- 既存 transition / pipeline テストが無変更 green。

## T-09: step factory への activation 付与

- [x] `src/core/step/custom-reviewer.ts` の `createCustomReviewerStep(snapshot)` で、snapshot に `paths` または `requestTypes` があるときだけ `activation: { paths, requestTypes }` を step に付与する（design D8）。両方不在なら付与しない。

**Acceptance Criteria**:
- snapshot に paths/requestTypes があると生成 step の `activation` が設定される（unit test）。
- 両方不在の snapshot では `activation` が undefined（unit test、受け入れ #3）。
- `pipeline-run.ts` の snapshot 変換で条件がキャリーされる（型確認 / 既存 prepare テスト green）。

## T-10: reviewers new scaffold コマンド

- [x] `src/core/command/reviewers-new.ts` に `executeReviewersNew(name, cwd): Promise<number>` を `rules-new.ts` と同型で実装する（design D9）。`<name>` を charset（`/^[a-z0-9][a-z0-9\-_]*$/`）で検証（違反 exit 2）、出力先 `specrunner/reviewers/<name>.md`（`reviewersDirRel()` 使用）、既存衝突 exit 1。
- [x] embedded template（source const）: frontmatter `name: <name>` / `maxIterations: 3` + 必須セクション `## 目的` / `## 観点` / `## 判定基準`（validation 非空チェックを通すプレースホルダ文）+ 起動条件のコメントアウト例（`# paths:` / `# requestTypes:`）。
- [x] `src/cli/command-registry.ts` に `reviewers` 親コマンド + `new`（positional `<name>`）と `REVIEWERS_USAGE` を登録し、`USAGE` 一覧に追記する。

**Acceptance Criteria**:
- `reviewers new security` が `specrunner/reviewers/security.md` を生成する（unit test）。
- 生成物が `parseReviewerDefinition` → `validateReviewerDefinitions` を throw せず通る（unit test、受け入れ #5）。
- 不正 name で exit 2、既存衝突で exit 1（unit test）。

## T-11: E2E mock pipeline テスト

- [x] mock pipeline（`tests/helpers/pipeline-mock-client.ts` ベース / `tests/custom-reviewers-e2e.test.ts` 流儀）で以下を固定する:
  - paths 不一致 reviewer が skip され、`verdict: "skipped"` + 理由が state / journal に記録される（受け入れ #1, #4）。
  - requestTypes 一致で起動、不一致で skip（受け入れ #2）。
  - 条件無指定 reviewer が常時起動する（受け入れ #3）。
  - skip ≠ approved が state に残り、後続 reviewer / conformance へ進む。
- [x] reviewers/ 空・不存在・条件無指定で既存テストが無変更 green であることを確認する（受け入れ #3 の完全一致）。

**Acceptance Criteria**:
- 上記すべてのシナリオが green。
- 既存 pipeline / custom-reviewers E2E テストが無変更 green。

## T-12: 仕上げ（typecheck / test / managed 制約明記）

- [x] `bun run typecheck && bun run test` が green（受け入れ #6）。
- [x] `listChangedFiles` の managed 実装が `[]` を返す fail-safe であること、custom reviewer の managed 非対応が既知制約であることをコメントで残す。
- [ ] 必要に応じ `specrunner/project.md` / README に起動条件の宣言形式を追記する（実装者判断、change folder 外編集を伴う場合のみ実装段階で実施）。

**Acceptance Criteria**:
- `typecheck && test` が green（受け入れ最終）。
- managed の既知制約が文書化されている。
