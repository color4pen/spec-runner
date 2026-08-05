# Design: issue 起点 run の開始前忠実性ゲート

## Context

issue を起点に request.md を作成する際、issue 本文の要件が request で黙って弱められると、以後の
request-review → design → spec-review → test-case-gen → implementer → code-review → conformance まで
全 gate が「弱められた request」を正典として検証し高スコアで approve に至る。issue と request の要件差分を
検査する歯がどこにも無い（実例: Issue #860 → PR #872）。

対応方針は issue #875 再定義（開始前完結 / 非伝播 / 差分ゼロは求めない）で確定済み。本 request はそのうち
**「転記漏れ（undeclared drop）を pipeline 開始前に確定させる」部分のみ**を受け持つ。request → 派生成果物
（spec / tasks / test-cases / 実装）の忠実性検査・hash / revision 束縛は #875 の切り分けどおり別課題（out of scope）。

### 現状コードの前提（検証済み）

request-review の Fact-Check Attestation（valid）で検証済みの断定に加え、本設計が依拠する追加の断定を実コードで確認した:

- **run/resume の合流点**: `PipelineRunCommand`（`src/core/command/pipeline-run.ts`）と `ResumeCommand`
  （`src/core/command/resume.ts`）はいずれも `CommandRunner`（`src/core/command/runner.ts`）を継承し、
  `CommandRunner.execute()` を通る。`execute()` は prepare → `setupWorkspace()` → `reloadJobState()` →
  `buildDeps()` → `registerCleanup()` → `buildPipelineForJob()` + `pipeline.run(startStep, ...)`（`runner.ts:251-252`）
  → `handleResult()` → `teardown()` の順で進む。**pipeline の最初の step が走るのは `pipeline.run` 呼び出し時**。
- **deps の中身**: `buildDeps()` が返す `PipelineDeps`（`src/core/types.ts:28-103`）は
  `githubClient` / `owner` / `repo` / `config` / `slug` / `cwd`（= worktree path）/ `runner` / `runtimeStrategy`
  / `storeFactory` を持つ。`LocalRuntime.buildDeps`（`src/core/runtime/local.ts:562-588`）/
  `ManagedRuntime.buildDeps`（`src/core/runtime/managed.ts:316`）が構築する。
- **request.md の所在**: run 経路は setupWorkspace が draft を worktree の change folder へコピーする
  （`src/core/runtime/workspace-materializer.ts:179-185`、`local.ts:378-410`）。resume 経路は
  `recopyDraftToChangeFolder`（`workspace-materializer.ts:92-93,118-119`）が draft から change folder へ
  **再コピー**する。したがって run/resume いずれも `<cwd>/specrunner/changes/<slug>/request.md`
  （= `requestMdPath(slug)`、`src/util/paths.ts:91`）が「その時点の request.md」であり、request-review step が
  読むファイル（`src/prompts/request-review-system.ts:142,166`）と同一。
- **初期状態 status**: `buildInitialJobState`（`src/store/job-state-store.ts:47-85`）は `status: "running"` を返す。
  resume も `ResumeCommand.prepare()` が "running" へ遷移させる（`resume.ts:226`）。lifecycle は
  `running → awaiting-resume` を許可（`src/state/lifecycle.ts:37`）。
- **escalation/halt の形**: pipeline は escalation 時に `transitionJob(state, "awaiting-resume", { patch: { resumePoint: { step, reason, iterationsExhausted } } })` で awaiting-resume を作り、`resumePoint` を resume の再開位置に使う
  （`src/core/pipeline/pipeline.ts:404-419`）。terminal 遷移後に `commitFinalState`（checkpoint publish）と
  `notifyJobTerminal` を発火（`pipeline.ts:602-609`）。`notifyJobTerminal(state, ctx)` は `state.issueNumber` があれば
  awaiting-resume で escalation comment を書く（`src/core/notify/issue-notifier.ts:230-251`）。
- **resume の再開位置解決**: `resolveResumeStep(from, resumePoint, stateStep, ...)`（`src/core/resume/resolve-step.ts:76-115`）は
  `resumePoint.step` を返す。`resumePoint.step` は `StepName`（閉じた union、`src/state/schema/types.ts:107-113`）。
  resume 時 `jobState.issueNumber` は永続 state から読まれる。
