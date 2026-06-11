# Design: カスタムレビューワーの起動条件を宣言的に指定できるようにする

## Context

カスタムレビューワー（#622, `specrunner/changes/archive/2026-06-11-custom-reviewers/`）は `specrunner/reviewers/<name>.md` を宣言として load → validate → job state へ snapshot し、`composeReviewerDescriptor`（`compose-reviewers.ts`）が code-review の後・conformance の前に直列の judge step として挿入する。現状すべての reviewer は **全 job で無条件に起動**する。観点が無関係な変更（認証コードに触れない diff へのセキュリティ監査、bug-fix への重量レンズ）でも時間と token を消費する。

起動可否を LLM に委ねず、観測可能な事実（変更ファイル一覧・request type）から CLI が決定論で判定する宣言的ゲートを導入する。

### 現状コードの前提（観測点と硬直点）

- **reviewer frontmatter / validation は #622 で着地済**: `parseReviewerDefinition`（`reviewers/definition.ts`）が frontmatter（`name` / `maxIterations` / `model?`）+ 必須セクション（目的 / 観点 / 判定基準）+ 自由欄をパースし、`validateReviewerDefinitions`（`reviewers/validate.ts`）が load-time で違反を収集 → throw する。frontmatter parser は現状 **`key: value` 単一行のみ**対応（配列非対応）。
- **snapshot 経路**: `PipelineRunCommand.prepare`（`pipeline-run.ts:78-98`）が `loadReviewerDefinitions` → `validateReviewerDefinitions` → `reviewerDefs.map(({filename, ...rest}) => rest)` で `ReviewerSnapshot[]` に変換し `jobState.reviewers` に載せる。snapshot（`kernel/reviewer-snapshot.ts`）は state に永続化され、resume は snapshot をそのまま使う。
- **step 合成**: `createCustomReviewerStep(snapshot)`（`custom-reviewer.ts`）が judge step（`reportTool === JUDGE_REPORT_TOOL` singleton、`gitWrite: true`）を生成。`composeReviewerDescriptor` が chain・transitions・`maxIterationsByStep` を派生する。
- **transition は純関数生成**: `buildReviewerChainTransitions(chain)`（`reviewer-chain.ts:122`）が各 reviewer の `approved` / `needs-fix` 行と code-fixer 戻り行をデータとして生成する。pipeline は `getStepOutcome`（最新 StepRun の verdict）→ `(step, on, when)` で次 step を引く（`pipeline.ts:295`）。
- **変更ファイルの観測経路（staleness 注意）**: code-review / custom-reviewer は `deps.dynamicContext.diffStat`（`--stat`）を初期メッセージに注入する（`code-review.ts:65` / `custom-reviewer.ts:44`）。ただし `dynamicContext` は **run 開始時に 1 回だけ収集**される（`runner.ts:170-176` "once per run, not per-step"）。これは implementer が走る**前**であり、reviewer 実行時点の変更ファイル一覧としては **stale**。よって起動ゲートは `dynamicContext` を流用できず、reviewer 実行時点で fresh に観測する必要がある。
- **runtime-neutral な git 観測 seam が既存**: `RuntimeStrategy` に `captureHeadSha` / `verifyFindingRefs` / `digestArtifacts` 等の seam があり、local は git / fs、managed は GitHub API で実装する（`runtime/local.ts` / `runtime/managed.ts`）。変更ファイル観測も同じ seam パターンに乗せる。
- **request type 別解決の前例**: step-config の `byRequestType`（`config/step-config.ts:71`）。type を判定材料にする前例として参照する（本変更はこの機構自体は使わない）。
- **scaffold の前例**: `executeRulesNew`（`command/rules-new.ts`）が embedded template から `specrunner/rules/<step>/<NN>-<slug>.md` を生成する。`reviewers new` はこれと同型。

### 制約（request / architect 評価済み）

- 起動判定は **agent ではなく CLI の決定論**に置く。「どの観点でレビューしたか」は説明責任を伴う判断であり非決定にしない。
- 条件は md にコミットされる宣言とし、起動ポリシーの変更自体を PR でレビュー可能にする（CODEOWNERS / GitHub Actions の `paths` と同じ語彙）。
- **skip ≠ approved** を state に固定する。「そもそも見ていない観点」と「見て通った観点」の区別を lineage に残す。
- 条件無指定 reviewer・reviewers/ 不存在の挙動は現行と完全一致（opt-in）。

## Goals / Non-Goals

**Goals**:

