# issue 起点 run の開始前忠実性ゲート — undeclared drop を pipeline 開始前に封止する

## Status

Accepted (2026-08-06)

## Context

issue を起点に request.md を作成する際、issue 本文の要件が request で黙って弱められると、
以後の request-review → design → spec-review → test-case-gen → implementer → code-review →
conformance まで全 gate が「弱められた request」を正典として検証し、高スコアで approve に至る。
issue と request の要件差分を検査する歯がどこにも無い（実例: Issue #860 → PR #872。
「fixture project へ install」「subdirectory から実行」等の明記要件が request 化で落とされ、
pipeline は 9.05 点で approve、人間の独立照合で初めて発覚した）。

対応方針は issue #875 の再定義（2026-07-20）で確定済み：

1. **開始前完結** — issue との突き合わせは pipeline 開始前に完結する。request が正典として確定してから pipeline が開始される。
2. **非伝播** — issue 本文を pipeline の agent へ文脈として持ち込まない（role-scoped context の原則。正典の多重化を招くため）。
3. **差分ゼロは求めない** — 本質は「落とした要件の明示」＝スコープ外宣言の強制。無言の弱体化だけを塞ぐ。

本 ADR は #875 のうち「転記漏れを pipeline 開始前に確定させる」部分のみを対象とする。
request → 派生成果物（spec / tasks / test-cases / 実装）の忠実性検査・hash / revision 束縛は別課題（#875 の切り分けどおり out of scope）。

### 前提状態（実装前）

- `run --issue <n>` は issue を fetch しない。issue 番号は state に保存され（`pipeline-run.ts:155-157`）、
  終端通知にのみ使われる（`issue-notifier.ts:230-251`）。
- issue 本文はどの agent prompt にも注入されていない（`src/prompts/` / `src/core/step/` に issue 本文の参照なし）。
- GitHub client port に単一 issue 取得メソッドが無い（`src/kernel/github-client.ts`）。
- `request validate` は完全 offline の決定的コマンド。入口決定性 canon は #939 /
  `specrunner/adr/2026-07-31-deterministic-request-entrance.md` として確立済み。
- inbox 経路は issue 本文がそのまま request.md になるため（`run-inbox.ts:397-400`）、
  転記による乖離が構造的に生じない。
- `CommandRunner.execute()` は prepare → setupWorkspace → reloadJobState → buildDeps →
  registerCleanup → buildPipelineForJob + pipeline.run(startStep, ...) → handleResult → teardown
  の順で進む。`PipelineRunCommand` と `ResumeCommand` はいずれも `CommandRunner` を継承し、
  `execute()` を通る。

## Decision

### D1: gate は `CommandRunner.execute()` 内・`pipeline.run` 直前に置く（run/resume 共通の唯一の seam）

entrance gate は `registerCleanup`（`runner.ts:224`）と `pipeline.run`（`runner.ts:251-252`）の間に置く。
この位置は：

- run と resume の唯一の合流点（両者とも `execute()` を通る）。
- setupWorkspace 済みなので worktree に request.md が存在し、resume では draft から再コピー済み（現在の request.md を読める）。
- 最初の step より前（`pipeline.run` 未呼び出し）なので halt すれば pipeline step は一つも走らない。
- deps 構築済みなので `githubClient` / `owner` / `repo` / `config` / `slug` / `cwd` が揃う。

#875 再定義の「開始前完結」と #939 の「LLM 到達境界は job 実行経路」を同時に満たす唯一の位置。

### D2: 発火条件は「startStep === REQUEST_REVIEW && issueNumber 設定済み && !inboxOrigin」

gate は次の 3 条件すべてを満たすときだけ照合する：

1. `prepared.startStep === STEP_NAMES.REQUEST_REVIEW`（entrance。標準 pipeline は request-review から開始。
   pipeline 途中からの resume では startStep ≠ request-review なので gate は skip）。
2. `jobState.issueNumber != null`（`--issue` 連携時のみ。未連携 run では fetch も照合も一切発生しない）。
3. `jobState.inboxOrigin !== true`（inbox 経路の明示 skip。D7）。

gate halt は resumePoint を request-review に設定するため（D5）、resume で startStep が request-review に
戻り gate が**再評価**される（受け入れ基準の resume 再評価を満たす）。pipeline 途中 halt からの resume は
startStep が別 step になり gate を通らない（無駄な fetch/LLM を避ける）。

**カウンタ非消費（意図した挙動）**: gate halt は StepRun を記録しないため
`checkConsecutiveEscalations` のカウンタを消費しない。operator は `--force` なしで何度でも
request.md 修正 → resume を繰り返せる。`--force` は gate を迂回しない（fail-closed）ため、
gate halt の反復は request.md 修正の正常な収束過程である。