- **inbox 経路**: `run-inbox.ts` の既定 `startJob` は `writeDraft(repoRoot, slug, issueBody)` で issue 本文を
  そのまま request.md にし、`runRunCore(draftPath, { cwd, issue: issueNumber })` を呼ぶ（`src/core/inbox/run-inbox.ts:397-400`）。
  → inbox job も `issue` を渡すため、素の判定では gate に掛かってしまう。
- **一回きり LLM 呼び出しの前例**: `queryOneShot`（`src/adapter/claude-code/query-one-shot.ts:99`）は pipeline step
  lifecycle と独立した one-shot query 基盤（systemPrompt / prompt / config を取り raw text を返す。parse は呼び出し側責務）。
- **GitHub port**: 単一 issue 取得メソッドは無い（`src/kernel/github-client.ts`、`src/core/port/github-client.ts` が
  re-export）。adapter の共有 `request()` が Authorization / Accept / X-GitHub-Api-Version header と
  401→`githubTokenExpiredError` を処理する（`src/adapter/github/github-client.ts:52-119`）。`listIssueComments`
  （`github-client.ts:669`）が単一 issue 系 GET の同型実装。

## Goals / Non-Goals

**Goals**:

- `--issue <n>` を伴う run / resume で、pipeline の最初の step（request-review）が走る**前**に、issue 本文と
  request.md を照合する entrance gate を job 実行経路内で実行する。
- 判定規則: issue に明記された要件のうち request の「要件」にも「スコープ外」宣言にも現れないもの
  （undeclared drop）を列挙。1 件以上で halt（escalation）。スコープ外宣言済みは drop としない。差分ゼロ・文言一致は要求しない。
- halt 時、pipeline step を一つも実行せず awaiting-resume にし、operator が request.md を修正して resume すると
  gate を**再評価**する。
- 非伝播: 照合に使った issue 本文を job state / change folder / いかなる pipeline step の入力にも保存・注入しない。
  記録するのは gate の結果（pass の事実、halt 時の undeclared drop 列挙）のみ。
- GitHub client port に単一 issue 取得（`GET /repos/{owner}/{repo}/issues/{number}`、title / body を返す）を追加。
- 縮退規律は fail-closed: issue fetch 失敗（network / 権限 / 404）で pass 扱いにしない（halt）。
- inbox 経路（issue 本文 == request.md）は明示 skip し、skip の事実と理由を log に残す。`--issue` なしの run には
  gate も fetch も一切発生しない。

**Non-Goals**:

- `request validate` への network / LLM 導入（入口決定性 canon `2026-07-31-deterministic-request-entrance` を維持）。
- request → 派生成果物の忠実性検査・hash / revision 束縛（#875 の別課題）。
- 凍結 TC の上書き宣言（supersedes）機構。
- issue 本文の品質・構造の検査（issue 側の書き方は対象外）。
- 照合 LLM の精度チューニング・多段照合（本 request は「歯を置く」ことが主眼。照合は port の背後）。

## Decisions

### D1: gate は `CommandRunner.execute()` 内・`pipeline.run` 直前に置く（run/resume 共通の唯一の seam）

entrance gate は `CommandRunner.execute()` の `registerCleanup`（`runner.ts:224`）と `pipeline.run`
（`runner.ts:251-252`）の間に置く。ここは:

- **run と resume の唯一の合流点**（両者とも `execute()` を通る）。
- **setupWorkspace 済み**なので worktree に request.md が存在し、resume では draft から再コピー済み（現在の request.md を読める）。
- **最初の step より前**（`pipeline.run` 未呼び出し）なので halt すれば pipeline step は一つも走らない。
- **deps 構築済み**なので `githubClient` / `owner` / `repo` / `config` / `slug` / `cwd` が揃う。

- **Rationale**: #875 再定義の「開始前完結」と #939 の「LLM 到達境界は job 実行経路」を同時に満たす唯一の位置。
- **Alternatives considered**:
  - *gate を pipeline の最初の step にする*: 却下。step 化すると step-context-builder が組む prompt に issue 本文を
    載せる必要があり「issue 本文が step prompt 構築に現れない」（受け入れ基準）に反する。また step executor の
    commit/artifact 機構（`src/core/step/executor.ts`）を引き込み、findings/artifact 経由の伝播面が増える。
  - *`request validate --against-issue` に置く*: 却下。validate は完全 offline 決定的コマンド。network/LLM 導入は
    入口決定性 canon（#939）に反する。
  - *request-review step が issue 本文を入力に取る*: 却下。#875 再定義が明示却下（role-scoped context 違反・正典多重化）。

### D2: 発火条件は `startStep === REQUEST_REVIEW && issueNumber 設定済み && !inboxOrigin`

