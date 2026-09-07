# ADR-20260906: GitHub 連携を job 単位の任意契約として分離する

**Date**: 2026-09-06
**Status**: accepted

## Context

SpecRunner はこれまで Git と GitHub を単一の依存として扱い、CLI 初期化・repository identity・pipeline 完了終端・job lifecycle のすべてで GitHub token / GitHub API / GitHub 形式 origin が必須だった。主な結合点は次のとおり。

| 箇所 | 結合の内容 |
|---|---|
| `src/core/preflight.ts` | `resolveGitHubToken` 無条件、`getOriginInfo` が GitHub 形式 origin を要求 |
| `src/cli/bootstrap.ts` | resume 系初期化でも token 解決 → `createGitHubClient` を必須実行 |
| `src/core/runtime/local.ts` | `LocalRuntimeOptions.githubClient` が必須、`buildDeps` が token を配布 |
| `src/git/remote.ts` | origin の存在確認と GitHub owner/name 抽出が 1 関数に混在 |
| `src/core/pipeline/registry.ts` | standard / fast の終端が `PrCreateStep` 固定 |
| `src/core/command/reopen.ts` | job lifecycle の reopen が PR 存在 + OPEN 確認と結合 |
| `src/state/schema/types.ts` | `RepositoryInfo.owner` / `.name` が必須（GitHub API identity = 汎用 identity）|

一方 Git 側の基盤（branch-borne state・commit 台帳・egress 検査・worktree 隔離・checkpoint 検証）はすでに forge 非依存で動作していた。`transport-auth` も token 無しなら素通しだった。

#1115 / #1122 は「GitHub 不要化」を誤って「Git 不要化」まで拡張したもので #1124 でリバート済み。本 ADR の変更はそれを再導入しない。目的は「GitHub を使わないこと」と「Git remote を使わないこと」を別概念として明確化し、**GitHub 連携を宣言された job 単位の契約として分離する**ことである。

制約:
- 既存の GitHub 有効 job の挙動・安全確認は不変。
- 既存 state（宣言なし）は GitHub 有効として解釈する。
- architecture 不変条件 B-1 / B-8 / B-9 / B-10 を壊さない。
- 受け入れ条件は「実 CLI 経路と既存 CommandRunner を通す」ことを要求し、別 orchestrator の新設は不可。

## Decision

### D1: 宣言は `config.github.enabled`、権威は job state の `githubIntegration`

- `SpecRunnerConfig.github.enabled?: boolean` を追加（未指定は `true`、既存互換）。
- `job start` 時に解決した値を branch-borne job state の `githubIntegration: { enabled: boolean }` に記録する。
- resume / reopen / attach / archive は config を再解決せず job state の値を使う。
- state に `githubIntegration` がない legacy state は `{ enabled: true }` として解釈する。

既存の `profile` / `reviewers` / `pipelineId` / `noWorktree` が「start 時に決めて state に凍結する」形をとっている前例に倣う。`runtime: local|managed` に相乗りしないのは、agent 実行基盤と外部連携が独立の軸だから（local + GitHub 有効 / local + GitHub 無効 の 2 通りが必要）。

### D2: 解決 seam を「config resolver」と「state accessor」の 2 関数に固定する

- `src/config/github-integration.ts`（新規）: `resolveGitHubIntegrationConfig(config)` / `traceGitHubIntegration(loadResult)`。
- `src/state/github-integration.ts`（新規、`state/profile.ts` と同型）: `getGitHubIntegration(state)` — フィールド不在は `{ enabled: true }`。
- `config.github?.enabled` の直接参照を散在させず、B-19 の grep 検査で境界を守れるようにする。

### D3: 認証と client 構築を「core の解決」と「CLI の composition」に分け、無効時は到達させない

- `src/core/github/integration.ts`（新規）: `resolveJobGitHubIntegration({ enabled, ... })` が判別可能な union を返す。
  - `{ enabled: false; origin: RepositoryOrigin }` — token 解決なし、GitHub host 参照なし。
  - `{ enabled: true; token; host; repository: { owner; name }; origin; ... }` — 既存 token 解決と GitHub origin 解析を 1 箇所に集約。
- `src/cli/github-composition.ts`（新規）: union を受け取り `GitHubClient | null` を返す composition root。`createGitHubClient` の呼び出しは **enabled === true の分岐内のみ**。
- `preflight` / `bootstrap` / `attach` / `archive` / `reopen` / `doctor` は自前の token 解決・client 構築をやめ、この seam を通す。
- transport auth は無効時に `createTransportAuth({ token: undefined })` で構築し、SSH / credential helper に委ねる。B-10（`resolveGitHubToken` に host、`createGitHubClient` に baseUrl）は call site が減っても維持される。

