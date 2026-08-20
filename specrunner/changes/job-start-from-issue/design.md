# Design: job start --from-issue

## Context

issue 本文を request.md として実行できるのは今のところ inbox（承認ラベル自動発火）だけである。
CI（GitHub Actions の workflow_dispatch 等）や手元から「この issue を今すぐ 1 本走らせる」には、
呼び出し側が「issue 取得 → slug 抽出 → draft 実体化 → `job start --issue <n>`」を自前で組む必要があり、二つの穴が開く。

1. **fidelity comparator の空回り**: issue 本文を byte 同一で draft に転記しても、`--issue` だけでは
   issue-verbatim origin（`jobState.inboxOrigin`）が立たず、entrance の issue fidelity gate が LLM comparator を回す。
   同一文書同士の照合で無意味なコスト。inbox は `inboxOrigin: true` で既にこれを skip している。
2. **内部知識の漏出**: slug 抽出（Meta parse）と draft 配置規約（`specrunner/drafts/<slug>/request.md`）を
   呼び出し側が知る必要があり、CLI の入力契約として閉じていない。

さらに CI 発火では、実行元 checkout の branch（Actions の Branch dropdown）と request の `base-branch` が独立に選べ、
「develop の CLI コードで main 基点の実装が走る」型の黙った食い違いが作れる。

### 現状コードの確認済み事実（fact-check 済み前提に加えて本 step で確認）

- `src/cli/command-registry.ts:553` `runJobHandler` が `job start` / `run` alias 共通ハンドラ。positional `slug|file` は
  `args:[{ required:true }]`（830 行）で、`bin/specrunner.ts:93-96` の `parseFlags` が positional 欠落を throw する。
- `src/cli/command-registry.ts:540-547` `RUN_JOB_FLAGS`。`--issue`（integer,min:1）・`--detach` 等はあるが `from-issue` は無い。
- detach 分岐（561-575）は positional から slug を解決（`resolveSlugForDetach`）して `detachSelf` する。
  子プロセスは同一 argv（`--detach` 除去）で再入する。
- `src/core/command/runner.ts:264-267` が `evaluateIssueFidelityGate({ inboxOrigin: jobState.inboxOrigin, ... })` を呼ぶ。
  `pipeline-run.ts:169-170` が `options.inboxOrigin===true` → `jobState.inboxOrigin=true`。gate（`issue-fidelity-gate.ts:106`）は
  `inboxOrigin===true` で comparator を skip する。→ **`runRunCore(..., { inboxOrigin:true })` を通せば fidelity skip は自動的に成立する。**
- `src/core/inbox/run-inbox.ts:378-401` の default `startJob` effect は「occupancy pre-check → `writeDraft` → `runRunCore(draftPath,{cwd,issue,inboxOrigin:true})`」。
  inbox のテスト（`run-inbox.test.ts`）は `effects.startJob` を **注入モック**でテストしており、default effect の内部は直接叩いていない。
- `src/util/git-exec.ts` の `gitExec()` は非ゼロ / spawn 失敗で `null` を返す。`git symbolic-ref --short -q HEAD` は
  detached HEAD で非ゼロ → `null`。→ current branch 解決と detached 判定を一発で得られる。
- `src/cli/inbox.ts:36-69` に GitHub client 組み立て（`loadConfigWithOverlay` → `resolveGitHubToken` → `getOriginInfo` → `createGitHubClient`）が既にある。

## Goals / Non-Goals

**Goals**:

- `job start --from-issue <n>` を追加し、issue 取得 → parse（slug/base-branch）→ base-branch guard → draft 実体化 → start を
  spec-runner の責務として閉じる。呼び出し側は「issue 番号を渡すだけ」。