gate は entrance でのみ動く。3 条件すべてを満たすときだけ照合する:

1. `prepared.startStep === STEP_NAMES.REQUEST_REVIEW`（entrance。標準 pipeline は request-review から開始。
   pipeline 途中からの resume（例: code-review）では startStep ≠ request-review なので gate は skip）。
2. `jobState.issueNumber != null`（`--issue` 連携時のみ。未連携 run では fetch も照合も一切発生しない）。
3. `jobState.inboxOrigin !== true`（inbox 経路の明示 skip。D7）。

- **Rationale**: entrance を「request-review へ入る直前」と定義すると、gate は初回 run と「entrance からの resume」で
  のみ動く。gate halt は resume anchor を request-review にするため（D5）、resume で startStep が request-review に
  戻り gate が**再評価**される（受け入れ基準の resume 再評価を満たす）。pipeline 途中 halt からの resume は
  startStep が別 step になり gate を通らない（無駄な fetch/LLM を避ける）。
- **既知の相互作用**: request-review step 自体が escalation した場合も resumePoint.step は request-review になるため、
  その resume では gate が再度動く（entrance の再入なので忠実性再確認として整合的。追加コストは fetch+LLM 一回）。
  request-review anchor での連続 escalation は `checkConsecutiveEscalations`（`resume.ts:187`）の 3 回 → `--force`
  要求と同じ counter を共有する（entrance で詰まっている状態として妥当）。

### D3: 照合は port `IssueFidelityComparator` に隠蔽し、test double で駆動する

照合ロジックを port `IssueFidelityComparator`（core、`src/core/port/issue-fidelity-comparator.ts`）へ隠蔽する:

```
export interface IssueFidelityComparison {
  // issue 要件のうち request の「要件」にも「スコープ外」宣言にも現れないもの。空 = undeclared drop なし。
  undeclaredDrops: string[];
}
export interface IssueFidelityComparator {
  compare(input: { issueTitle: string; issueBody: string; requestMd: string }): Promise<IssueFidelityComparison>;
}
```

- gate orchestrator（core）はこの port にのみ依存する。gate 挙動テスト（applicability / halt / 非伝播 / fail-closed）は
  **fake comparator** で駆動する（受け入れ基準「照合はテストダブルで駆動」）。
- 実 adapter（`src/adapter/claude-code/issue-fidelity-comparator.ts`）は `queryOneShot` を用い、照合 prompt（D4）を
  組んで LLM に投げ、返り text から `undeclaredDrops` を構造 parse する。
- **非伝播のスコープ明確化**: 実 comparator が組む prompt には issue 本文が入る（照合そのものだから）。しかしこの prompt は
  adapter 内の ephemeral 値で、state / change folder / **pipeline step の prompt 構築**（`step-context-builder.ts` /
  `src/prompts/*` の 13 step 群）には現れない。受け入れ基準 #4 が言う「step prompt 構築」は 13 step を指し、comparator
  自身の照合 prompt は対象外。テストでは comparator が fake のため実 prompt は組まれず、issue 本文は state/folder に一切残らない。

- **Rationale**: port 化で「歯（gate 制御）」と「照合の中身（LLM）」を分離。歯は決定的にテストでき、LLM の精度は本 request の
  検証対象から外れる（prompt contract のみ固定）。
- **Alternatives considered**:
  - *`AgentRunner`（`deps.runner`）を再利用*: 却下。`AgentRunner.run` は `AgentStep` 前提で result file 書き出し・
    branch 検証・commit を伴い（`agent-runner.ts` / `executor.ts`）、ephemeral 照合には過剰かつ artifact 伝播面を増やす。
  - *request.md への「issue 要件対応表」記載強制のみ（照合なし）*: 却下。対応表の網羅性を照合する者が居なければ黙って表から
    落とすだけで素通りする（歯にならない）。

### D4: 照合 prompt は `src/prompts/issue-fidelity-system.ts` に置き、contract をテストで固定する

実 comparator が使う prompt（system + user builder）は pure 関数として `src/prompts/issue-fidelity-system.ts` に置く
（`src/prompts/` の既存様式）。prompt contract として以下の文言を含める:

- issue に明記された要件を**列挙**する指示。
- request の「要件」節と「スコープ外」宣言の**両方**を参照し、いずれにも現れない要件だけを undeclared drop として報告する
  指示（スコープ外宣言を尊重＝drop としない）。
