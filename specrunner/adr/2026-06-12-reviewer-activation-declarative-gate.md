# ADR-20260612: reviewer 起動条件を宣言的ゲートとして frontmatter に置き CLI 決定論で評価する

**Date**: 2026-06-12
**Status**: accepted

## Context

カスタムレビューワー（ADR-20260611）は全 job で無条件に起動する設計で着地した。これにより、観点が無関係な変更（認証コードに触れない diff へのセキュリティ監査、bug-fix への重量レンズ）でも時間と token を消費する問題が生じる。

起動するかどうかの判断をどこに置くかは、以下の 2 つの軸で選択肢が分かれる。

- **判定主体**: LLM（router agent）vs CLI 決定論
- **条件の置き場所**: 設定ファイル / ファイル名規約 / md frontmatter にコミット

「どの観点でレビューしたか」はリポジトリの説明責任を伴う情報であり、LLM の非決定的な判断で決まってはならない。また「条件自体を PR でレビューできること」は CODEOWNERS / GitHub Actions の paths と同じ運用モデルである。

既存コードの観測点：
- code-review は CLI が事前計算した diff stat を初期メッセージ注入で受け取る（`code-review.ts:65`）— 変更ファイルの観測経路は CLI 側に既存
- `dynamicContext` は run 開始時に 1 回だけ収集（`runner.ts:170-176`）— reviewer 実行時点では stale であり判定に流用できない
- `RuntimeStrategy` に `captureHeadSha` / `verifyFindingRefs` 等の runtime-neutral seam が既存
- `buildReviewerChainTransitions` が reviewer chain の遷移をデータとして生成する純関数設計（ADR-20260611 D4）

## Decision

### D1: 起動条件を reviewer frontmatter の宣言として表現する

`specrunner/reviewers/<name>.md` の frontmatter に任意キー `paths`（glob 文字列配列）と `requestTypes`（request type 文字列配列）を追加する。inline flow（`paths: [a, b]`）と block sequence（`- item`）の 2 記法を受け付ける。field 不在はその条件を制約なしとして扱い、両方不在は常時起動。

条件を md にコミットさせることで、起動ポリシーの変更自体が PR diff としてレビュー可能になる（CODEOWNERS / GitHub Actions の `paths` と同じ運用モデル）。

### D2: 起動判定を CLI 決定論の純関数に置く

`src/core/reviewers/activation.ts` に `evaluateActivation(cond, facts): ActivationDecision` を新設する。`facts = { changedFiles: string[]; requestType: string }`。

- **AND セマンティクス**: 宣言された条件をすべて満たすときのみ起動
- `requestTypes`: `facts.requestType ∈ requestTypes` で一致判定
- `paths`: changedFiles の少なくとも 1 件が paths の少なくとも 1 glob にマッチ
- **評価順**: requestTypes → paths（cheap → costly）。最初に失敗した条件を skip 理由に採用
- I/O・LLM を含まない純関数

「どの観点でレビューしたか」は説明責任を伴う判断であり非決定にしない（architect 評価済み）。

### D3: glob マッチャを最小依存で自前実装する

`src/core/reviewers/glob-match.ts` に `matchGlob(pattern, filePath): boolean` を自前実装する。サポートは `**`（`/` を跨ぐ 0 個以上のセグメント）/ `*`（`/` を跨がない）/ `?`（`/` 以外 1 文字）/ リテラル。glob を RegExp へ変換し全体一致で判定する純関数。入力 `filePath` は repo-relative・先頭スラッシュなし（`git diff --name-only` 出力に一致）。

依存は claude-agent-sdk / anthropic-sdk / zod のみで glob ライブラリは無い（Minimal-deps North Star）。必要十分な部分集合を 1 ファイルで実装する。

### D4: 変更ファイル観測を runtime-neutral seam で fresh に行う

`RuntimeStrategy` に `listChangedFiles(baseBranch, cwd, branch): Promise<string[]>` を追加する。throw しない（失敗時 `[]`）。

- **local**: `git diff --name-only <baseBranch>...HEAD`（three-dot = merge-base 差分）を `spawnFn` で実行
- **managed**: `[]`（custom reviewer は managed 非対応の既知制約 T-15 により、paths 条件を持つ reviewer は managed で常に skip 側に倒れる fail-safe）
- 観測は `activation.paths` を持つ reviewer のときだけ実行する