- reviewer frontmatter に任意の `paths`（glob 配列）/ `requestTypes`（配列）を宣言できる。無指定は制約なし。
- 起動判定を CLI 決定論の純関数で行う（paths = 変更ファイル一覧との glob 照合、requestTypes = request type 一致、LLM 不使用）。
- 不一致の reviewer は agent を起動せず skip し、`approved` と区別された verdict `skipped` + 理由として state / journal に記録する。
- 変更ファイル一覧を reviewer 実行時点で fresh に観測する runtime-neutral seam を追加する。
- `specrunner reviewers new <name>` scaffold を追加する（`rules new` と同型、#622 の load-time validation を通る雛形）。
- 条件無指定 reviewer・reviewers/ 不存在の構成・挙動・出力を現行と完全一致させる。

**Non-Goals**（request スコープ外）:

- LLM による起動判定（router agent）。
- diff 行数などサイズ閾値による条件。
- reviewer 間の依存・順序条件。
- 起動条件以外の reviewer 機能拡張（#622 の judge 契約はそのまま）。

## Decisions

### D1: 起動条件を frontmatter の宣言として表現する

`specrunner/reviewers/<name>.md` の frontmatter に任意キー `paths`（glob 文字列配列）と `requestTypes`（request type 文字列配列）を追加する。どちらも任意で、field 不在 = その条件は制約なし、両方不在 = 常時起動。parser（`definition.ts`）を inline flow（`paths: [a, b]`）と block sequence（`- item` インデント行）の 2 記法に対応させる。スカラ key（name / maxIterations / model）の既存挙動は不変。

- **Rationale**: 条件を md にコミットさせることで、起動ポリシーの変更自体が PR diff としてレビュー可能になる（CODEOWNERS / GitHub Actions の `paths` と同じ運用モデル）。既存の reviewer 宣言ファイルに自然に同居でき、別ファイル・別 DSL を増やさない。
- **Alternatives considered**: (a) `.specrunner/config.json` に reviewer 名 → 条件のマップを置く案 — 宣言（観点）と条件（起動ポリシー）が別ファイルに分離し、reviewer 追加時に 2 箇所編集が必要になり乖離する。(b) ファイル名規約（`security.src-auth.md` 等）で条件を表す案 — 表現力が低く glob を表せない。

### D2: 起動判定を CLI 決定論の純関数に置く

`src/core/reviewers/activation.ts` に `evaluateActivation(cond, facts): ActivationDecision` を新設する。facts = `{ changedFiles: string[]; requestType: string }`。判定は **AND セマンティクス**（宣言された条件をすべて満たすときのみ起動）。requestTypes は `facts.requestType ∈ requestTypes`、paths は changedFiles の少なくとも 1 件が paths の少なくとも 1 glob にマッチ。評価順は requestTypes → paths（cheap → costly）で、最初に失敗した条件を skip 理由に採用する。両条件不在なら起動。純関数で I/O・LLM を含まない。

- **Rationale**: 「どの観点でレビューしたか」は説明責任を伴う判断であり非決定にしない（architect 評価済み）。純関数化で判定が完全に再現可能・テスト容易になり、観測（git）と判定（pure）を分離できる。AND は GitHub Actions の複数フィルタと同じ直感に合う。
- **Alternatives considered**: (a) router agent に起動可否を LLM 判定させる案 — request スコープ外。非決定で監査不能。(b) OR セマンティクス — 「auth に触れた **かつ** new-feature のとき」のような絞り込みを表現できず、過剰起動側に倒れる。

### D3: glob マッチャを最小依存で自前実装する

`src/core/reviewers/glob-match.ts` に `matchGlob(pattern, filePath): boolean` を自前実装する。サポートは `**`（`/` を跨ぐ 0 個以上のセグメント）/ `*`（`/` を跨がない）/ `?`（`/` 以外 1 文字）/ リテラル。glob を RegExp へ変換し全体一致で判定する純関数。入力 `filePath` は repo-relative・先頭スラッシュなし（`git diff --name-only` 出力に一致）。

- **Rationale**: 依存は claude-agent-sdk / anthropic-sdk / codex-sdk / zod のみで glob ライブラリは無い。Minimal-deps North Star（install してすぐ使える）を守るため、必要十分な部分集合を 1 ファイルで実装する。
- **Alternatives considered**: (a) `minimatch` / `picomatch` を追加 — 依存が増え North Star に反する。(b) `git diff` の pathspec globbing に委譲 — gitignore 風セマンティクスで CODEOWNERS / Actions の語彙と微妙にずれ、判定が CLI 純関数の外に漏れてテストしにくい。

### D4: 変更ファイル観測を runtime-neutral seam で fresh に行う

