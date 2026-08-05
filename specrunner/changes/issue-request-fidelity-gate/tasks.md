# Tasks: issue 起点 run の開始前忠実性ゲート

依存順: T-01 / T-02 / T-03 / T-04 は独立に着手可 → T-05（inbox）は T-04 依存 → T-06 → T-07（T-02/T-06 依存）→
T-08（T-01/T-02/T-03 依存）→ T-09（T-04/T-07/T-08 依存、配線と結合テスト）→ T-10（検証・回帰）。

受け入れ基準対応表（request.md 由来）:
- AC1「undeclared drop ≥1 → 全 step 未実行 escalation halt（破壊確認込み）」→ T-08 / T-09
- AC2「undeclared drop 0 → gate 通過 request-review 開始」→ T-08 / T-09
- AC3「照合 prompt contract の文言存在」→ T-06
- AC4「issue 本文が folder / state / step prompt に現れない」→ T-08 / T-09
- AC5「`--issue` なしで gate も fetch も不発火」→ T-08 / T-09
- AC6「inbox 経路で gate skip・理由 log」→ T-05 / T-08 / T-09
- AC7「fetch 失敗が pass にならず halt」→ T-08 / T-09
- AC8「getIssue の adapter（endpoint / 認証 header / エラー変換）」→ T-01
- AC9「halt 後 request.md 修正 resume で gate 再評価」→ T-09
- AC10「`typecheck && test` green」→ T-10

---

## T-01: `getIssue` port + adapter 実装

- [ ] `src/kernel/github-client.ts` の `GitHubClient` interface に `getIssue(owner: string, repo: string, issueNumber: number): Promise<{ number: number; title: string; body: string }>` を追加する。doc comment に endpoint（`GET /repos/{owner}/{repo}/issues/{number}`）・200 射影（body null → ""）・401→`GITHUB_TOKEN_EXPIRED`・非 200（404 含む）→`GITHUB_API_ERROR` を記す。
- [ ] `src/adapter/github/github-client.ts` の `GitHubApiClient` に `getIssue` を実装する。既存の共有 `request()` を通す（Authorization / Accept / X-GitHub-Api-Version・401 処理を再利用）。200 は `{ number, title, body: body ?? "" }` に射影、非 200（404 含む）は `githubApiError(status, ...)` を throw。実装様式は `listIssueComments`（`github-client.ts:669`）に倣う。
- [ ] `getIssue` は fetch 失敗（network / 5xx exhausted）や非 200 で必ず throw する（null を返さない — fail-closed の元）。

**Acceptance Criteria**:
- adapter 単体テスト（`fetchFn` を fake 化）:
  - endpoint が `/repos/{owner}/{repo}/issues/{n}` で、Authorization / Accept / X-GitHub-Api-Version header が付与される。
  - 200 応答 `{ number, title, body }` を返し、`body: null` は `""` に射影される。
  - 404 で `GITHUB_API_ERROR` を throw する（null を返さない）。
  - 401 で `GITHUB_TOKEN_EXPIRED` を throw する。
- `typecheck` green。

## T-02: `IssueFidelityComparator` port を core に定義する

- [ ] `src/core/port/issue-fidelity-comparator.ts` を新規作成し、以下をエクスポートする:
  - `interface IssueFidelityComparison { undeclaredDrops: string[] }`（doc: issue 要件のうち request の「要件」にも「スコープ外」宣言にも現れないもの。空 = drop なし）。
  - `interface IssueFidelityComparator { compare(input: { issueTitle: string; issueBody: string; requestMd: string }): Promise<IssueFidelityComparison> }`。
- [ ] core 層に閉じる（adapter を import しない）。

**Acceptance Criteria**:
- port 型が定義され `typecheck` green。
- core が adapter に依存しない（既存の layering テスト / DSM 制約に違反しない）。

## T-03: escalation 用 error code を追加する

- [ ] `src/errors.ts` の `ERROR_CODES`（`errors.ts:78`）に `ISSUE_FIDELITY_UNDECLARED_DROP` と `ISSUE_FETCH_FAILED` を追加する。
- [ ] これらは resumable（awaiting-resume）であること。`src/core/pipeline/pipeline.ts:19-24` の `FATAL_ERROR_CODES` に**追加しない**（追加すると halt が failed 扱いになり resume 不能になる）。

**Acceptance Criteria**:
- 2 code が `ERROR_CODES` に存在し `typecheck` green。
- `FATAL_ERROR_CODES` に含まれないことをテスト（または既存 set の内容確認）で固定する。

## T-04: `JobState.inboxOrigin` schema + option 配線