`dynamicContext` は implementer 実行前に 1 回収集され reviewer 実行時点では stale のため、ゲート判定には reviewer 実行時点の HEAD に対する fresh な観測が必要。

### D5: 起動ゲートを executor（behavior 層）に置き、skip を専用 finalize で記録する

`AgentStep` に `activation?: ReviewerActivation` を足し、`runAgentStep`（`executor.ts`）冒頭の `store.update + appendHistory(started)` 直後・重い pre-step 処理（`prepareStepArtifacts` / `runner.run`）の前にゲートを評価する。

不一致なら `finalizeSkippedStep` が agent を起動せず・commit/push せず・template を置かず、`verdict: "skipped"` + `skipReason` の StepRun を push して return する。`activation` 未付与の step はゲートを通らず既存経路をそのまま通る。

executor は既に `captureHeadSha` / `validateRequiredInputs` 等の pre-step seam を持つ behavior 層であり、ゲートの自然な置き場所。step をデータ、ゲート評価と skip 記録を executor の振る舞いに保つ。

### D6: skip を `verdict: "skipped"` + `skipReason` として state / journal に固定する

`Verdict` union に `"skipped"` を、`StepOutcome` に `skipReason?: string` を追加する。skip は `state.steps[<reviewer>]` に StepRun として残り、`events.jsonl` の `step-attempt` record に反映される。

「そもそも見ていない観点」と「見て通った観点」の区別を lineage に固定する（architect 評価済み）。専用 verdict 値にすることで transition と表示の双方が `approved` と機械的に区別できる。

### D7: skip の transition を次の reviewer / conformance に配線する

`buildReviewerChainTransitions(chain)` に各 reviewer の `{ step: reviewer, on: "skipped", to: nextAfterReviewer(reviewer, chain) }` を追加する。skip は次の reviewer（または conformance）へ進み、**code-fixer には決して行かない**。

skip は「収束対象ではない」ため fixer ループに乗せてはいけない。transition をデータとして生成する既存設計に沿って 1 行追加するだけで、全 reviewer に uniform に適用できる。

### D8: 条件を snapshot にキャリーし、無条件 reviewer は opt-in で完全一致させる

`ReviewerSnapshot` と `ReviewerDefinition` に `paths?` / `requestTypes?` を追加する。`createCustomReviewerStep` は snapshot の paths/requestTypes から `activation` を組み立てるが、**両方不在なら `activation` を付けない** → executor ゲートを通らず現行と完全一致。

条件も job 中安定にする（snapshot 不変条件、ADR-20260611 D7 継承）。`activation` 未付与でコード経路レベルで現行完全一致を保証する。

### D9: `reviewers new <name>` scaffold を `rules new` と同型で追加する

`src/core/command/reviewers-new.ts` を実装し `cli/command-registry.ts` に `reviewers new`（positional `<name>`）を登録する。embedded template は #622 の load-time validation を通る最小雛形（frontmatter `name` / `maxIterations: 3` + 必須セクション + 起動条件のコメントアウト例）を書き出す。デフォルト出力は条件無指定＝常時起動で安全側。

## Alternatives Considered

### Alt-A: LLM（router agent）に起動可否を判定させる

- **Pros**: 自然言語の変更概要から文脈的に判断できる
- **Cons**: 非決定的で監査不能。「どの観点でレビューしたか」が LLM の気分次第になる。request スコープ外
- **Why not**: 説明責任を伴う判断は決定論に置く（architect 評価済み）

### Alt-B: 起動条件を `.specrunner/config.json` に置く

- **Pros**: reviewer 定義と条件を分離して管理できる
- **Cons**: reviewer 追加時に 2 箇所編集が必要で乖離しやすい。PR diff で条件変更を確認しにくい
- **Why not**: 宣言（観点）と条件（起動ポリシー）を同じファイルに同居させることで 1 PR で完結する

### Alt-C: ファイル名規約（`security.src-auth.md` 等）で条件を表す