### D3: 照合は port `IssueFidelityComparator` に隠蔽し、test double で駆動する

照合ロジックを port `IssueFidelityComparator`（`src/core/port/issue-fidelity-comparator.ts`）へ隠蔽する：

```typescript
export interface IssueFidelityComparison {
  undeclaredDrops: string[]; // issue 要件のうち request の「要件」にも「スコープ外」にも現れないもの。空 = drop なし。
}
export interface IssueFidelityComparator {
  compare(input: { issueTitle: string; issueBody: string; requestMd: string }): Promise<IssueFidelityComparison>;
}
```

gate orchestrator（core）はこの port にのみ依存する。gate 挙動テスト（applicability / halt / 非伝播 / fail-closed）は
**fake comparator** で駆動する。

実 adapter（`src/adapter/claude-code/issue-fidelity-comparator.ts`）は `queryOneShot` を用い、
照合 prompt（D4）を組んで LLM に投げ、返り text から `undeclaredDrops` を構造 parse する。

**非伝播のスコープ明確化**: 実 comparator が組む prompt には issue 本文が入る（照合そのものだから）。
しかしこの prompt は adapter 内の ephemeral 値で、state / change folder / pipeline step の
prompt 構築（`step-context-builder.ts` / `src/prompts/*` の各 step 群）には現れない。

### D4: 照合 prompt は `src/prompts/issue-fidelity-system.ts` に置き、contract をテストで固定する

実 comparator が使う prompt（system + user builder）は pure 関数として
`src/prompts/issue-fidelity-system.ts` に置く。prompt contract として以下の文言を含める：

- issue に明記された要件を**列挙**する指示。
- request の「要件」節と「スコープ外」宣言の**両方**を参照し、いずれにも現れない要件だけを
  undeclared drop として報告する指示（スコープ外宣言を尊重＝drop としない）。
- **差分ゼロ・文言一致は要求しない**旨（意味的に充足/宣言されていれば drop でない）。
- 出力形式（`undeclaredDrops` を要素とする構造化 JSON、各要素は簡潔な要件記述。issue 本文の丸写しをしない）。

prompt-contract テスト（`tests/unit/prompts/issue-fidelity-prompt-contract.test.ts`）で上記文言の存在を固定する。

### D5: halt は awaiting-resume（resume anchor = request-review）。pipeline step は一つも走らない

gate が undeclared drop（≥1）または fetch 失敗を返したら、`CommandRunner.execute()` は
`pipeline.run` を**呼ばず**に：

1. `transitionJob(jobState, "awaiting-resume", { patch: { resumePoint: { step: STEP_NAMES.REQUEST_REVIEW, ... } } })` で awaiting-resume state を作る。
   - `error.code`: undeclared drop は `ISSUE_FIDELITY_UNDECLARED_DROP`、fetch 失敗は `ISSUE_FETCH_FAILED`。
   - `error.message` / `reason`: undeclared drop の列挙（fetch 失敗時は失敗理由）。issue 本文は含めない。
2. `deps.storeFactory(jobId).persist(haltState)` で永続化。
3. `deps.runtimeStrategy?.commitFinalState(deps, haltState)`（best-effort checkpoint publish、pipeline の awaiting-resume seam と同型）。
4. `notifyJobTerminal(haltState, { githubClient, owner, repo })`（linked issue に escalation comment）。
5. `finalState = haltState` として既存の `handleResult` + `teardown` 経路に合流。

resumePoint.step を request-review にすることで resume が entrance に戻り gate が再評価される（D2）。
既存の halt 提示・teardown 経路を再利用し、gate 専用の終端処理を増やさない。

`StepName` は閉じた union のため gate 専用の resumePoint step 値は追加しない（追加すると
`resolveResumeStep` が "Step not found" になる）。request-review anchor が pragmatic。

### D6: fail-closed（fetch 失敗 / 照合不能 / wiring 欠落）

gate が applicable（D2 の 3 条件成立）なとき、以下はいずれも **pass 扱いにせず halt** する：

- `githubClient.getIssue` が throw（network / 401 / 403 / 404 / 5xx） → `ISSUE_FETCH_FAILED` で halt。
- request.md 読み取り失敗 → fail-closed halt（setup 不整合。gate を素通りさせない）。
- comparator 未注入（wiring 欠落） → fail-closed halt（明示的な設定エラーメッセージ）。
- comparator が throw / 返り値 parse 不能 → fail-closed halt。