### D4: `src/git/remote.ts` を「汎用 origin」と「GitHub origin」に分ける

- 追加: `getOriginUrl(cwd)` — git repo / origin 存在確認のみ、生の URL を返す。
- 追加: `normalizeOriginIdentity(remoteUrl): RepositoryOrigin` — credential / scheme / port / `.git` 末尾を除去した正規化 URL と SHA-256 digest の純関数。同一 repository を HTTPS / SSH で clone した別 checkout が attach 照合で誤って失敗しないようにするため、scheme と port を落として `host/path` に正規化する。
- 既存 `getOriginInfo` は GitHub 形式要求の意味を維持したまま内部を `getOriginUrl` + `parseRemoteUrl` の合成に書き換え、GitHub 有効経路のみが呼ぶ。

### D5: repository identity を「汎用 origin identity」と「GitHub API identity」に分離する

- `RepositoryInfo.owner?: string` / `.name?: string` を optional に変更（GitHub API identity。GitHub 有効 job でのみ存在）。
- `RepositoryInfo.origin?: RepositoryOrigin` を追加（汎用 identity。新規 job は有効・無効を問わず記録）。
- `validateJobState` に意味規則を追加:
  - `githubIntegration` 不在（legacy）または `enabled === true` → `owner` / `name` は非空文字列必須。
  - `enabled === false` → `owner` / `name` は不在必須（架空値禁止）、`origin` 必須。
- `requireGitHubRepository(state)` を用意し、GitHub 専用 consumer（reopen / issue notifier / bootstrap など）が明示的に通る funnel とする。契約違反は `GITHUB_INTEGRATION_DISABLED` で fail-loud。

### D6: 完了終端は既存の descriptor 合成点で選択する（新 step / 新 pipeline を作らない）

- `src/core/pipeline/apply-github-integration.ts`（新規）: `applyGitHubIntegration(descriptor, contract)` が descriptor をデータとして変換する。
  - `enabled === true` → 参照同一で返す（ゼロオーバーヘッド）。
  - `enabled === false` → `steps` から `pr-create` を除去し、`to: PR_CREATE` の transition を `to: "end"` に書き換えた新 descriptor を返す。
- 適用点は `getPipelineDescriptor` → `applyScopeConfig` → `applyGitHubIntegration` → `composeReviewerDescriptor` の合成列。入力は config ではなく **jobState**（`getGitHubIntegration(jobState)`）。
- design-only は元から `pr-create` を含まないため変換は恒等（profile の意味を変えない）。
- `resume --from pr-create` は `buildAllowedStepSet` に契約を渡して実行前に usage エラー（exit 2）で拒否する。

### D7: PR が無いときの証跡は branch artifact として残す

- `specrunner/changes/<slug>/attestation.md` を pipeline-managed artifact とする（agent 書き込み不可）。生成は `LocalRuntime.commitFinalState` の中、git staging 直前。**GitHub 無効の `awaiting-archive` のときのみ**生成する（既存 GitHub 有効 job の成果物は変えない）。書き込み失敗は warn のみ（terminal 遷移・push を止めない）。
- 完了出力（`runner.ts` の `handleResult`）は、GitHub 無効の `awaiting-archive` のとき PR 行の代わりに branch / 最終 revision / 証跡の所在を出す。
- `RunResultContract`（`--json`）は `schemaVersion: 1` のまま `result: "branch-published"` / `branch` / `revision` / `githubIntegration` を additive に追加する。GitHub 有効 job の出力は変えない。

### D8: job lifecycle の GitHub gate は job 契約でのみ発火する

- **reopen**: status gate / `--reason` 必須 / operator event append / `allowReopen` opt-in は不変。PR 必須と OPEN 確認は `getGitHubIntegration(state).enabled === true` のときだけ実行する。
- **archive**: `--with-merge` / `--merge-wait-ms` は GitHub 無効 job で副作用前に拒否（exit 2）。push 失敗時に archived にしない・cleanup しない安全条件は不変。`deleteRemoteBranch: false` も不変。
- **attach**: `verifyCheckpoint` の `expectedRepo` を `{ github?: {owner,name}; origin: RepositoryOrigin }` に拡張する。checkpoint 契約が有効（または legacy）→ GitHub identity の一致を要求（invoker 側 config が無効でも緩めない。fail-closed）。checkpoint 契約が無効 → `origin.digest` の一致を要求。materialize 以降の runtime は **checkpoint の契約**で構成し、invoker config で上書きしない。

