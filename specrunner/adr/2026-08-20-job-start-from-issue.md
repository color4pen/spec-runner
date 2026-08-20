# job start --from-issue: issue を request source として直接起動する CLI 契約

**Date**: 2026-08-20
**Status**: accepted
**Related**: `specrunner/adr/2026-06-07-no-worktree-execution-mode.md`（CI 起動モードの上位決定）

## Context

issue 本文を request.md として実行できるのは inbox（承認ラベル自動発火）だけであり、CI（GitHub Actions の `workflow_dispatch` 等）や手元から「この issue を今すぐ 1 本走らせる」用途では呼び出し側が 4 段階を手組みする必要があった：

1. GitHub API で issue 本文を取得
2. Meta 行を parse して slug を抽出
3. draft を `specrunner/drafts/<slug>/request.md` に配置
4. `job start --issue <n>` を実行

この 4 段階には構造的な問題が二つある。

**fidelity comparator の空回り**: issue 本文を byte 同一で draft に転記しても、`--issue` だけでは `jobState.inboxOrigin` が立たず、entrance の issue fidelity gate が LLM comparator を実行する。同一文書同士の照合であり無意味なコスト。inbox はこれを `inboxOrigin: true` で既に skip している。

**内部知識の漏出**: slug 抽出（Meta parse）と draft 配置規約（`specrunner/drafts/<slug>/request.md`）を呼び出し側が知る必要があり、CLI の入力契約として閉じていない。

さらに CI 発火では実行元 checkout の branch（Actions の Branch dropdown）と request の `base-branch` が独立に選べ、「develop の CLI コードで main 基点の実装が走る」型の黙った食い違いが検出されない（`src/core/runtime/local.ts` の worktree は `origin/<baseBranch>` から切られるため実行元 HEAD は参照されない）。

## Decision

### D1: `job start --from-issue <n>` を新フラグとして追加し、positional を optional 化して handler で排他を強制する

`RUN_JOB_FLAGS` に `"from-issue": { type: "integer", min: 1 }` を追加する。`job start` の `args` を `required: false` にし、`runJobHandler` 冒頭で以下を強制する:

- `--from-issue` あり + positional あり → usage エラー（ARG_ERROR）
- `--from-issue` あり + `--issue` あり → usage エラー（ARG_ERROR、from-issue が linkage を内包するため）
- `--from-issue` なし + positional なし → 「slug|file か --from-issue が必要」の usage エラー（ARG_ERROR）
- `--detach` とは併用可能（通常の detach 契約がそのまま成立する）

**採用理由**: `--from-issue` では positional を取らないため `required: true` のままだと parser が先に落ちて from-issue への到達が不能になる。optional 化 + handler 強制で「positional か `--from-issue` のどちらか一方」を表現し、排他 2 系を同じ場所で pin できる。

**却下案**:
- `--from-issue` を positional 扱い（`job start --from-issue` を無引数サブモードに） → parser 拡張が重く、flag の直交性（`--detach` 併用）も表現しにくい。却下。
- 別コマンド `job start-from-issue` / `issue start` → `job start` の flag 直交（`--detach` 併用）を満たすには同一ハンドラが素直。却下。

### D2: issue body → draft → start の連鎖を単一の core 関数 `materializeDraftAndStart` に統合し、inbox がそれに委譲する

新関数 `materializeDraftAndStart({ repoRoot, slug, issueBody, issueNumber }): Promise<number>` を `src/core/job/start-from-issue.ts` に新設する。中身は inbox `startJob` 後半 2 行と byte 等価:

```
writeDraft(repoRoot, slug, issueBody)
const { runRunCore } = await import("../../cli/run.js")
return runRunCore(`specrunner/drafts/${slug}/request.md`, { cwd: repoRoot, issue: issueNumber, inboxOrigin: true })
```

inbox の default `startJob` effect は occupancy pre-check を残したまま、後半 2 行をこの関数呼び出しに置換する。`runRunCore` への参照は inbox が既に使う動的 import を踏襲し、静的な core→cli 依存を持ち込まない。

**採用理由**: 「同じ方針の実装を 2 箇所に置かない」を最小差分で満たす。inbox の occupancy pre-check（SlugOccupiedError throw → rejection コメント投稿）は inbox 固有責務なので統合対象外（core 関数の外に残す）。inbox テストは `startJob` を注入モックでテストしており、default effect 内部の委譲化は観測挙動を変えないため inbox の既存テストが無改変で green のままになる。

**却下案**:
- occupancy pre-check ごと core 関数へ吸い上げ → from-issue は占有を「既存 SlugOccupiedError 経路（`runRunCore` 内 `assertNoDuplicateLiveJob`）」に乗せる方針であり、pre-check を共有すると二重化する。却下。