- **差分ゼロ・文言一致は要求しない**旨（意味的に充足/宣言されていれば drop でない）。
- 出力形式（`undeclaredDrops` を要素とする構造化 JSON、各要素は簡潔な要件記述。issue 本文の丸写しをしない）。

prompt-contract テスト（`src/prompts/` テスト様式、例: `tests/unit/prompts/design-system.test.ts`）で上記文言の存在を固定する。

### D5: halt は awaiting-resume（resume anchor = request-review）。pipeline step は一つも走らない

gate が undeclared drop（≥1）または fetch 失敗を返したら、`CommandRunner.execute()` は `pipeline.run` を**呼ばず**に:

1. `transitionJob(jobState, "awaiting-resume", { trigger: "issue-fidelity-gate", reason, patch: { resumePoint: { step: STEP_NAMES.REQUEST_REVIEW, reason, iterationsExhausted: 0 }, error, pid: null } })` で awaiting-resume state を作る。
   - `error.code`: undeclared drop は `ISSUE_FIDELITY_UNDECLARED_DROP`、fetch 失敗は `ISSUE_FETCH_FAILED`。
   - `error.message` / `reason`: undeclared drop の列挙（fetch 失敗時は失敗理由）。issue 本文は含めない。
2. `deps.storeFactory(jobId).persist(haltState)` で永続化。
3. `deps.runtimeStrategy?.commitFinalState(deps, haltState)`（best-effort checkpoint publish、pipeline の awaiting-resume seam と同型）。
4. `notifyJobTerminal(haltState, { githubClient: deps.githubClient, owner: deps.owner, repo: deps.repo })`（linked issue に escalation comment）。
5. `finalState = haltState` として既存の `handleResult` + `teardown` 経路に合流（`handleResult` が
   "Pipeline halted at step 'request-review'" を出力し exit 1）。

- **Rationale**: resumePoint.step を request-review にすることで resume が entrance に戻り gate が再評価される（D2）。
  既存の halt 提示・teardown 経路を再利用し、gate 専用の終端処理を増やさない。
- `StepName` は閉じた union のため gate 専用の resumePoint step 値は追加しない（追加すると `resolveResumeStep` が
  pipeline の steps Map に無い step を返し "Step not found" になる）。request-review anchor が pragmatic。

### D6: fail-closed（fetch 失敗 / 照合不能 / wiring 欠落）

gate が applicable（D2 の 3 条件成立）なとき、以下はいずれも **pass 扱いにせず halt** する:

- `githubClient.getIssue` が throw（network / 401 / 403 / 404 / 5xx）→ `ISSUE_FETCH_FAILED` で halt。
- request.md 読み取り失敗 → fail-closed halt（setup 不整合。gate を素通りさせない）。
- comparator 未注入（wiring 欠落）→ fail-closed halt（明示的な設定エラーメッセージ）。
- comparator が throw / 返り値 parse 不能 → fail-closed halt。

明示的 operator override（暗黙 skip は設けない）は本 request では新設しない。fail-closed の縮退のみで、`--issue` を
付けた限り gate は必ず結論（pass / halt）を出す。

- **Rationale**: fetch 失敗の pass 扱いは「issue 連携時だけ歯が抜ける」fail-open であり gate の存在意義を失う。

### D7: inbox は永続 flag `inboxOrigin` で明示 skip し、理由を log に残す

inbox 経路は issue 本文がそのまま request.md であり乖離が構造的に生じない。無条件適用は無意味な fetch と失敗面を
増やすだけ（architect 却下事項）。よって明示 skip する:

- `JobState` に optional `inboxOrigin?: boolean` を追加（`src/state/schema/types.ts`、issueNumber 近傍）。
- `PipelineRunOptions`（`pipeline-run.ts:32-39`）と `runRunCore` options に `inboxOrigin?: boolean` を追加。
  `PipelineRunCommand.prepare()` が `options.inboxOrigin === true` のとき `jobState.inboxOrigin = true` を設定
  （issueNumber 設定と同じ位置、`pipeline-run.ts:155-157` 付近）。
- inbox の既定 `startJob`（`run-inbox.ts:400`）が `runRunCore(draftPath, { cwd, issue, inboxOrigin: true })` を渡す。
- gate は `jobState.inboxOrigin === true` を見たら照合せず skip し、skip の事実と理由（"request.md is the issue body
  verbatim (inbox origin)"）を log に残す。永続 flag なので inbox job の resume でも skip が維持される（無駄な fetch なし）。