- [ ] `src/state/schema/types.ts` の `JobState`（issueNumber 近傍、`types.ts:435`）に optional `inboxOrigin?: boolean` を追加する。doc に「inbox 経路（issue 本文 == request.md）で真。entrance fidelity gate を skip する signal。legacy state file（absent）は false 相当」と記す。
- [ ] `src/state/schema/operations.ts` の state 検証 / roundtrip が `inboxOrigin` を保持することを確認する（既存の optional field と同様に pass-through。必要なら validate 分岐を追加）。
- [ ] `src/core/command/pipeline-run.ts` の `PipelineRunOptions`（`pipeline-run.ts:32-39`）に `inboxOrigin?: boolean` を追加する。`prepare()` の issueNumber 設定箇所（`pipeline-run.ts:155-157`）付近で `if (this.options.inboxOrigin === true) jobState.inboxOrigin = true;` を追加する。
- [ ] `src/cli/run.ts` の `runRunCore` / `runRun` の options 型に `inboxOrigin?: boolean` を追加し、`PipelineRunCommand` の options へ透過する（`run.ts:99` の options spread に含める）。

**Acceptance Criteria**:
- `JobState` に `inboxOrigin?` が追加され、state の persist → load roundtrip で保持される（roundtrip テスト）。
- `runRunCore({ inboxOrigin: true })` を通すと `jobState.inboxOrigin === true` が bootstrap 後に設定される（`pipeline-run` テストで固定）。
- legacy state（`inboxOrigin` absent）が false 相当で読める。
- `typecheck` green。

## T-05: inbox の既定 startJob が `inboxOrigin: true` を渡す

- [ ] `src/core/inbox/run-inbox.ts` の既定 `startJob`（`run-inbox.ts:397-400`）で `runRunCore(draftPath, { cwd: repoRoot, issue: issueNumber, inboxOrigin: true })` に変更する。

**Acceptance Criteria**:
- inbox の `startJob` が `runRunCore` を `inboxOrigin: true` 付きで呼ぶことをテストで固定する（`runRunCore` を spy / mock 化して引数を検証。既存の `run-inbox.test.ts` の様式に倣う）。

## T-06: 照合 prompt を `src/prompts/issue-fidelity-system.ts` に定義する

- [ ] `src/prompts/issue-fidelity-system.ts` を新規作成し、pure 関数として system prompt 定数と user message builder を提供する。builder は `{ issueTitle, issueBody, requestMd }` を受け取り、`<issue>` / `<request>` を明示境界タグで囲んで埋め込む（外部入力の injection 境界を明示。`spec-review` 等の既存様式に倣う）。
- [ ] prompt に以下の contract 文言を含める:
  - issue に明記された要件を**列挙**する指示。
  - request の「要件」節と「スコープ外」宣言の**両方**を参照し、いずれにも現れない要件だけを undeclared drop として報告する指示（スコープ外宣言を尊重＝drop としない）。
  - **差分ゼロ・文言一致は要求しない**旨（意味的に充足/宣言されていれば drop でない）。
  - 出力形式: `undeclaredDrops` を要素とする構造化 JSON。各要素は簡潔な要件記述（issue 本文の丸写しをしない）。判定に迷う要件は drop 側に倒す（fail-closed 方針）。
- [ ] issue 本文の丸写しをさせない指示を含める（非伝播方針の補強。ただし本 prompt 自体は adapter 内 ephemeral で state/folder に残らない）。

**Acceptance Criteria**（AC3）:
- prompt-contract テスト（`src/prompts/` テスト様式、例 `tests/unit/prompts/design-system.test.ts`）で以下の文言存在を固定する:
  - issue 要件の列挙を指示する文言。
  - スコープ外宣言を drop とみなさない旨の文言。
  - 差分ゼロ・文言一致を要求しない旨の文言。
  - 出力が `undeclaredDrops` を含む構造化形式である旨の文言。
- `typecheck` green。

## T-07: 実 comparator adapter（queryOneShot 経由）+ factory

- [ ] `src/adapter/claude-code/issue-fidelity-comparator.ts` を新規作成し、`IssueFidelityComparator` を実装する `class` / `function` を提供する。`compare()` は T-06 の prompt を組み、`queryOneShot({ systemPrompt, prompt, stepName: "issue-fidelity-gate", cwd, ... }, config, ...)`（`src/adapter/claude-code/query-one-shot.ts:99`）を呼び、返り `text` から `undeclaredDrops: string[]` を構造 parse する。
- [ ] parse: LLM 出力から JSON ブロックを抽出し `undeclaredDrops` 配列（要素は string に coerce）を得る。parse 不能 / 構造不正のときは throw する（fail-closed。gate 側が halt に落とす）。
- [ ] factory `createIssueFidelityComparator(config: SpecRunnerConfig): IssueFidelityComparator` をエクスポートする（config を capture して port impl を返す）。SDK ロードは `compare()` 呼び出し時まで遅延（`queryOneShot` の lazy load を利用。非 issue run では一切ロードしない）。