### D9: command capability の境界を registry に宣言し、dispatch と job の 2 段で拒否する

- `CommandSpec.requiresGitHub?: boolean` と flag の `githubOnly?: true` を追加。宣言対象: `start --issue` / `start|resume|archive --from-issue` / `inbox run` / `archive --with-merge` / `archive --merge-wait-ms`。
- **dispatch gate**（`bin/specrunner.ts`）: プロジェクト config が無効なら、宣言のある command / flag を handler 実行前に拒否（exit 2）。job も worktree も作られない。
- **job gate**（handler 内）: 既存 job を対象にする操作は、config が有効でも **job 契約が無効なら**拒否する。
- **B-19 architecture 不変条件を追加**: `resolveGitHubToken` / `createGitHubClient` の呼び出しが D3 の 2 モジュール（+ `login` / `credentials` / `doctor` の allowlist）以外に現れないことを grep 検査で固定する。`architecture/model.md` §4 と `architecture/conformance.md` に B-19 を追加し、`invariant-catalog-parity` の ID 集合と同期する。

### D10: doctor は契約に応じて検査集合を選ぶ

GitHub 無効のとき `github-token-present` / `github-token-valid` / `github-client-id` / `github-origin` を検査集合から外し、doctor 自身も token 解決・client 構築を行わない。代わりに汎用 `git-origin` を追加。外した検査は fail / warn にせず「不要」として明示する。

### D11: managed × GitHub 無効の拒否は `createRuntime` に置く

`createRuntime` は `config.runtime === "managed"` かつ契約が無効なら `SpecRunnerError`（`GITHUB_INTEGRATION_UNSUPPORTED_RUNTIME`）を投げる。B-8（`config.runtime` の分岐を `createRuntime` 以外に作らない）に準拠し、job state 作成・worktree 作成の前に到達する。

### D12: 表示・文書・architecture を実装に追従させる

- `config effective`: 解決した `github.enabled` と設定元（project-local / user-global / default）を human / JSON 双方に出す。
- `job show` / 起動ログ: job に固定された連携状態を表示する。
- `ARCHIVE_USAGE` の「PR merge 後に再実行」という記述を現行の単相 archive 実装に合わせて訂正する。
- README / `docs/configuration.md` / guide: 対応表・設定例・「GitHub 非依存 ≠ Git 非依存」の区別を記述。archived は「main に merge 済み」を意味しないこと、CI / branch protection は GitHub 有効経路の外部 gate であり無効経路では実施されない（pipeline 内部の検証は同一）ことを明記する。
- `architecture/components.md` / `domain-model.md` / `dynamic-model.md` を Git の authority と任意 GitHub 連携の境界に合わせて更新する。

## Alternatives Considered

### Alternative 1: `runtime` enum に `local-nogithub` を追加する（D1 の代替）

- **Pros**: `config.runtime` の 1 enum で agent 基盤と外部連携の両方を管理できる。既存の B-8 分岐集約点に触らなくてよい。
- **Cons**: agent 実行基盤（local / managed）と外部連携（GitHub 有効 / 無効）という独立した 2 軸を 1 軸に潰してしまう。`managed` × GitHub 無効の組合せが将来表現できなくなる。B-8 の分岐集約点（`createRuntime`）に外部連携の意味が混入する。
- **Why not**: 独立した 2 軸を 1 enum に畳むと組合せ爆発を引き起こす。`local + GitHub 有効` / `local + GitHub 無効` の 2 通りが最低限必要な時点で enum 追加では表現力が足りない。

### Alternative 2: CLI の一時上書き flag `--no-github` を導入する（D1 の代替）

- **Pros**: 実行時に柔軟に切り替えられ、config ファイルの変更なしに無効経路を試せる。
- **Cons**: job ごとに固定された権威が曖昧になる。start と resume / archive で flag の有無が異なると一貫した契約を保証できない。request.md が「初期対応に必須としない」と明記している。
- **Why not**: D1 の核心は「start 時に決めて state に凍結し、後続操作はその値を使う」という不変性。flag は実行ごとに変わり得るため、config 変更による暗黙移行禁止という同じ問題を別の形で再現する。

### Alternative 3: request.md の Meta セクションで `github: false` を宣言する（D1 の代替）