### D3: from-issue オーケストレーションを専用 CLI モジュール `src/cli/from-issue.ts` に置き、detach 時は親プロセスで fetch/parse/guard を完了してから detach する

`runFromIssue(issueNumber, opts, ctx)` を新設する。処理順:

1. GitHub client 組み立て（config → `resolveGitHubToken` → `getOriginInfo` → `createGitHubClient`）
2. `githubClient.getIssue(owner, repo, n)` で本文取得（fetch 失敗はここで throw → 副作用ゼロ）
3. `parseRequestMdContent(body, "issue#<n>")` で slug / baseBranch 取得（parse 失敗は throw → 副作用ゼロ）
4. base-branch guard（D4）— 不一致は throw（draft も job state も未生成）
5. `--detach` かつ detached-child でない → `detachSelf({ slug, args, repoRoot })` して親は exit
6. それ以外 → `materializeDraftAndStart({ repoRoot, slug, issueBody, issueNumber })` の exit code で `process.exit`

`runJobHandler` は exclusivity 検査の後、`--from-issue` があれば generic detach 分岐より前に `runFromIssue` へ委譲する（generic 分岐は positional 前提の `resolveSlugForDetach` を使うため from-issue では通せない）。

**採用理由**: base-branch guard は「job state 作成前」の fail-closed が必須であり、detach では**親プロセスで**判定しないと親が exit 0（登録成功）を返した後に子が落ちる UX 破綻になる。親で fetch/parse/guard を済ませてから slug を確定して detach する設計が唯一の一貫した経路。子は同一 argv で `runFromIssue` に再入し fetch/parse/guard を再実行（冪等）してから materialize+run する。

**却下案**:
- guard を子（detached）だけで実施 → 親が誤って成功扱いのまま exit する。却下。
- detach を generic 分岐のまま from-issue 用 slug 解決を差し込む → fetch が非同期で generic 分岐に GitHub 依存が漏れる。却下。

### D4: base-branch guard は `--from-issue` 起動時のみ適用し、detached HEAD も不一致として扱う

`src/git/branch.ts` に `getCurrentBranch(cwd): Promise<string | null>` を追加する（`gitExec(defaultSpawnFn, cwd, ["symbolic-ref","--short","-q","HEAD"])`。detached HEAD / 非 git / エラーは `null`）。

`runFromIssue` は parse の後・writeDraft の前に以下を実行する:

- `current = await getCurrentBranch(repoRoot)`
- `current !== baseBranch`（null 含む）なら `baseBranchMismatchError(current, baseBranch)` を throw

エラー文言は両値を明示（例: `current branch "develop" does not match request base-branch "main"`。detached は `current branch (detached HEAD) does not match ...`）。

既存の起動経路（positional file/slug、inbox）の挙動は変えない。

**採用理由**: `symbolic-ref -q` は detached で非ゼロ → helper が `null` を返し、「detached も不一致扱い」を追加コードなしで満たす。guard を parse の後・writeDraft の前に置くことで、不一致時に draft も job state も生まれない（副作用ゼロ）。`--from-issue` 以外の経路に guard を適用しない理由は、それらの経路は呼び出し側が draft/slug を明示的に管理しており、既存の挙動との互換性を守るためである。

**却下案**:
- `git rev-parse --abbrev-ref HEAD` → detached で文字列 `"HEAD"` を返し、branch 名が `HEAD` のケースと区別できない。`symbolic-ref -q` を採る。
- guard を positional / inbox にも適用 → request のスコープ外。既存利用者への意図しない破壊的変更になる。却下。

### D5: issue-verbatim origin の表現は既存の `jobState.inboxOrigin` を再利用し、schema 変更・field 追加は行わない

`--from-issue` 起動時、`runRunCore(..., { inboxOrigin: true })` を通すだけで `pipeline-run.ts` → `jobState.inboxOrigin=true` → issue fidelity gate skip が既存配線でそのまま成立する。`inboxOrigin` フィールドの意味（「issue body == request.md、転記乖離なし」）は `--from-issue` にそのまま当てはまる（byte 同一転記）。

**採用理由**: フィールドの意味が完全一致し、新フィールドを追加する理由がない。schema 変更なしで実装できるため、既存の state 読み書き経路への影響がゼロ。

**却下案**:
- 新フィールド（`issueVerbatimOrigin` 等）を追加する → schema 変更となりスコープ外。既存フィールドの意味が完全一致するため不要。却下。

## Alternatives Considered

### Alternative 1: D1 — `--from-issue` を positional 扱いにし、`job start` を無引数サブモードにする

- **Pros**: positional の optional 化と handler 強制排他が不要になる
- **Cons**: parser 拡張が重く、`--detach` 等の flag 直交性を表現しにくい。`job start --from-issue 5 --detach` のような自然な flag 組み合わせが難しくなる
- **Why not**: flag として扱う方が `job start` の既存 flag 体系（`--detach`・`--json` 等）と一貫性があり、実装コストも低い。却下