**Acceptance Criteria**:
- `compare()` の単体テスト（`queryOneShot` に相当する query 関数を注入 / mock 化）:
  - 正常 JSON 出力 → `undeclaredDrops` を正しく parse する（空配列 / 複数要素）。
  - parse 不能な出力 → throw する（fail-closed）。
- prompt に issueTitle / issueBody / requestMd が渡されることを確認する（builder 経由）。
- `typecheck` green。

## T-08: entrance gate orchestrator（core、純関数）+ 単体テスト

- [ ] `src/core/command/entrance-fidelity-gate.ts`（または `src/core/gate/issue-fidelity-gate.ts`）を新規作成し、注入コラボレータのみに依存する評価関数を提供する:
  ```
  type GateDecision =
    | { kind: "proceed"; skipped?: { reason: string } }   // pass / not-applicable / inbox-skip
    | { kind: "halt"; code: string; reason: string };      // undeclared-drop / fetch-failure / wiring-error
  async function evaluateIssueFidelityGate(params: {
    startStep: string;
    issueNumber: number | null | undefined;
    inboxOrigin: boolean | undefined;
    owner: string; repo: string;
    getIssue: (owner: string, repo: string, n: number) => Promise<{ title: string; body: string }>;
    readRequestMd: () => Promise<string>;
    comparator: IssueFidelityComparator | undefined;
    log: (msg: string) => void;
  }): Promise<GateDecision>
  ```
- [ ] 判定ロジック:
  1. `startStep !== STEP_NAMES.REQUEST_REVIEW` → `{ kind: "proceed" }`（entrance 以外）。
  2. `issueNumber == null` → `{ kind: "proceed" }`（未連携。fetch も照合もしない）。
  3. `inboxOrigin === true` → skip 理由を log に残し `{ kind: "proceed", skipped: { reason } }`（fetch しない）。
  4. `comparator` 未注入 → `{ kind: "halt", code: ISSUE_FETCH_FAILED 相当 / 明示 wiring error }`（fail-closed）。
  5. request.md 読み取り失敗 → fail-closed halt。
  6. `getIssue` throw → `{ kind: "halt", code: ISSUE_FETCH_FAILED, reason }`（fail-closed。issue 本文なし）。
  7. `comparator.compare(...)` throw / parse 不能 → fail-closed halt。
  8. `undeclaredDrops.length > 0` → `{ kind: "halt", code: ISSUE_FIDELITY_UNDECLARED_DROP, reason: 列挙 }`（issue 本文なし、drop 列挙のみ）。
  9. それ以外 → pass を log し `{ kind: "proceed" }`。
- [ ] issue 本文は関数内 local 変数と `comparator.compare` への引数にのみ存在し、返り `GateDecision` にも log にも含めない（drop の要件記述のみ）。

**Acceptance Criteria**（AC1/AC2/AC4/AC5/AC6/AC7 のロジック層）:
- 単体テスト（すべて fake 注入、実 LLM / 実 network なし）:
  - `startStep !== request-review` → proceed（getIssue / comparator 未呼び出し）。
  - `issueNumber == null` → proceed（getIssue 未呼び出し = AC5）。
  - `inboxOrigin === true` → proceed + skip 理由が log に出る（getIssue 未呼び出し = AC6）。
  - comparator が drop ≥1 を返す → `{ kind: "halt", code: ISSUE_FIDELITY_UNDECLARED_DROP }`、reason に drop 列挙を含み issue 本文（sentinel）を含まない（AC1 / AC4）。
  - comparator が空 drop を返す → proceed（AC2）。
  - `getIssue` throw → `{ kind: "halt", code: ISSUE_FETCH_FAILED }`（AC7）。
  - comparator 未注入 → halt（fail-closed）。
  - comparator throw → halt（fail-closed）。
- `typecheck` green。

## T-09: `CommandRunner` 配線 + halt state 構築 + 結合テスト