- **Pros**: request ファイルに実行環境の設定が集約でき、start 時に 1 ファイルで完結する。
- **Cons**: request は「何を作るか（仕様）」であり「どの環境で動かすか（インフラ宣言）」ではない。同じ request を GitHub 有効・無効の両方の環境で実行したいケースに対応できない。
- **Why not**: 実行環境の宣言はプロジェクト設定（`.specrunner/config.json`）の責務であり、request と混在させると関心分離が崩れる。

### Alternative 4: 各 call site で `config.github?.enabled !== false` を直接書く（D2 の代替）

- **Pros**: 新規ファイルを追加しない。既存の参照を最小変更で書き換えられる。
- **Cons**: 判定の言い換え（`!== false` / `=== false` / `?? true`）が散在する。config 解釈（未指定 = 有効）と state 解釈（`githubIntegration` 不在 = 有効）が異なる 2 つのルールが混在し、一方だけ変えたときに齟齬が生じる。
- **Why not**: `resolveGitHubIntegrationConfig` と `getGitHubIntegration` の 2 関数に集約することで、legacy 解釈と config 解釈のルールが 1 箇所に閉じ、B-19 の grep 検査で境界を守れる。

### Alternative 5: no-op `GitHubClient` 実装を注入して型を非 null に保つ（D3 の代替）

- **Pros**: `githubClient` の型シグネチャが変わらず、既存 consumer を書き換えなくてよい。
- **Cons**: 「呼ばない」ことを型で保証できない。誤って呼んだときに初めて（実行時に）壊れる。silent な誤呼び出しが型検査をすり抜ける。
- **Why not**: `githubClient: GitHubClient | null` にして consumer 側で明示的に扱う方が fail-loud。型エラーが出る箇所がそのまま「GitHub 専用の境界」になり、`requireGitHubRepository` funnel への誘導が機械的に行われる。

### Alternative 6: 汎用 `ForgeProvider` port を新設して GitHub / none を実装で切り替える（D3 の代替）

- **Pros**: 将来 GitLab MR 等の multi-forge 対応を見込んだ抽象化になる。
- **Cons**: 現在使われない抽象が増え、multi-forge 対応と誤解を招く。request.md の Non-goals に「GitLab MR 等 multi-forge API 対応は行わない」と明記されている。B-1（core ↛ adapters）を守りながら port を汎用化すると adapter 層の設計が複雑化する。
- **Why not**: 「汎用の巨大な GitProvider や runtime facade を新設しない」という設計要求と相反する。必要になったときに適切な抽象を設ける方が YAGNI に適合する。

### Alternative 7: `getOriginInfo` の host 制約だけ外す（D4 の代替）

- **Pros**: `remote.ts` の変更が最小限で済み、既存の error code / テストを壊さない。
- **Cons**: token 解決を残したまま host 制約を外すと、非 GitHub origin（例: GitLab / Gitea の HTTPS）へ GitHub token を HTTPS extraheader として注入し得る。token 漏洩のリスクが生じる。
- **Why not**: request.md が「host 制約だけ外して既存 token 解決を残してはならない」と明示している。transport auth と origin 解析は host 制約と token 解決が束縛された設計であり、片方だけ外すと安全契約が崩れる。

### Alternative 8: `owner` / `name` を必須のまま空文字列 sentinel にする（D5 の代替）

- **Pros**: 型変更の波及がなく、既存 consumer を書き換えなくてよい。schema の backward compatibility が完全。
- **Cons**: 型上は "ある" ので consumer が無検査で GitHub API に渡せる。空 owner で GitHub API を叩く事故を型が検出できない。sentinel 値と実在する owner の区別がコード上で消える。
- **Why not**: request.md が「架空の owner/name を埋めて済ませてはならない」と明示している。optional 化により型エラーが出る箇所がそのまま「GitHub 専用の境界」を示す、という積極的な利点もある。

### Alternative 9: `RepositoryInfo` を discriminated union にする（D5 の代替）

- **Pros**: `kind: "github" | "git"` により型安全な分岐が構造的に保証される。「GitHub 用か否か」が宣言的に読める。
- **Cons**: 既存 state JSON に `kind` フィールドがないため、読み取り時の正規化（discriminator 付与）が全 consumer に波及する。additive な optional 拡張より互換コストが大幅に高い。既存 state ファイルの migration が必要になる。
- **Why not**: state / config ともに「additive な optional フィールドのみ追加し migration は行わない」というマイグレーション方針（Migration Plan）と相反する。legacy state の backward compatibility を壊さずに optional 化できる。