- **Pros**: frontmatter パーサの拡張が不要
- **Cons**: glob を表せない。表現力が低い。ファイル名が肥大する
- **Why not**: frontmatter 配列が必要十分な表現力を持ち、既存 md 構造に自然に同居できる

### Alt-D: `dynamicContext` に `changedFiles` を足して流用する

- **Pros**: 既存観測経路を再利用できる
- **Cons**: `dynamicContext` は implementer 実行前に収集されるため reviewer 実行時点では stale。誤判定する
- **Why not**: runtime-neutral seam（D4）で fresh に観測する必要がある

### Alt-E: `composeReviewerDescriptor` で skip 対象を chain から除外する

- **Pros**: executor を変更しなくて済む
- **Cons**: compose は job start 時（impl 前）で変更ファイルを観測できない。skip が state に残らない（skip ≠ approved を保てない）
- **Why not**: executor 配置（D5）でのみ「reviewer 実行時点の変更ファイル観測 + skip 記録」を両立できる

### Alt-F: skip を `approved` + フラグで表す

- **Pros**: Verdict union を増やさない
- **Cons**: approved と混同し「そもそも見ていない観点」と「見て通った観点」の区別が機械的に保てない
- **Why not**: 専用 verdict 値（D6）で区別をコード経路レベルで保証する

### Alt-G: OR セマンティクスで条件を評価する

- **Pros**: 条件の一つでも満たせば起動でき、粗い設定で済む
- **Cons**: 「auth に触れた かつ new-feature のとき」という絞り込みを表現できず、過剰起動側に倒れる
- **Why not**: AND（GitHub Actions の複数フィルタと同じ直感）が宣言の意図と一致する

### Alt-H: `minimatch` / `picomatch` を追加する

- **Pros**: glob 仕様の完全カバーと枯れた実装
- **Cons**: 依存が増え Minimal-deps North Star（install してすぐ使える）に反する
- **Why not**: `**` / `*` / `?` / リテラルの共通部分集合で実用ユースケースを網羅できる。1 ファイル自前実装で十分

## Consequences

### Positive

- 起動ポリシーの変更が reviewer `.md` の PR diff として現れ、CODEOWNERS / Actions と同じ語彙でレビューできる
- `evaluateActivation` が純関数のため完全再現可能・ユニットテスト容易。判定ロジックを git で追跡できる
- `verdict: "skipped"` により「見た」「見ていない」の区別が `events.jsonl` で監査可能になる
- `activation` 未付与でコード経路を分岐させず、既存 reviewer の挙動を構造的に保証する
- glob マッチャが 1 ファイル完結で追加依存ゼロ

### Negative

- managed runtime で paths 条件を持つ reviewer は常に skip 側に倒れる（custom reviewer の managed 非対応 T-15 の既知制約）
- glob 語彙が CODEOWNERS / Actions と完全互換でない（否定 `!`・character class 等は非対応）
- `Verdict` union の `"skipped"` 追加により、verdict を switch している全 consumer が exhaustive check の対象になる

### Known Debt / Deferred

- managed 向けに `listChangedFiles` を GitHub compare API で実装するかは custom reviewer の managed 対応（T-15）と一体で後続 request に委ねる
- glob 否定パターン（`!` prefix）・character class（`[a-z]`）の対応は需要が生じた時点で追加する
- request type の妥当値を validation で照合するかは型の開放性（new-feature / spec-change / bug-fix 等）を優先して現状非空文字列のみ検査

## References

- Request: `specrunner/changes/reviewer-activation-conditions/request.md`
- Design: `specrunner/changes/reviewer-activation-conditions/design.md`
- Spec: `specrunner/changes/reviewer-activation-conditions/spec.md`
- Related: `specrunner/adr/2026-06-11-custom-reviewer-data-driven-extensibility.md`（カスタムレビューワー基盤）
- Related: `specrunner/adr/2026-06-04-pipeline-roles-neutral-engine.md`（pipeline neutral engine）
- Related: `specrunner/adr/2026-06-01-runtime-strategy-artifact-lifecycle.md`（RuntimeStrategy seam）
- Related: `specrunner/adr/2026-05-21-rules-md-cli-embed.md`（rules/ embedded template モデル）