- [ ] `src/core/command/runner.ts` の `CommandRunner` に optional `comparatorFactory?: (config: SpecRunnerConfig) => IssueFidelityComparator` を constructor で受け取り protected field に保持する。
- [ ] `src/core/command/pipeline-run.ts`（`PipelineRunCommand`）と `src/core/command/resume.ts`（`ResumeCommand`）の constructor に `comparatorFactory` を追加し super へ渡す。
- [ ] `src/cli/run.ts` / `src/cli/resume.ts` の command 構築時に `createIssueFidelityComparator`（T-07）を `(config) => createIssueFidelityComparator(config)` として注入する。
- [ ] `CommandRunner.execute()` の `registerCleanup`（`runner.ts:224`）と `pipeline.run`（`runner.ts:251-252`）の間に gate 呼び出しを挿入する:
  - `evaluateIssueFidelityGate` を呼ぶ。引数は `startStep = prepared.startStep`、`issueNumber = jobState.issueNumber`、`inboxOrigin = jobState.inboxOrigin`、`owner/repo = deps.owner/deps.repo`、`getIssue = deps.githubClient.getIssue`、`readRequestMd = () => fs.readFile(path.join(deps.cwd, requestMdPath(slug)), "utf-8")`、`comparator = this.comparatorFactory?.(config)`、`log = logInfo`。
  - `decision.kind === "proceed"` → 従来どおり `buildPipelineForJob` + `pipeline.run(startStep, ...)`。
  - `decision.kind === "halt"` → `pipeline.run` を**呼ばず**に awaiting-resume state を構築する:
    - `transitionJob(jobState, "awaiting-resume", { trigger: "issue-fidelity-gate", reason: decision.reason, patch: { resumePoint: { step: STEP_NAMES.REQUEST_REVIEW, reason: decision.reason, iterationsExhausted: 0 }, error: { code: decision.code, message: decision.reason, hint: "request.md を修正（要件復元 or スコープ外宣言追記）して resume してください。" }, pid: null } })`。
    - `deps.storeFactory(jobState.jobId).persist(haltState)`。
    - `await deps.runtimeStrategy?.commitFinalState(deps, haltState)`（best-effort。throw させない）。
    - `await notifyJobTerminal(haltState, { githubClient: deps.githubClient, owner: deps.owner, repo: deps.repo })`。
    - `finalState = haltState` として既存の `handleResult(finalState, slug, json)` + `teardown(handle, finalState.status)` 経路へ合流する（gate 専用の終端処理を新設しない）。
- [ ] halt 経路で `buildPipelineForJob` / `pipeline.run` / step executor が一切呼ばれないことを保証する（分岐で短絡）。

**Acceptance Criteria**（AC1 破壊確認込み / AC2 / AC4 / AC5 / AC6 / AC7 / AC9）:
- 結合テスト（fake runtime / fake comparator / fake githubClient を注入。既存 `tests/unit/core/command/runner.test.ts` / `pipeline-run-gate.test.ts` の様式に倣う）:
  - **AC1**: comparator が drop ≥1 → `pipeline.run`（または step executor）が一度も呼ばれず、finalState が awaiting-resume・error.code=`ISSUE_FIDELITY_UNDECLARED_DROP`・exit 1。**破壊確認**: halt 分岐を無効化（常に proceed）すると本テストが「step が実行された」で fail することを確認する（分岐の歯が効いていることの証明）。
  - **AC2**: comparator が空 drop → `pipeline.run(request-review)` が通常呼ばれる。
  - **AC4**: sentinel を含む issue body で pass / halt いずれの経路でも、永続 state・change folder・step prompt 構築のいずれにも sentinel が現れない。
  - **AC5**: `issueNumber` 未設定 → `getIssue` 未呼び出しかつ `pipeline.run` 通常呼び出し。
  - **AC6**: `inboxOrigin === true` → `getIssue` 未呼び出し・skip 理由が log・`pipeline.run` 通常呼び出し。
  - **AC7**: `getIssue` throw → awaiting-resume・error.code=`ISSUE_FETCH_FAILED`・`pipeline.run` 未呼び出し。
  - **AC9**: gate halt（awaiting-resume, resumePoint.step=request-review）後、`ResumeCommand` 経由で resume すると startStep が request-review に解決され、gate が**再度**評価される（comparator が再呼び出しされる）。2 回目が空 drop を返すと `pipeline.run(request-review)` が呼ばれる。
- `notifyJobTerminal` が halt 時に linked issue へ escalation comment を書く（issueNumber 設定時）ことを確認する。
- `typecheck` green。

## T-10: 検証・回帰

- [ ] `bun run typecheck` green。
- [ ] `bun run test` green（新規テスト + 既存テストの回帰なし）。
- [ ] 既存 run / resume 経路（`--issue` なし・inbox）の回帰がないことを確認する（gate は entrance の issue 連携時のみ発火）。

**Acceptance Criteria**（AC10）:
- `typecheck && test` が green。
- 非 issue run / inbox run に挙動変化がない（gate 不発火 / skip）。