### Alternative 10: `standard-nogithub` / `fast-nogithub` pipeline id を追加する（D6 の代替）

- **Pros**: 既存 pipeline descriptor を変更せず並列に管理できる。新 profile が明示的で分かりやすい。
- **Cons**: 「GitHub APIを呼ばないためだけに別の弱い pipeline を作らない」という設計要求に反する。profile が 2 倍に増え、registry / config effective / prompts / resume の step 名空間が複雑になる。
- **Why not**: descriptor をデータとして変換する `applyGitHubIntegration` の方が最小変更でプロファイル名空間を汚染しない。`applyScopeConfig` が同じパターンの前例を作っており、整合性がある。

### Alternative 11: `PrCreateStep` に `skipWhen` を持たせて "skipped" verdict を返す（D6 の代替）

- **Pros**: descriptor 構造を変えずに step を省略できる。`--from pr-create` の候補名は残る。
- **Cons**: step が実行（エントリ）され state に "skipped" の記録が残るため、「PR 作成 step を通った」ように見える。挙動と表示が乖離する。
- **Why not**: descriptor から `pr-create` を除去する方が honest であり、「存在しない PR のレコードを捏造しない」という設計要求とも整合する。`--from pr-create` の明示指定は実行前の usage エラーで拒否することで同等の安全性を確保できる。

### Alternative 12: `applyGitHubIntegration` の入力を `deps.config` にする（D6 の代替）

- **Pros**: config から直接読めるためシンプルで、job state のフィールドを参照するコードが減る。
- **Cons**: config を後から変えると実行中 job の終端が変わる。D1 の「config 変更で既存 job を暗黙に別モードへ移行しない」という不変性を破る。
- **Why not**: D1 の核心は「job state に凍結した契約が権威」であり、pipeline の終端選択もその契約に従う必要がある。config を変えると resume 中の job の挙動が変わるという安全上の問題が生じる。

## Consequences

### Positive

- GitHub credential なし・GitHub API 到達不可・非 GitHub origin の環境で、SpecRunner の全 job lifecycle（start / resume / reopen / attach / archive）が成立する。
- Git の保証（専用 worktree・step commit/push・commit OID への verification/review binding・egress 検査・checkpoint 検証）は完全に維持される。
- 既存の GitHub 有効 job の挙動と安全確認は変わらない。既存 state ファイルの migration は不要（additive optional のみ）。
- B-19 の grep 検査により、将来の GitHub 専用 command が暗黙に GitHub 無効 job に届かない境界が機械的に保証される。
- `resolveGitHubToken` / `createGitHubClient` の call site が D3 の 2 モジュールに収束し、token 注入経路の管理が簡潔になる。

### Negative

- `GitHubClient | null` の変更により、既存の非 null 前提 consumer が型エラーを出す。影響は `requireGitHubRepository` funnel で制御されるが、変更箇所は広範囲（`state.repository.owner|name` の非 test 参照 6 件以上）。
- attestation.md の生成を `commitFinalState` の seam に相乗りさせるため、この seam の責務が若干増える（warn-only で terminal 遷移を止めないことで影響を限定）。

### Known Debt / Deferred

- attestation.md を GitHub 有効 job でも常時生成するか（証跡形式の統一 vs 既存成果物の不変）は別 Issue の判断に委ねる。
- `RunResultContract` の `schemaVersion` は 1 のまま据え置く。additive 拡張が累積した場合のバージョン戦略は別途検討する。
- 複数 remote・origin 差し替え時の identity 更新ポリシーは初期範囲外（origin 固定）。
- managed runtime の GitHub 非依存化は初期範囲外（不適合を事前通知するのみ）。

## References

- Request: `specrunner/changes/optional-github-integration/request.md`
- Design: `specrunner/changes/optional-github-integration/design.md`
- Spec: `specrunner/changes/optional-github-integration/spec.md`
- Related: `specrunner/adr/2026-06-04-pipeline-descriptor-registry.md`（PipelineDescriptor 変換の前例）
- Related: `specrunner/adr/2026-06-01-runtime-sdk-to-adapter.md`（B-1 core ↛ adapters の確立）
- Related: `specrunner/adr/2026-06-01-arch-invariant-enforcement-vitest-ratchet.md`（B-* 歯の追加手順）
- Related: `specrunner/adr/2026-06-06-run-result-contract-json.md`（RunResultContract の additive 拡張方針）
- Reverted: #1115 / #1122 — Git 不要化まで拡張した誤った先行実装（本 ADR はこれを再導入しない）