fetch 失敗の pass 扱いは「issue 連携時だけ歯が抜ける」fail-open であり gate の存在意義を失う。
明示的 operator override は本 change では新設しない。`--issue` を付けた限り gate は必ず結論（pass / halt）を出す。

### D7: inbox は永続 flag `inboxOrigin` で明示 skip し、理由を log に残す

inbox 経路は issue 本文がそのまま request.md であり乖離が構造的に生じない。

- `JobState` に optional `inboxOrigin?: boolean` を追加（`src/state/schema/types.ts`）。
- `PipelineRunOptions` と `runRunCore` options に `inboxOrigin?: boolean` を追加。
- inbox の既定 `startJob`（`run-inbox.ts:400`）が `runRunCore(draftPath, { cwd, issue, inboxOrigin: true })` を渡す。
- gate は `jobState.inboxOrigin === true` を見たら照合せず skip し、skip の事実と理由
  （"request.md is the issue body verbatim (inbox origin)"）を log に残す。

skip 判定を state の永続 field に置くことで run/resume を通して一貫させる（ephemeral option だと
resume で skip が失われ fetch が発生する）。

### D8: 照合対象 request.md は worktree の change folder コピー

gate は `<deps.cwd>/specrunner/changes/<slug>/request.md`（= `requestMdPath(slug)`）を読む。
これは request-review step が読むファイルと同一で、resume では draft から再コピー済み
（`recopyDraftToChangeFolder`）。よって「operator が request.md を修正して resume」した内容が
gate に反映される（受け入れ基準の resume 再評価が成立）。

### D9: comparator は composition root（CLI）から factory 注入する

- `CommandRunner` に optional な `comparatorFactory?: (config: SpecRunnerConfig) => IssueFidelityComparator` を持たせ、
  gate 実行時に `this.comparatorFactory?.(prepared.config)` で生成する（config は prepare 後に確定するため factory 形にして config 束縛を gate 時点まで遅延）。
- `PipelineRunCommand` / `ResumeCommand` の constructor が factory を受け取り super へ渡す。
- `src/cli/run.ts` / `src/cli/resume.ts` が `createIssueFidelityComparator`（adapter）を factory として渡す。
- optional のため既存の command 構築テストは無改変で compile 可（factory 未注入時は D6 の fail-closed が働く）。

managed runtime を claude-code adapter に結合させない。managed で LLM 認証が無ければ
comparator は throw → fail-closed halt（silent pass にならない）。

### D10: getIssue port と adapter

`GitHubClient`（`src/kernel/github-client.ts`）に追加：

```typescript
// GET /repos/{owner}/{repo}/issues/{number}
// 200 → { number, title, body }（body null → ""）
// 401 → GITHUB_TOKEN_EXPIRED（共有 request() 経由）
// 非 200（404 含む）→ GITHUB_API_ERROR（fail-closed の元。gate が catch して halt）
getIssue(owner: string, repo: string, issueNumber: number): Promise<{ number: number; title: string; body: string }>;
```

adapter 実装（`src/adapter/github/github-client.ts`）は既存の共有 `request()`（Authorization / Accept /
X-GitHub-Api-Version、401 処理）を通し、200 を `{ number, title, body: body ?? "" }` に射影、
非 200（404 含む）は `githubApiError` を throw する。`listIssueComments`（`github-client.ts:669`）と同型。

## Alternatives Considered

### Alternative 1: gate を pipeline の最初の step にする

gate を step 化し、request-review の前段として pipeline 内で動かす。

- **Pros**: 既存の step lifecycle（commit / artifact / escalation）を再利用できる。
- **Cons**: step-context-builder が組む prompt に issue 本文を載せる必要があり
  「issue 本文が step prompt 構築に現れない」要件に反する。step executor の
  commit/artifact 機構（`executor.ts`）を引き込み、findings/artifact 経由の伝播面が増える。
- **Why not**: #875 再定義が明示的に却下済み（role-scoped context 違反・正典多重化）。

### Alternative 2: `request validate --against-issue <n>` に置く

入口コマンドに issue との照合オプションを追加し、LLM / network を導入する。

- **Pros**: operator が自明なコマンドで照合を行える。
- **Cons**: `request validate` は完全 offline 決定的コマンドという入口決定性 canon
  （`2026-07-31-deterministic-request-entrance.md`）に反する。LLM 到達境界を入口コマンドに
  持ち込むと、install 直後でも使えるという最大の長所を毀損する。
- **Why not**: #939 の境界を越える。

### Alternative 3: request-review step が issue 本文を入力に取る

request-review step のプロンプトに issue 本文を追加入力として与え、照合も担当させる。