`RuntimeStrategy` に `listChangedFiles(baseBranch, cwd, branch): Promise<string[]>` を追加する。戻り値は repo-relative の変更ファイルパス配列で、**throw しない**（失敗時 `[]`）。local は `git diff --name-only <baseBranch>...HEAD`（three-dot = merge-base 差分 = PR が変えた file 集合）を `spawnFn` で実行。managed は `[]`（custom reviewer は managed の dynamic agent 登録ギャップ #622 T-15 で機能しないため、paths 条件を持つ reviewer は managed で常に skip 側に倒れる fail-safe）。`baseBranch` は `deps.request.baseBranch`（不在時 `"main"`）。観測は `activation.paths` を持つ reviewer のときだけ実行する。

- **Rationale**: `deps.dynamicContext` は implementer 実行前に 1 回収集され reviewer 実行時点では stale（Context 参照）。決定論判定には reviewer 実行時点の HEAD に対する fresh な観測が要る。既存の git 観測 seam（`captureHeadSha` 等）と同じ runtime-neutral パターンに乗せれば executor は runtime 非依存のまま保てる。
- **Alternatives considered**: (a) `dynamicContext` に `changedFiles` を足して流用 — stale データで誤判定する。(b) executor 内で `node:child_process` を直叩き — managed で git が無く破綻し、executor が runtime 依存になる。

### D5: 起動ゲートを executor（behavior 層）に置き、skip を専用 finalize で記録する

`AgentStep` に `activation?: ReviewerActivation` を足し、`runAgentStep`（`executor.ts:161`）冒頭の `store.update({step})` + `appendHistory(started)` 直後・重い pre-step 処理（rules 解決 / `prepareStepArtifacts` / `runner.run`）の前にゲートを評価する。`activation` を持つ step で paths があれば `listChangedFiles` を観測し `evaluateActivation` を呼ぶ。不一致なら `finalizeSkippedStep` が agent を起動せず・commit/push せず・template を置かず、`verdict: "skipped"` + `skipReason` の StepRun を push し、`<name>-skipped`（warning）history を append して return する。

- **Rationale**: executor は既に `captureHeadSha` / `validateRequiredInputs` 等の pre-step seam を持つ behavior 層であり、ゲートの自然な置き場所。state machine（pipeline.ts）や compose 時に置くと、変更ファイルが未確定（impl 前）になり決定論が崩れる。step を「データ」、ゲート評価と skip 記録を「executor の振る舞い」に保つ（Step as data / Executor as behavior）。
- **Alternatives considered**: (a) `composeReviewerDescriptor` で skip 対象を chain から除外 — compose は job start 時（impl 前）で paths を観測できず、かつ skip が state に残らない（受け入れ #4 を満たせない）。(b) reviewer agent に「対象外なら即 approve」と指示 — 非決定で skip ≠ approved を保てず、agent を無駄に起動する。

### D6: skip を `verdict: "skipped"` + `skipReason` として state / journal に固定する

`Verdict` union に `"skipped"` を、`StepOutcome` に `skipReason?: string` を追加する。skip は `state.steps[<reviewer>]` に該当 StepRun として残り、`persist` 経由で `events.jsonl` の `step-attempt` record に反映される。理由は同じ outcome に co-locate し fold で保持する。threading 対象は `StepResultInput` + `pushStepResult`（`state/helpers.ts`）、`StepAttemptRecord.outcome` + `stepRunToRecord` + `fold`（`event-journal.ts`）で、いずれも `toolResult` / `followUpAttempts` と同じ条件 spread パターンに従う。`ReviewerActivation` 型は `kernel/reviewer-snapshot.ts` に置き、port の `AgentStep` と core の `activation.ts` の双方から core→kernel 方向で import できるようにする。

- **Rationale**: 「そもそも見ていない観点」と「見て通った観点」の区別を lineage に固定する（architect 評価済み）。専用 verdict 値にすることで transition と表示の双方が approved と機械的に区別でき、理由を verdict と同じレコードに持たせれば journal だけで監査が完結する。
- **Alternatives considered**: (a) 理由を `error` field に入れる — skip は失敗ではなく、`status: failed` 系の扱いに巻き込まれ意味がずれる。(b) `approved` + フラグで skip を表す — approved と混同し受け入れ #4「区別された状態」を満たせない。

### D7: skip の transition を「次の reviewer / conformance へ」に配線する

`buildReviewerChainTransitions(chain)` に各 reviewer の `{ step: reviewer, on: "skipped", to: nextAfterReviewer(reviewer, chain) }` を追加する。skip は次の reviewer（or conformance）へ進み、**code-fixer には決して行かない**。chain[0] の code-review も skip 行を持つが activation を持たないため発火しない（無害・uniform）。pipeline.ts の loop bookkeeping（exit historyStatus / 自己 exhaustion / 次 loop exhaustion / episode reset）は `skipped` でも false exhaustion を誘発しないことを確認し、変更しない。