- **Rationale**: skip 判定を state の永続 field に置くことで run/resume を通して一貫（ephemeral option だと resume で
  skip が失われ fetch が発生する）。

### D8: 照合対象 request.md は worktree の change folder コピー

gate は `<deps.cwd>/specrunner/changes/<slug>/request.md`（= `requestMdPath(slug)`）を読む。これは request-review step が
読むファイルと同一で、resume では draft から再コピー済み（`recopyDraftToChangeFolder`）。よって「operator が request.md を
修正して resume」した内容が gate に反映される（受け入れ基準の resume 再評価が成立）。no-worktree モードでも
`deps.cwd` 配下に同パスで存在する（`local.ts:378-410`）。

### D9: comparator は composition root（CLI）から factory 注入する

comparator の adapter 選択は composition root（CLI）の責務。run.ts が既に runtime / githubClient / sessionClient を
構築する（`src/cli/run.ts:82-89`）のと同じ層で comparator factory を組み、`CommandRunner` へ注入する:

- `CommandRunner` に optional な `comparatorFactory?: (config: SpecRunnerConfig) => IssueFidelityComparator` を持たせ、
  gate 実行時に `this.comparatorFactory?.(prepared.config)` で生成する（config は run/resume とも prepare 後に確定するため
  factory 形にして config 束縛を gate 時点まで遅延）。
- `PipelineRunCommand` / `ResumeCommand` の constructor が factory を受け取り super へ渡す。`src/cli/run.ts` /
  `src/cli/resume.ts` が `createIssueFidelityComparator`（adapter）を `(config) => createIssueFidelityComparator(config)`
  として渡す。
- optional のため既存の command 構築テストは無改変で compile 可（factory 未注入時は D6 の fail-closed が働く）。

- **Rationale**: runtime strategy（local/managed）を触らず、adapter 選択を composition root に閉じる。managed runtime を
  claude-code adapter に結合させない。managed で LLM 認証が無ければ comparator は throw → fail-closed halt（silent pass に
  ならない）ので、縮退時も安全側。
- **Alternatives considered**: *comparator を `PipelineDeps` に載せ buildDeps で構築*: 却下寄り。managed runtime の
  buildDeps が claude-code の queryOneShot を import する層越え結合を生む。composition root 注入の方が層が綺麗。

### D10: getIssue port と adapter

`GitHubClient`（`src/kernel/github-client.ts`）に追加:

```
// GET /repos/{owner}/{repo}/issues/{number}
// 200 → { number, title, body }（body null → ""）
// 401 → GITHUB_TOKEN_EXPIRED（共有 request() 経由）
// 非 200（404 含む）→ GITHUB_API_ERROR（fail-closed の元。gate が catch して halt）
getIssue(owner: string, repo: string, issueNumber: number): Promise<{ number: number; title: string; body: string }>;
```

adapter 実装（`src/adapter/github/github-client.ts`）は既存の共有 `request()`（Authorization / Accept /
X-GitHub-Api-Version、401 処理）を通し、200 を `{ number, title, body: body ?? "" }` に射影、非 200（404 含む）は
`githubApiError` を throw する。`listIssueComments`（`github-client.ts:669`）と同型。

## Risks / Trade-offs

- [Risk] **LLM 照合の非決定性**（false drop / miss） → Mitigation: 本 request は「歯を置く」ことが主眼で精度は port
  差し替えで改善可能。prompt を fail-closed 側（迷ったら drop として報告）に倒す（D4）。gate 挙動テストは fake で決定的に固定。
- [Risk] **managed runtime で LLM 認証が無いと comparator が動かない** → Mitigation: D9 のとおり comparator throw は
  fail-closed halt（silent pass にならない）。managed native comparator は本 request 外だが同一 port で差し替え可能。
- [Risk] **request-review anchor の counter 共有**（gate halt と request-review escalation が同一 step counter を消費） →
  Mitigation: entrance で詰まっている状態として妥当。3 回連続で `--force` 要求（既存挙動）に合流するのは安全側。
- [Risk] **schema 追加 `inboxOrigin?` の後方互換** → Mitigation: optional。legacy state file（absent）は false 相当で
  扱い roundtrip テストで固定。
- [Risk] **fetch/LLM の追加コスト**（`--issue` run ごとに 1 fetch + 1 LLM） → Mitigation: entrance のみ（D2）。未連携 run /
  inbox / pipeline 途中 resume では一切発生しない。

## Open Questions

- なし（設計判断は architect 評価済み。実装分岐は tasks.md に落とし込み済み）。