- **Pros**: 既存の step lifecycle を変えずに済む。
- **Cons**: issue 本文が pipeline step の context に入り、#875 再定義の非伝播原則（role-scoped
  context）に反する。また request-review step の役割が request の自己完結性確認から
  外部ソース照合に拡大し、単一責任が崩れる。
- **Why not**: #875 再定義が明示的に却下済み。

### Alternative 4: request.md への「issue 要件対応表」記載を強制する（照合なし）

対応表の記載を request.md のフォーマット要件にし、`request validate` で機械検証する。

- **Pros**: offline / 決定的に検証でき、LLM 呼び出しが不要。
- **Cons**: 対応表の網羅性を issue と照合する者が居なければ、黙って表から落とすだけで素通りする。
  歯にならない（表の存在確認しかできず、undeclared drop を検出できない）。
- **Why not**: 照合なしでは「無言の弱体化」を封止できず、課題の本質を解決しない。

### Alternative 5: inbox 経路にも gate を適用する

`inboxOrigin` かどうかに関わらず全 `--issue` run で gate を適用する。

- **Pros**: 経路の例外が減りコードがシンプルになる。
- **Cons**: inbox は issue 本文がそのまま request.md であり乖離が構造的に生じない。
  無条件適用は無意味な fetch と失敗面を増やすだけ。
- **Why not**: architect 評価で明示却下済み。

### Alternative 6: comparator を `PipelineDeps` に載せ buildDeps で構築する

comparator を deps の一部にし、local/managed runtime の `buildDeps` で構築する。

- **Pros**: 依存注入が deps 構造に統一される。
- **Cons**: managed runtime の `buildDeps` が claude-code の `queryOneShot` を import する
  層越え結合を生む。managed runtime が claudeCode adapter に強結合される。
- **Why not**: composition root 注入の方が層が綺麗。managed adapter への不要な結合を避ける。

## Consequences

### Positive

- `--issue` を伴う run で、undeclared drop が 1 件以上あれば pipeline step が一つも走らず
  awaiting-resume に halt する。以後 全 gate が弱められた request を正典とする問題を封止する。
- 非伝播（issue 本文が state / change folder / step prompt に一切現れない）が機械的に固定される。
- `IssueFidelityComparator` port 化により、gate 挙動テストは fake で決定的に固定できる。
  LLM の精度は port 差し替えで後から改善できる（本 change は「歯を置く」ことが主眼）。
- `getIssue` の追加により、将来の issue 連携用途が共有メソッドを再利用できる。
- inbox 経路の明示 skip（`inboxOrigin` 永続 flag）により、run/resume を通して一貫した skip が維持され
  無駄な fetch が生じない。
- gate halt は `checkConsecutiveEscalations` カウンタを消費しないため、operator は `--force` なしで
  何度でも request.md 修正 → resume を繰り返せる。

### Negative / Trade-offs

- `--issue` を伴う run ごとに entrance で 1 fetch + 1 LLM が追加される。
  ただし entrance のみ（D2）。未連携 run / inbox / pipeline 途中 resume では一切発生しない。
- managed runtime で LLM 認証が無いと comparator が動かない。D9 のとおり
  comparator throw は fail-closed halt（silent pass にならない）ため、縮退時も安全側に倒れる。
- LLM 照合は非決定的（false drop / miss のリスクがある）。Mitigation: prompt を fail-closed 側
  （迷ったら drop として報告）に倒す（D4）。精度は port 差し替えで改善可能。

### Known Gaps / Future Work

- managed native comparator（managed runtime が持つ LLM 基盤を使う実装）は本 change 外（同一 port で差し替え可能）。
- explicit operator override（`--skip-fidelity-gate` 等のフラグ）は本 change では新設しない。
  必要性が出た場合は別 request で検討する。
- request → 派生成果物（spec / tasks / test-cases / 実装）の忠実性検査・hash / revision 束縛は
  #875 の切り分けどおり別課題（out of scope）。

## References

- Issue: #875（issue → request 忠実性ゲートの再定義）
- Issue: #860 / PR #872（実例：undeclared drop が 9.05 点 approve を通過）
- Request: `specrunner/changes/issue-request-fidelity-gate/request.md`
- Design: `specrunner/changes/issue-request-fidelity-gate/design.md`
- Spec: `specrunner/changes/issue-request-fidelity-gate/spec.md`
- Related（入口決定性 canon）: `specrunner/adr/2026-07-31-deterministic-request-entrance.md`
- Related（one-shot query 基盤）: `specrunner/adr/2026-05-18-one-shot-query-wrapper.md`