- issue 本文 → draft → start の連鎖を **単一の core 関数**に持ち、inbox の default `startJob` と `--from-issue` の両方がそれを呼ぶ（挙動保存の統合）。
- `--from-issue` 時のみ base-branch guard を適用し、実行元 branch と request `base-branch` の食い違いを job state 作成前に fail-closed で止める。
- fidelity comparator skip・issue linkage を既存 `jobState.inboxOrigin` と `--issue` 相当の linkage 再利用で自動化する。
- `job start` usage と guide（jobs topic）に `--from-issue` 契約を反映する。

**Non-Goals**（request のスコープ外をそのまま）:

- `.github/workflows/` の変更（別 PR で対応）。
- `inboxOrigin` の rename / schema 変更。
- inbox（schedule / ラベル自動化）の ephemeral runner 冪等性対応。
- docs/operations.md の GitHub Actions 節。
- 既存起動経路（positional / inbox）への base-branch guard 適用。

## Decisions

### D1: `--from-issue` は integer flag、positional は optional 化し「どちらか一方」を handler で強制

`RUN_JOB_FLAGS` に `"from-issue": { type: "integer", min: 1 }` を追加。`job start` の `args` を `required:false` にし、
`runJobHandler` 冒頭で以下を強制する:

- `--from-issue` あり + positional あり → usage エラー（ARG_ERROR）
- `--from-issue` あり + `--issue` あり → usage エラー（ARG_ERROR、from-issue が linkage を内包する）
- `--from-issue` なし + positional なし → usage エラー（従来 parser が投げていた「requires a <slug|file>」相当を handler で投げる）

**Rationale**: from-issue では positional を取らないため `required:true` のままだと parser が先に落ちて到達不能。
optional 化 + handler 強制で「positional か --from-issue のどちらか一方」を表現する。exclusivity 検査を handler 一箇所に集約すれば
排他 2 系を同じ場所で pin できる。

**Alternatives**:
- `from-issue` を positional 扱い（`job start --from-issue` を無引数サブモードに）→ parser 拡張が重く却下。
- 別コマンド `job start-from-issue`／`issue start` → `job start` の flag 直交（`--detach` 併用）を満たすには同一ハンドラが素直。却下。

### D2: 「issue body → draft → start」を単一 core 関数に抽出、inbox default effect が委譲

新関数 `materializeDraftAndStart({ repoRoot, slug, issueBody, issueNumber }): Promise<number>` を core に置く。
中身は現状 inbox `startJob` の後半 2 行と byte 等価:

```
writeDraft(repoRoot, slug, issueBody)
runRunCore(`specrunner/drafts/${slug}/request.md`, { cwd: repoRoot, issue: issueNumber, inboxOrigin: true })  // 戻り値 exit code を返す
```

`runRunCore`（cli/run）への参照は inbox が既に使う **動的 import**（`await import("../../cli/run.js")`）を踏襲し、静的な core→cli 依存を持ち込まない。
inbox の default `startJob` は occupancy pre-check を残したまま、後半 2 行をこの関数呼び出しに置換する。

**Rationale**: 要求 #2「同じ方針を 2 箇所に置かない」を最小差分で満たす。inbox の occupancy pre-check は
「rejection コメント投稿のため SlugOccupiedError を throw する」inbox 固有責務なので統合対象外（core 関数の外に残す）。
inbox テストは `startJob` を注入モックでテストしており、default effect 内部の委譲化は観測挙動を変えない → 既存テスト無改変で green。

**Alternatives**:
- occupancy pre-check ごと core 関数へ吸い上げ → from-issue は occupancy を「既存 SlugOccupiedError 経路（`runRunCore` 内 `assertNoDuplicateLiveJob`）」に乗せる方針（受け入れ基準）なので、pre-check を共有すると二重化する。却下。

### D3: from-issue オーケストレーションは新 CLI モジュール `runFromIssue` に置き、detach を自己完結で扱う

`src/cli/from-issue.ts` に `runFromIssue(issueNumber, opts, ctx)` を新設（`runInboxRun` と同型の CLI エントリ）。処理順:

1. GitHub client 組み立て（`src/cli/inbox.ts` と同じ関数列: config → token → origin → client）
2. `githubClient.getIssue(owner, repo, n)` で本文取得
3. `parseRequestMdContent(body, "issue#<n>")` で slug / baseBranch 取得（parse 失敗は throw → **副作用ゼロ**でエラー終了）
4. base-branch guard（D4）— 不一致は throw（**draft も job state も未生成**）
5. `--detach` かつ detached-child でない → `detachSelf({ slug, args, repoRoot })`（親は slug をここで確定）
6. それ以外 → `materializeDraftAndStart({ repoRoot, slug, issueBody, issueNumber })` の exit code で `process.exit`

`runJobHandler` は exclusivity 検査の後、`--from-issue` があれば generic detach 分岐より前に `runFromIssue` へ委譲する
（generic 分岐は positional 前提の `resolveSlugForDetach` を使うため from-issue では通せない）。

**Rationale**: base-branch guard は fail-closed を「job state 作成前」に成立させる必要があり、detach では**親プロセスで**判定しないと
親が exit 0（登録成功）を返した後に子が落ちる UX 破綻になる。よって fetch/parse/guard は親で実施し、slug を確定してから detach する。
子は同一 argv で `runFromIssue` に再入し fetch/parse/guard を再実行（冪等）してから materialize+run する。

**Alternatives**:
- guard を子（detached）だけで実施 → 親が誤って成功扱い。却下。
- detach を generic 分岐のまま from-issue 用 slug 解決を差し込む → fetch が非同期で generic 分岐に GitHub 依存が漏れる。却下。

### D4: base-branch guard は git helper + 専用エラーで表現、detached=不一致

`src/git/` に `getCurrentBranch(cwd): Promise<string | null>` を追加（`gitExec(defaultSpawnFn, cwd, ["symbolic-ref","--short","-q","HEAD"])`。
detached HEAD / 非 git / エラーは `null`）。`runFromIssue` は step 3 の後、step 5/6 の前に:

- `current = await getCurrentBranch(repoRoot)`
- `current !== baseBranch`（null 含む）なら `baseBranchMismatchError(current, baseBranch)` を throw

エラー文言は両値を明示（例: `current branch "develop" does not match request base-branch "main"`。detached は `current branch (detached HEAD) does not match ...` 相当）。
新 error code `BASE_BRANCH_MISMATCH`（`EXIT_CODE.ARG_ERROR` へ mapping）を `src/errors.ts` に追加する。

**Rationale**: `symbolic-ref -q` は detached で非ゼロ → helper が `null` を返し、「detached も不一致扱い」を追加コードなしで満たす。
guard を parse の後・writeDraft の前に置くことで、不一致時に draft も job state も生まれない（副作用ゼロ）。

**Alternatives**:
- `git rev-parse --abbrev-ref HEAD` → detached で文字列 `"HEAD"` を返し、branch 名が `HEAD` のケースと区別できない。`symbolic-ref -q` を採る。

### D5: issue-verbatim origin は既存 `jobState.inboxOrigin` を再利用（schema 変更なし）

fidelity skip は `runRunCore(..., { inboxOrigin: true })` を通すだけで `pipeline-run.ts:169-170` → `jobState.inboxOrigin=true` →
`runner.ts:267` → gate skip が既存配線でそのまま成立する。schema・field 名は触らない。

**Rationale**: 要求 #5 明示。field の意味（「issue body == request.md、転記乖離なし」）は from-issue にそのまま当てはまる（byte 同一転記）。

**Alternatives**:
- 新 field（`issueVerbatimOrigin` 等）を足す → schema 変更となりスコープ外。既存 field の意味が完全一致するため不要。却下。

### D6: help / guide の追随