- **Rationale**: skip は「収束対象ではない」ため fixer ループに乗せてはいけない。transition をデータとして生成する既存設計に沿って 1 行追加するだけで、全 reviewer に uniform に適用できる。
- **Alternatives considered**: (a) skip を pipeline.ts の特別分岐でハンドル — transition table 駆動の設計を崩し、`code-review` リテラル除去（#622）で得た一般性を後退させる。

### D8: 条件を snapshot にキャリーし、無条件 reviewer は opt-in で完全一致させる

`ReviewerSnapshot`（kernel）と `ReviewerDefinition`（`reviewers/types.ts`）に `paths?` / `requestTypes?` を追加する。`pipeline-run.ts` の `map(({filename, ...rest}) => rest)` は全 field を spread するため型追加だけで条件が snapshot へ自動キャリーされ、resume も snapshot 由来で安定する。`createCustomReviewerStep` は snapshot の paths/requestTypes から `activation` を組み立てるが、**両方不在なら `activation` を付けない** → executor ゲートを通らず現行と完全一致。`validateJobState` の reviewers 検証に「present 時 paths/requestTypes は配列」の軽い検査を足す（absence は OK）。

- **Rationale**: snapshot 不変条件（#622: pipeline shape は job start で固定、resume は snapshot 参照）をそのまま継承し、条件も job 中安定にする。`activation` を未付与にすることで「条件を持たない reviewer の挙動は現行と完全一致」（受け入れ #3）をコード経路レベルで保証する。
- **Alternatives considered**: (a) 条件を毎 step ディスクから再ロード — resume 中にファイルが変わると pipeline shape が揺れ、#622 の snapshot 不変条件に反する。

### D9: `reviewers new <name>` scaffold を `rules new` と同型で追加する

`src/core/command/reviewers-new.ts` を `rules-new.ts` と同型で実装し、`cli/command-registry.ts` に `reviewers new`（positional `<name>`）を登録する。`<name>` を `validate.ts` の `NAME_PATTERN`（`/^[a-z0-9][a-z0-9\-_]*$/`）で検証（違反 exit 2）、出力先 `specrunner/reviewers/<name>.md`、既存衝突は exit 1。embedded template（source const）は #622 の load-time validation を**通る**最小雛形（frontmatter `name` / `maxIterations: 3` + 必須セクション 目的 / 観点 / 判定基準 + 起動条件のコメントアウト例）を書き出す。

- **Rationale**: `rules new` で確立した「CLI が雛形を配るが中身は解釈しない」モデルを踏襲し、利用者が validation を即通せる出発点を得る（受け入れ #5）。デフォルト出力は条件無指定＝常時起動で安全側。
- **Alternatives considered**: (a) 雛形にダミーの paths/requestTypes を有効値で埋める — 利用者が消し忘れると意図しない skip を招くため、コメントアウト例に留める。

## Risks / Trade-offs

- [managed runtime で paths 条件が常に skip 側に倒れる] → custom reviewer は #622 既知制約（T-15）で managed 非対応。`listChangedFiles` managed 実装は `[]` を返す fail-safe とし、本変更は local + mock pipeline を対象とする。既知制約として design / コメントに残す。
- [glob 語彙が CODEOWNERS / Actions と完全互換でない] → `**` / `*` / `?` の共通部分集合をサポートし、否定 `!` 等は非対応。scaffold コメントと design で対応範囲を明示する。
- [空配列 `paths: []` / `requestTypes: []` が「何にもマッチしない」と紛らわしい] → validation で「present 時は非空配列」を要求しエラーにする（D8 検査の一部）。
- [stale な dynamicContext との混同] → ゲートは `dynamicContext` を一切使わず常に fresh seam（D4）で観測する。reviewer 初期メッセージの diffStat 注入は従来どおり（agent 自身も `git diff` を再実行する）。
- [skip step が loop 進捗 `[iter N/M]` を 1 回出す] → custom reviewer は loop step のため skip でも iteration:start を 1 度 emit する。挙動上は無害（exhaustion を誘発しない）であり、観測ログとして「考慮したが skip した」記録になる利点を優先する。

## Open Questions

- managed 向けに将来 `listChangedFiles` を GitHub compare API で実装するか（現状は `[]` の fail-safe で十分。custom reviewer の managed 対応自体が未着手のため後続に委ねる）。
- request type の妥当値を validation で照合するか（現状は非空文字列のみ検査。type は new-feature / spec-change / bug-fix 等で開かれており、過剰制約を避けて非空のみとする）。