### Alternative 2: D1 — 別コマンド `job start-from-issue` / `issue start` を新設する

- **Pros**: `job start` の positional optional 化が不要で、コマンドの責務が明確に分離される
- **Cons**: `--detach`・`--json`・`--no-worktree` 等の既存 flag を全て複製する必要がある。`job start` とのフラグ乖離が時間とともに広がる
- **Why not**: 既存 `job start` ハンドラが flag 直交（`--detach` 併用等）を既に保持しており、同一ハンドラに委譲する方が最小差分。却下

### Alternative 3: D2 — occupancy pre-check ごと core 関数へ吸い上げ、inbox と from-issue で共有する

- **Pros**: core 関数が完全に自己完結し、呼び出し側が pre-check を知らなくてよくなる
- **Cons**: from-issue は slug 占有を「既存 SlugOccupiedError 経路（`runRunCore` 内 `assertNoDuplicateLiveJob`）」に乗せる方針であり、core 関数で pre-check すると二重検査になる。inbox の pre-check は SlugOccupiedError を catch して rejection コメントを投稿する inbox 固有責務を持ち、共有できない
- **Why not**: 二重検査の発生と inbox 固有責務の混入を避けるため pre-check は inbox に残す。却下

### Alternative 4: D3 — base-branch guard を子プロセス（detached）でのみ実施する

- **Pros**: 親プロセスで fetch/parse/guard を実行しなくてよくなり、detach の高速化が図れる
- **Cons**: 親が exit 0（登録成功）を返した後に子が guard で失敗する。ユーザーから見ると「登録は成功したのに job が動かない」という UX 破綻になる
- **Why not**: guard の目的は「job state 作成前の fail-closed」であり、親で完了することが必須。却下

### Alternative 5: D4 — `git rev-parse --abbrev-ref HEAD` で現在 branch を取得する

- **Pros**: `git symbolic-ref` より広く知られたコマンドで、git 経験の浅い読み手にも親しみやすい
- **Cons**: detached HEAD 時に文字列 `"HEAD"` を返す。branch 名が文字通り `HEAD` である（通常あり得ないが）ケースと区別できず、detached を不一致として扱う要件を追加コードなしで満たせない
- **Why not**: `symbolic-ref -q` は detached で非ゼロ終了 → `null` を返し、1 行のガードで detached 判定を完結できる。却下

### Alternative 6: D5 — 新フィールド `issueVerbatimOrigin` を state schema に追加する

- **Pros**: `inboxOrigin` の意味を inbox 専用に保ち、from-issue 用途と意味的に分離できる
- **Cons**: schema 変更はスコープ外。`inboxOrigin` の定義（「issue body == request.md、転記乖離なし」）は from-issue の転記にそのまま当てはまり、フィールドの意味が完全一致する
- **Why not**: 意味が同一のフィールドを 2 つ持つのは冗長。既存配線を活用しスキーマ変更ゼロで実現できる。却下

## Consequences

### Positive

- CI（`workflow_dispatch` 等）や手元から issue 番号を渡すだけで `job start --from-issue <n>` が完結し、呼び出し側スクリプトが内部知識を持つ必要がなくなる。
- issue 本文 → draft の byte 同一転記が `inboxOrigin: true` で自動的に保証され、fidelity comparator の不要な実行が排除される。
- base-branch guard により、CI の branch dropdown 誤選択による「黙った食い違い」が job state 作成前に fail-closed で検出される。
- inbox と `--from-issue` の連鎖ロジックが単一の core 関数に統合され、同じ方針の実装が 2 箇所に散在しない。
- inbox の既存テストが無改変で green のままであり、統合が挙動保存の refactoring であることを証明している。

### Negative / Known Debt

- slug 占有時に draft が残り得る（writeDraft の後に占有が検出される経路）。ただし稼働中 job は `specrunner/changes/<slug>/` から走り `drafts/<slug>/` は参照しないため実害はなく、draft 上書きは冪等。
- detach 時は issue を二度 fetch/parse/guard する（親で確定 + 子で再入）。いずれも冪等で追加コストは軽微だが、将来の改善余地がある（`ponytail: 二重 fetch、slug を argv 経由で渡せば一度に削減可`）。
- `--from-issue` と inbox の GitHub client 組み立てコードが `src/cli/from-issue.ts` と `src/cli/inbox.ts` に並存する（数行レベルの重複）。inbox.ts を触ると inbox テストへの波及リスクがあるため統合を留保している。将来の共通化は別途。

## References

- Request: `specrunner/changes/job-start-from-issue/request.md`
- Design: `specrunner/changes/job-start-from-issue/design.md`
- Related: `specrunner/adr/2026-06-07-no-worktree-execution-mode.md`（CI 起動モードの上位決定）
