# Design: push 能力の宣言に基づく実 diff ベースの push 不能変更の検出・自己修正・escalation

## Context

GitHub Actions 上で spec-runner を実行するとき、ワークフローに払い出される `GITHUB_TOKEN`
(GitHub App installation token / `ghs_` prefix) は `.github/workflows/**` 配下のファイルを
push できない。これは権限スコープの設定漏れではなく、`permissions:` ブロックに `workflows`
スコープが存在しないという GitHub 側の恒久的制約である。

現状のパイプラインは、この制約を「push が remote に拒否された瞬間」にしか知ることができない。
implementer が数十分かけて実装・commit まで到達し、`pushOnly` が
`! [remote rejected] ... refusing to allow a GitHub App to create or update workflow` を
受け取って初めて失敗する (#1059 で実測、#1054 で発生)。失敗は
`COMMIT_AND_PUSH_FAILED` の `failed` halt になり、`notifyJobTerminal` は `failed` に対して
issue コメントを出さない (`src/core/notify/issue-notifier.ts`) ため、operator への
escalation も届かない。結果として「長時間待った末に、理由の分からない停止」になる。

2026-08-23 の方針改訂により、判定の権威は **push 直前の実 diff** に置く。request-review が
予測する `touchedFiles` は LLM の予測値であり、これでパイプラインを止めると偽陽性で
正当な作業まで停止させてしまう。予測値は「事前通知」にのみ使う。

関連する既存の設計上の足場:

- **出力契約シーム** — `OutputContract` / `OutputPolicy` (`"halt" | "follow-up"`) /
  `OutputVerificationPolicy`。adapter (`src/adapter/claude-code/agent-runner.ts`) が
  同一セッション resume で follow-up 修復ループを回し、その後 executor
  (`src/core/step/executor.ts`) の出力ゲートが再検証して halt する。
  **新しい step も新しいライフサイクル・アクションも増やさずに「1 回だけ follow-up →
  ダメなら停止」を実現できる唯一の既存経路**である。
- **commit 合成モデル** — `commitAndPush` は step 開始時の HEAD へ `git reset --mixed` して
  から staging → guard → commit → `runInlineEgressCheck` → `pushOnly` と進む。
  したがって「push で公開されるもの」を push 前に確定できるポイントが存在する。
- **halt 種別** — `StepHalt` は `"failed"` と `"awaiting-resume"` の 2 種。issue への
  escalation コメントと `resume --from-issue` は `awaiting-resume` のみが対象。
- **DSM 階層** — `src/util/` (leaf) → `src/git/` 等 (shared-kernel) → `src/core/port/` →
  `src/core/` (domain) → composition-root。`tests/unit/architecture/core-invariants.test.ts`
  が機械的に強制する。

制約として、本リクエスト自体が Actions 上でリモート実行できなければならない。つまり
**この変更の実装が `.github/workflows/**` を編集してはならない**。よって能力宣言は
ワークフロー YAML への環境変数追加ではなく、CLI 側の実行時検出で完結させる必要がある。

## Goals / Non-Goals

**Goals**:

- 実行環境が「push できないパスパターン」を宣言/検出できる仕組みを、`.github/workflows/`
  の編集なしに CLI 側だけで成立させる。
- 能力制約を request-review / implementer のコンテキストへ事前通知する。予測 `touchedFiles`
  との一致は通知のみで、パイプラインを停止させない。
- **Layer 1**: implementer セッションが生きている間に実 diff のパスを宣言パターンと突き合わせ、
  一致したら同一セッションへ follow-up を **ちょうど 1 回** 送る。解消すればそのまま
  commit/push へ進み、残っていれば escalation する。
- **Layer 2**: commit/push の直前に決定論的なバックストップを置く。一致パスが残っている場合は
  push を試行せず、パスと環境制約を理由に明記して escalation する。
- 宣言のない環境 (ローカル、workflows 権限を持つ PAT を使う環境) では挙動を一切変えない。

**Non-Goals**:

- workflows 権限を持つ PAT / GitHub App の導入・設定。本変更は「押せないものを早く正しく
  諦める」ためのものであり、押せるようにするものではない。
- 予測 `touchedFiles` によるパイプライン停止。予測は通知にのみ使う。
- 新しいパイプライン step / ライフサイクル・アクションの追加。
- push 拒否後の halt レコード保全 (別リクエスト `halt-checkpoint-restack` の担当)。
- パスパターン以外の能力宣言 (push サイズ上限、protected branch、必須レビューなど)。
- 拒否されたコミットの自動 revert / 自動 rebase。判断は operator に委ねる。

## Decisions

### D1: 能力宣言は shared-kernel の新モジュール `src/git/push-capability.ts` に置く

push 能力の型 (`PushCapability` — 宣言されたパスパターンの配列と、宣言の出所を示すラベル) と、
環境からの検出関数、パス照合関数をこの 1 モジュールに集約する。
照合は既存の `src/util/glob-match.ts` (`matchesGlob`) を再利用する。

- **Rationale**: この情報は「port の型 (`StepContext`)」「domain (`commit-push.ts`、各 step)」
  「composition-root (`core/runtime/*`, `core/command/runner.ts`)」の 3 層すべてから参照される。
  DSM 上、これら全部から import できるのは shared-kernel か leaf のみ。git transport の
  能力に関する知識であり `src/git/` (既に `transport-auth.ts` / `dynamic-context.ts` が
  git subprocess 知識を持つ) が意味的に最も自然。leaf (`src/util/`) に置くと git ドメイン知識が
  汎用ユーティリティ層に漏れる。
- **Alternatives considered**:
  - `src/core/port/` に置く → domain からは見えるが shared-kernel からは見えず、
    `src/git/` に置きたい検出ロジックと分断される。
  - `src/config/` に置く → 「設定から読む」前提になるが D2 の通り本件は実行時検出が主。
  - 各利用箇所で個別に判定 → 判定基準が 3 箇所に散り、テストの単一の真実がなくなる。

### D2: 宣言は「実行時検出」を第一とし、ワークフロー YAML の編集を要求しない

検出条件は AND で:
`GITHUB_ACTIONS === "true"` かつ `GH_TOKEN` が未設定/空 かつ 解決済みトークンが `ghs_` prefix。
この条件を満たすときのみ `.github/workflows/**` を「push 不能パターン」として宣言する。
それ以外 (ローカル実行、`GH_TOKEN` に PAT を入れている環境、`gh auth token` 由来の `gho_`/`ghp_`)
は **未宣言** = 現行挙動のまま。

- **Rationale**: 本リクエスト自体が Actions 上でリモート実行される必要があり、実装が
  `.github/workflows/specrunner-dispatch.yml` に env を足すと、その変更自体が push 拒否される
  (鶏卵問題)。CLI 側の検出だけで完結させればこの問題は起きない。`ghs_` prefix は
  GitHub App installation token の識別子であり、Actions の `GITHUB_TOKEN` を PAT 経由の
  実行から区別できる唯一の実行時シグナルである。判定に迷う場合は「未宣言」に倒す
  (fail-open) ことで、偽陽性による正当な作業の停止を避ける。押し損ねた場合は
  従来通り push 拒否で失敗するだけで、現状より悪くはならない。
- **Alternatives considered**:
  - ワークフローに `SPECRUNNER_UNPUSHABLE_PATHS` を追加する → 鶏卵問題。将来 workflows 権限
    のある環境から設定する道は D8 の Open Question として残す。
  - `gh api` でトークンのスコープを問い合わせる → ネットワーク往復が増え、installation token
    のスコープは `X-OAuth-Scopes` に出ないため確実性がない。
  - 常に `.github/workflows/**` を宣言する → ローカルで workflows を編集する正当な作業
    (本プロジェクト自身のワークフロー保守) を壊す。Non-Goal「未宣言環境で挙動不変」に反する。

### D3: 事前通知は純粋関数 + `StepContext` 経由で、`buildMessage` から差し込む

`PushCapability` を `StepContext` (= `StepDeps`) の任意フィールド `pushCapability?` として持たせ、
`src/core/command/runner.ts` の per-run 初期化 (`collectDynamicContext` を注入している箇所) で
1 回だけ解決する。通知文面は `src/git/push-capability.ts` の純粋関数
`renderPushCapabilityNotice(capability, predictedTouchedFiles?)` が生成し、
request-review と implementer の `buildMessage(state, deps)` が末尾に連結する。
予測 `touchedFiles` が一致した場合も文面が「事前警告」に変わるだけで、返り値・制御フローは変わらない。

- **Rationale**: `buildMessage` は純粋でなければならない (テスト容易性・再現性のため既存の
  規約)。I/O を伴う検出を per-run で 1 回だけ行い、結果を `deps` に載せる形なら純粋性を保てる。
  `dynamicContext` と同じ注入点・同じ寿命なので、既存の読み手にとって驚きがない。
  「予測は通知のみ」という方針が、型レベルで担保される (通知関数は文字列しか返さない)。
- **Alternatives considered**:
  - `DynamicContext` のフィールドとして相乗り → `DynamicContext` は「リポジトリの動的な状態」
    であって「実行環境の能力」ではない。意味論が混ざる。
  - 各 step が自分で環境変数を読む → `buildMessage` の純粋性を壊す。
  - request-review の出力スキーマに「push 可否」フィールドを足す → 予測値を構造化して
    保存することになり、「予測で止めない」方針から逸脱する誘惑を将来に残す。

### D4: 「push で公開されるパス」の列挙は共通ヘルパに 1 本化し、fail-closed で和を取る

`src/git/push-capability.ts` に、worktree の変更パス
(`git status --porcelain --untracked-files=all` 相当) と、未 push コミットのパス
(`git rev-list HEAD --not --remotes=origin` の各 OID に対する
`git diff-tree --no-commit-id --name-only -r <oid>`) の **和集合** を返すヘルパを置く。
Layer 1 / Layer 2 の両方がこの 1 本を使う。

- **Rationale**: GitHub は「push に含まれる *いずれかの* コミットが workflows に触れていれば」
  拒否する。後続コミットで revert しても拒否される。よって「HEAD の tree 差分」ではなく
  「未 push コミット群の和」を見る必要がある (fail-closed)。既存の
  `runInlineEgressCheck` が `git rev-list HEAD --not --remotes=origin` を使っており、
  「何が push されるか」の定義はこの式で既にリポジトリ内で確立している。
  Layer 1 と Layer 2 で列挙方法が食い違うと、Layer 1 が通したものを Layer 2 が落として
  「follow-up の意味がない」状態になるため、共通化は正しさの要件でもある。
- **Alternatives considered**:
  - `git diff <base>..HEAD --name-only` → base branch 選択に依存し、force-push や再 base 後に
    ずれる。また未コミットの worktree 変更を含まない。
  - `git push --dry-run` → ネットワーク往復が必要で、Layer 1 (セッション中) に使うには重い。
    さらに dry-run でも remote 側の pre-receive 判定を必ず再現するとは限らない。
  - コミット済みのみ / worktree のみを見る → Layer 1 の時点ではまだ commit されていない
    (commit 合成は step 終了後) ため worktree は必須。Layer 2 の時点では前 round の未 push
    コミットがあり得るため両方必要。

### D5: Layer 1 は新しい OutputContract kind `"unpushable-path"` として実装する

`OutputContractKind` に `"unpushable-path"` を追加し、implementer の `outputContracts()` が
`deps.pushCapability` にパターンがあるときだけ policy `"follow-up"` で 1 件返す。
検出は `LocalRuntime.validateStepOutputs` に kind 分岐を足して行う (`this.spawnFn` があるので
D4 のヘルパを呼べる)。`ManagedRuntime.validateStepOutputs` では `test-coverage` と同様に
明示的にスキップする (`!branch` の早期 continue **より前** に置く)。follow-up 文面は
`buildOutputFollowUpPrompt` に専用セクションを追加して生成する。

- **Rationale**: Non-Goal「新しい step / ライフサイクル・アクションを増やさない」を守りつつ
  「セッション生存中に 1 回だけ follow-up → 再チェック → ダメなら停止」を実現できるのは、
  この既存シームだけである。adapter の修復ループが同一セッション resume を、
  executor の出力ゲートが post-loop の再検証と halt を、それぞれ既に提供している。
  新規に書くのは「検出」と「文面」だけで済む。
- **Alternatives considered**:
  - implementer 内に独自の follow-up ループを書く → adapter が持つ session id 抽出・
    ターン計上 (`addedTurns.outputRepair`) を再実装することになり、二重管理になる。
  - 新しい step (`push-preflight`) を追加 → Non-Goal に真正面から反する。state / journal /
    resume point の追加も必要になり影響範囲が跳ね上がる。
  - policy を `"halt"` にする → 自己修正の機会がなくなり、要求 (3) を満たさない。

### D6: Layer 1 の follow-up は「ちょうど 1 回」に制限する

この contract に対する検出は `maxAttempts` を 1 として扱う。既定の
`OUTPUT_FOLLOWUP_MAX_ATTEMPTS = 2` をそのまま使わない。

- **Rationale**: リクエストが「同一 implementer にちょうど 1 回 follow-up」と明記している。
  また、この違反はモデルの不注意ではなく「要件そのものがワークフロー変更を要求している」
  ケースが多く、2 回目以降の再試行はトークンを消費するだけで成功率が上がらない。
  1 回で解消しないなら人間の判断 (要件の見直し、PAT の用意、手動適用) が必要という
  シグナルとして扱うのが正しい。
- **Alternatives considered**:
  - 既定の 2 回を流用 → 実装は楽だが仕様と乖離し、無駄な 1 ターン分の時間とトークンを払う。
  - 0 回 (即 escalation) → 「エージェントの自己修正を経て」という要求 (3) に反する。
    ワークフロー編集が本質的でないケース (ついでに触っただけ) を救えない。

### D7: Layer 2 は `commitAndPush` の mixed reset 直後・staging 直前に置く

`commitAndPush` の入口で `git reset --mixed headBeforeStep` を行った直後、staging と各種
guard より前に D4 のヘルパで公開予定パスを列挙し、宣言パターンと突き合わせる。一致があれば
新しいエラー (`UNPUSHABLE_PATH_BLOCKED`) を投げて halt させる。push は試行しない。

- **Rationale**: この位置なら scoped staging と guarded staging の両方を 1 箇所でカバーでき、
  `pushOnly` に到達しないことが構造的に保証される。`pushOnly` の中に置く案は、escalation
  チェックポイントの push (`commitFinalState` 経由) まで巻き込んで止めてしまい、
  「escalation したいのに escalation の記録を push できない」というデッドロックを生む。
  commit **前** に止めることで、違反する変更は未コミットのまま worktree に残る。
  チェックポイントは `pipelineManagedPaths(slug)` しか stage しないため、依然として push 可能
  である — これは意図した性質であり、Layer 2 が escalation を成立させる前提になる。
  また、volume/byte guard (`stagingLimitExceededError`) が既に「commit 前に fail-closed で
  止めて escalation へ回す」前例を作っており、それと同じ形になる。
- **Alternatives considered**:
  - `pushOnly` の直前 → 上記デッドロック。加えて commit 済みなので worktree から違反を
    取り除く operator の作業が増える (要 reset)。
  - `runInlineEgressCheck` の中に相乗り → egress check は「意図しないコミットの混入」を見る
    別の関心事。混ぜると片方の失敗理由がもう片方のエラーコードで報告されて混乱する。
  - executor 側で `finalizeStepArtifacts` の前に別途チェック → `commitAndPush` を直接呼ぶ
    他の経路 (round artifacts など) を取りこぼす。

### D8: 両レイヤの escalation は `awaiting-resume` halt として発火させる

`src/core/step/step-halt.ts` に `makeDriftHalt` を範にした
`makeUnpushablePathHalt` を追加する。executor の出力ゲート
(`partitionByPolicy` の halt 側) では違反 kind が `"unpushable-path"` のときに、
`finalizeStepArtifacts` の失敗経路 (単一の `makeCommitFailHalt` 呼び出し箇所) では
エラーコードが `UNPUSHABLE_PATH_BLOCKED` のときに、この新 factory へ分岐する。
理由文には一致したパスの一覧と、環境制約 (「Actions の GITHUB_TOKEN は
`.github/workflows/**` を push できない」) を必ず含める。

- **Rationale**: `notifyJobTerminal` は `awaiting-resume` に対してのみ issue へ escalation
  コメントを出し、`failed` は無言で返る。既定の `failed` のままだと
  「escalation する」という受け入れ条件を満たせず、`resume --from-issue` での再開もできない。
  この違反は「コードの欠陥」ではなく「人間の判断待ち」なので、意味論的にも
  `awaiting-resume` が正しい。理由文にパスと環境制約を両方入れるのは、operator が
  issue コメントだけを見て次の手 (要件を変える / PAT を用意する / 手動適用する) を
  選べるようにするため。
- **Alternatives considered**:
  - `failed` のまま → escalation されず、受け入れ条件 (b)(c) を満たさない。現状の #1054 と同じ。
  - `notifyJobTerminal` を変えて `failed` でもコメントする → 影響範囲が本件外の全 failure に
    及ぶ。既存の運用 (failed は再開不能として扱う) を壊す。
  - 新しい halt kind を足す → `StepHalt` の判別共用体を広げると全ての消費側の網羅性検査に
    波及する。既存 2 種で表現できるものを増やす理由がない。

### D9: 未宣言環境では検出処理そのものを実行しない

`pushCapability` のパターンが空のとき、implementer は `"unpushable-path"` contract を返さず、
Layer 2 は git subprocess を一切呼ばずに即 return する。

- **Rationale**: 受け入れ条件 (e)「未宣言環境では挙動不変・既存テスト無改変で green」を
  構造的に保証する最も確実な方法は、コードパスに入らないこと。git 呼び出しが増えないので
  ローカル実行のレイテンシにも影響しない。既存テストのモック spawn に新しい期待値を足さずに
  済むことも重要 (足すと「既存テスト無改変」を破る)。
- **Alternatives considered**:
  - 常に列挙してからパターン 0 件で照合 → 無駄な subprocess が全 step で走り、
    既存テストの spawn モックが未知のコマンドで落ちる。

## Risks / Trade-offs

- **[偽陰性: `ghs_` 判定が将来変わる]** GitHub がトークン prefix を変更すると検出が外れ、
  従来通りの push 拒否に戻る。→ **Mitigation**: 検出関数を 1 箇所に閉じ、prefix を名前付き
  定数にしてテストで固定する。外れても現状と同じ失敗に degrade するだけで、新たな害はない
  (fail-open 設計)。D8 の Open Question の設定オーバーライドが将来の逃げ道になる。

- **[偽陽性: PAT を `GITHUB_TOKEN` に入れている環境]** workflows 権限のある PAT を
  `GITHUB_TOKEN` に設定している利用者は `ghs_` prefix にならないため未宣言となり、
  正しく素通りする。逆に `ghs_` なのに押せるケースは存在しない。→ **Mitigation**: 検出条件に
  `GH_TOKEN` 未設定を AND で入れ、明示的な PAT 指定を最優先で尊重する。

- **[Layer 1 の検出タイミングが step 終了直後に限られる]** implementer が途中で
  workflows を触っても、検出は出力検証フェーズまで走らない。→ **Mitigation**: 事前通知 (D3)
  で着手前に知らせ、Layer 1 で終了直後に捕まえ、Layer 2 で最終防衛する。3 段構えなので
  中間タイミングの検出がなくても要求は満たせる。リアルタイム hook は複雑さに見合わない。

- **[implementer 以外の step が workflows を触る]** code-fixer / build-fixer なども
  `.github/workflows/**` を編集し得る。Layer 1 contract を implementer にしか付けないと、
  それらは Layer 2 でしか止まらない (= 自己修正の機会なし)。→ **Mitigation**: Layer 2 は
  `commitAndPush` にあるため全 step を無条件にカバーし、escalation 品質は同一。Layer 1 の
  対象 step 拡張は contract を返す step を増やすだけで済む設計にしておき、実際の拡張は
  実運用の頻度データを見てから行う (Open Question)。

- **[未 push コミット列挙のコスト]** `git rev-list` + コミット数分の `git diff-tree` が
  commit 前に走る。→ **Mitigation**: 対象は「まだ push していないコミット」のみで通常数件。
  未宣言環境では実行しない (D9)。列挙結果は 1 回の呼び出し内で使い回す。

- **[commit 前 halt による作業の未コミット残留]** Layer 2 は commit しないので、
  違反を含む作業ツリーの変更は worktree に残るだけで、branch には現れない。
  → **Mitigation**: これは意図した trade-off (D7)。escalation の理由文に「変更は
  未コミットのまま残っている」ことを明記し、operator が誤解しないようにする。
  halt レコード自体の保全強化は別リクエスト `halt-checkpoint-restack` の範囲。

- **[通知文面が長くなりコンテキストを圧迫する]** 全 request-review / implementer 実行で
  常に文面が付くと無駄。→ **Mitigation**: 宣言がある環境でのみ連結し、未宣言では空文字列で
  何も足さない。文面は数行に収め、予測一致時のみ該当パスを列挙する。

## Open Questions

- 設定によるオーバーライド (`pipeline.unpushablePathPatterns` のような config フィールド) を
  公開すべきか。GHES やセルフホストで別のパス制約がある環境では有用だが、本リクエストの
  スコープを広げるため今回は見送る。D1 の型は配列で受けるので、後から検出結果と config を
  マージする形で無改造に近い追加ができる。
- Layer 1 contract を code-fixer / build-fixer / spec-fixer にも付けるか。実運用で
  implementer 以外が workflows を触る頻度が判明してから判断する。
- 並列レビュー round の成果物コミット経路 (`commitRoundArtifacts` 系) が
  `commitAndPush` を共有していない場合、そこにも Layer 2 相当が要るか。実装時に呼び出し
  グラフを確認し、共有していなければ同じヘルパを差す。
- escalation 後の再開フロー: operator が worktree の違反変更を捨てて再開したいとき、
  `resume --from-issue` で自然に続行できるか。既存の resume point 意味論の範囲で足りる
  想定だが、実装時に手動で 1 度確認しておきたい。