- `job start` の help summary（`command-registry.ts:835` 付近）に `--from-issue <n>` 行を追加（fidelity skip・base-branch guard・排他を一言で）。
- guide の `jobs` topic 起動節（`src/core/command/guide.ts` の GUIDE_TOPICS[jobs] body）に `--from-issue` の契約を反映する。

**Rationale**: 要求 #6。inbox topic は inbox 経路の説明が主で、`--from-issue` は「手元/CI から 1 本」の起動なので jobs topic が該当箇所。

**Alternatives**:
- inbox topic に書く → from-issue は inbox 経路ではないため読み手の想定と噛み合わない。却下。

### D7: ADR

本変更は CLI 入力契約の追加（base-branch guard の fail-closed 方針、issue-verbatim origin の再利用）を含み ADR-worthy。
ADR は adr-gen step が生成する（本 design / tasks では ADR の具体 path を書かない）。

## Risks / Trade-offs

- **[Risk] slug 占有時に draft が残る**: from-issue は occupancy を「既存 SlugOccupiedError 経路（`runRunCore` 内 `assertNoDuplicateLiveJob`）」に
  乗せる方針のため、writeDraft の後に占有が検出され draft が残り得る。→ **Mitigation**: 稼働中 job は `specrunner/changes/<slug>/` から走り
  `drafts/<slug>/` は参照しない（draft 上書きは無害・冪等）。受け入れ基準も slug 占有では「既存経路に乗る」のみを要求し draft 残留無しは求めない。
  parse 失敗・base-branch 不一致（残留無しが必須）は writeDraft より前で落ちるため影響しない。
- **[Risk] detach で issue を二度 fetch/parse/guard する**: 親（slug 確定 + guard）と子（再入）で重複。→ **Mitigation**: いずれも冪等で追加コストは軽微。
  guard を親で実施しないと fail-closed が壊れるため二重実行は許容する。
- **[Risk] positional を optional 化すると「引数欠落」エラーが parser 発から handler 発に移る**: → **Mitigation**: handler で同義の usage メッセージ + `ARG_ERROR`（exit 2）を投げ、既存挙動（非ゼロ・usage 表示）を保つ。parser 文言に依存する既存テストがあれば handler メッセージを合わせる。
- **[Risk] GitHub client 組み立てが inbox.ts と重複**: → **Mitigation**: 要求は「同じ経路」で足り、統合必須ではない。inbox.ts を触ると inbox テストへの波及リスクがあるため、from-issue.ts に同じ関数列を並べる（数行）に留める。将来の共通化は別途。

## Open Questions

- 排他 / guard のエラー文言の最終確定（本 design の例で pin する）。実装時に既存 usage 出力トーンへ合わせる。
- `materializeDraftAndStart` の配置（`src/core/job/` 新設 か `src/core/inbox/` 併設）。挙動には非依存。実装者が近傍の import 都合で決めてよい。

<!-- spec-fixer-deferred: TC-007 priority should→must spec-fixer は test-cases.md への書き込みが拒否された（スコープ外）。実装者または次 step が TC-007 の priority を should から must に変更し、Summary/Result の must カウントを +1 すること。 -->
<!-- spec-fixer-deferred: fetch 失敗 TC 追加（F-002） spec-fixer は test-cases.md への書き込みが拒否された（スコープ外）。spec.md への fetch 失敗 Requirement 追加は完了済み。test-cases.md に integration/must の TC を追加すること: GitHubClient.getIssue が 404 で throw する mock で draft 不在・job state 不在・非ゼロ exit を assert する。 -->
<!-- spec-fixer-deferred: detach 子プロセス再 fetch 失敗 TC（F-004） spec-fixer は test-cases.md への書き込みが拒否された（スコープ外）。test-cases.md に manual/could の TC を追加すること: 「親 fetch 成功→exit 0 後、子再 fetch 失敗（issue 削除・ネットワーク断）で親 exit 0・job 不在になることをリリース前に手動確認する」。 -->
