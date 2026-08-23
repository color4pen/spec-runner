# Tasks: push capability preflight

## T-01: push 能力モジュール (shared-kernel) の新設

- [x] `src/git/push-capability.ts` を新規作成する
- [x] 型 `PushCapability` を export する: `{ patterns: string[]; source: string }`
      (`source` は `"actions-installation-token"` などの由来ラベル。通知文面と診断に使う)
- [x] 定数 `WORKFLOWS_PATTERN = ".github/workflows/**"` と
      `INSTALLATION_TOKEN_PREFIX = "ghs_"` を named export する
- [x] 純粋関数 `detectPushCapability(env: Record<string, string | undefined>, token: string | undefined): PushCapability`
      を実装する。`env.GITHUB_ACTIONS === "true"` かつ `env.GH_TOKEN` が undefined/空文字
      かつ `token?.startsWith(INSTALLATION_TOKEN_PREFIX)` の 3 条件すべてが真のときのみ
      `{ patterns: [WORKFLOWS_PATTERN], source: "actions-installation-token" }` を返し、
      それ以外は `{ patterns: [], source: "none" }` を返す
- [x] 純粋関数 `matchUnpushablePaths(paths: string[], capability: PushCapability | undefined): string[]`
      を実装する。`capability` が undefined か `patterns` が空なら常に `[]` を返す。
      それ以外は `src/util/glob-match.ts` の `matchesGlob` で各パスをいずれかのパターンと
      照合し、一致したパスを重複なし・ソート済みで返す
- [x] import は `node:*` と `src/util/*` のみに限定する (shared-kernel → leaf)
- [x] 各 export に、なぜその条件なのかを説明する TSDoc を付ける
      (特に `ghs_` 判定が Actions の GITHUB_TOKEN を識別する唯一の実行時シグナルである点)

**Acceptance Criteria**:
- `tests/unit/git/push-capability.test.ts` が以下を検証して green:
  - `GITHUB_ACTIONS="true"` + `GH_TOKEN` 未設定 + `ghs_xxx` → `patterns` に `.github/workflows/**`
  - `GITHUB_ACTIONS="true"` + `GH_TOKEN="ghp_xxx"` → `patterns` は空
  - `GITHUB_ACTIONS` 未設定 → `patterns` は空
  - `GITHUB_ACTIONS="true"` + `GH_TOKEN` 未設定 + `ghp_xxx` → `patterns` は空
  - `token` が undefined → `patterns` は空
  - `matchUnpushablePaths` が `.github/workflows/ci.yml` に一致し `src/foo.ts` に一致しない
  - `matchUnpushablePaths([...], undefined)` と patterns 空の capability が `[]` を返す
- `src/git/push-capability.ts` は `src/util/` と `node:*` 以外を import しない
- `tests/unit/architecture/core-invariants.test.ts` が green

## T-02: 「push で公開されるパス」列挙ヘルパの実装

- [x] `src/git/push-capability.ts` に
      `collectPublishablePaths(spawnFn, cwd): Promise<string[]>` を追加する
      (spawn の型は既存の `src/util/git-exec.ts` の `SpawnFn` を再利用する)
- [x] worktree 側: `git status --porcelain --untracked-files=all` を実行し、パス部分を抽出する。
      rename 表記 (`R  old -> new`) は old / new の両方を含める
- [x] コミット側: `git rev-list HEAD --not --remotes=origin` で未 push の OID を列挙し、
      各 OID に対し `git diff-tree --no-commit-id --name-only -r <oid>` を実行してパスを収集する
- [x] 2 つの集合の **和** を重複なし・ソート済みで返す
      (後続コミットで revert されたパスも必ず残す = fail-closed)
- [x] git コマンドが失敗した場合は例外を投げず、取得できた分だけを返す。
      ただし `rev-list` 自体の失敗はログに残す (silent fail-open を避けるため)
- [x] `runInlineEgressCheck` が使う `git rev-list HEAD --not --remotes=origin` と同一の式である
      ことを TSDoc に明記する

**Acceptance Criteria**:
- `tests/unit/git/push-capability.test.ts` が fake spawn で以下を検証して green:
  - worktree に未コミットの `.github/workflows/ci.yml` があるとき結果に含まれる
  - 未 push コミットが追加し次のコミットが削除したパスが、worktree がクリーンでも結果に含まれる
  - `rev-list` が空 + worktree クリーン → 空配列
  - untracked ファイルが `--untracked-files=all` 経由で含まれる
  - rename 表記から old / new 両方が抽出される
- 呼び出される git コマンドが上記の 3 種類のみであることを spawn 呼び出し履歴で確認する

## T-03: `pushCapability` を `StepContext` に載せ、per-run で 1 回だけ解決する

- [x] `src/core/port/step-context.ts` の `StepContext` に
      `pushCapability?: PushCapability` を追加する (型は `src/git/push-capability.ts` から import)
- [x] `src/core/command/runner.ts` の per-run 初期化 (`deps.dynamicContext = await collectDynamicContext(...)`
      と同じ箇所) で `detectPushCapability(process.env, <解決済みトークン>)` を 1 回だけ呼び、
      `deps.pushCapability` に代入する
- [x] トークンは既存のトークン解決 (`src/core/credentials/github.ts` の解決結果) を再利用する。
      新たにトークン解決処理を書かない
- [x] トークン値そのものは `deps` にもログにも一切載せない (prefix 判定の結果だけを保持する)

**Acceptance Criteria**:
- `deps.pushCapability` が 1 run につき 1 回だけ解決される (検出関数の呼び出し回数を spy で 1 と確認)
- 生のトークン文字列が `PushCapability` に含まれない (型に token フィールドが存在しない)
- `tests/unit/architecture/core-invariants.test.ts` が green
- 既存の `tests/unit/command/` 配下のテストが無改変で green

## T-04: 能力制約の事前通知 (request-review / implementer)

- [x] `src/git/push-capability.ts` に純粋関数
      `renderPushCapabilityNotice(capability: PushCapability | undefined, predictedTouchedFiles?: string[]): string`
      を追加する
- [x] `capability` が undefined か `patterns` が空のときは **空文字列** を返す
- [x] patterns があるときは、宣言パターン一覧と
      「この環境のトークンでは該当パスを push できない」旨、および
      「要件がそれらのパスの変更を要求する場合は変更せずに達成するか、達成できないなら
      operator へ escalation される」旨を数行で返す
- [x] `predictedTouchedFiles` が渡され、`matchUnpushablePaths` で一致するものがあるときは
      「事前警告」として該当パスを列挙する行を追加する。返り値は文字列のみで、
      呼び出し側の制御フローに影響を与えない
- [x] `src/core/step/implementer.ts` の `buildMessage(state, deps)` の末尾で、
      `renderPushCapabilityNotice(deps.pushCapability)` が空文字列でなければ連結する
- [x] `src/core/step/request-review.ts` の `buildMessage(state, deps)` でも同様に連結する
      (request-review は予測前なので `predictedTouchedFiles` は渡さない)
- [x] implementer では state から取得できる request-review の予測 `touchedFiles` があれば
      第 2 引数として渡す。取得できない場合は渡さない
- [x] `buildMessage` の純粋性を維持する (I/O・環境変数アクセスを追加しない)

**Acceptance Criteria**:
- `tests/unit/step/push-capability-notice.test.ts` が以下を検証して green:
  - `patterns` が空 → 返り値が空文字列で、implementer のメッセージが capability なしの場合と完全一致
  - `patterns` があるとき implementer メッセージに `.github/workflows/**` が含まれる
  - 予測 `touchedFiles` に `.github/workflows/ci.yml` があるとき、そのパスが警告として文面に現れる
  - 予測一致があっても step の返り値は halt にならない (request-review が通常どおり完了する)
  - request-review のメッセージにも patterns があるときのみ通知が付く
- `buildMessage` 内で `process.env` や fs / spawn を参照していない

## T-05: `unpushable-path` OutputContract kind の追加

- [x] `src/core/port/output-contract.ts` の `OutputContractKind` に `"unpushable-path"` を追加する
- [x] `OutputContract` にこの kind 用の任意フィールド (宣言パターンと、検出時に必要な情報) を
      追加する。既存 kind の型を破壊しないこと
- [x] `OutputViolation` にこの kind の違反が持つ「一致したパス一覧」を格納できるようにする
      (既存の `detail: string[]` を使えるならそれを使い、新フィールドを増やさない)
- [x] `src/core/step/implementer.ts` の `outputContracts(state, deps)` を変更し、
      `deps.pushCapability?.patterns` が非空のときだけ
      `{ kind: "unpushable-path", policy: "follow-up", ... }` を 1 件追加する。
      patterns が空のときは返り値を現状から一切変えない
- [x] `src/core/step/output-verify.ts` の `buildOutputFollowUpPrompt` に
      `unpushable-path` 用のセクションを追加する。文面は「一致したパス一覧」と
      「変更を取り除くか、当該パスを変更せずに要件を満たすか、どちらかを行うこと」
      「回避できない場合はその旨を明記して作業を止めること」を含める

**Acceptance Criteria**:
- `tests/unit/step/unpushable-path-contract.test.ts` が以下を検証して green:
  - patterns が非空のとき implementer の `outputContracts()` に kind `unpushable-path` が 1 件だけ含まれる
  - patterns が空のとき `outputContracts()` の結果が現行と完全一致 (件数・内容)
  - `buildOutputFollowUpPrompt` が `unpushable-path` 違反に対し、一致パスを列挙した
    専用セクションを出力する
- 既存の `tests/unit/step/output-verify.test.ts` が無改変で green

## T-06: LocalRuntime での `unpushable-path` 検出

- [x] `src/core/runtime/local.ts` の `validateStepOutputs` に `unpushable-path` の分岐を追加する
- [x] 分岐内で `collectPublishablePaths(this.spawnFn, cwd)` を呼び、
      `matchUnpushablePaths(paths, capability)` の結果が非空なら
      policy `"follow-up"` の `OutputViolation` を 1 件積む。空なら違反を積まない
- [x] 違反の `detail` には一致したパスの一覧を入れる (follow-up 文面と halt 理由の両方で使う)
- [x] contract に patterns が無い場合は git コマンドを **一切実行せず** に即 continue する

**Acceptance Criteria**:
- `tests/unit/runtime/unpushable-path-validate.test.ts` が fake spawn で以下を検証して green:
  - 公開予定パスに `.github/workflows/ci.yml` があるとき違反が 1 件、`detail` にそのパスが入る
  - 公開予定パスが `src/foo.ts` のみのとき違反 0 件
  - contract の patterns が空のとき git コマンドが 1 回も呼ばれない
- 既存の LocalRuntime 出力検証テストが無改変で green

## T-07: ManagedRuntime での `unpushable-path` スキップ

- [x] `src/core/runtime/managed.ts` の `validateStepOutputs` で、`unpushable-path` kind を
      明示的にスキップ (`continue`) する分岐を追加する
- [x] この分岐は既存の `if (!branch) { ... continue; }` の早期 continue **より前** に置く
      (branch 未取得時に偽の違反を出さないため)
- [x] `test-coverage` を同様にスキップしている既存コメントに倣い、
      「local runtime がこの契約を権威的に検証する」旨のコメントを付ける

**Acceptance Criteria**:
- `tests/unit/runtime/unpushable-path-validate.test.ts` が以下を検証して green:
  - ManagedRuntime に `unpushable-path` contract を渡すと違反 0 件
  - `branch` が undefined の状態でも `unpushable-path` の違反が出ない
- 既存の ManagedRuntime 出力検証テストが無改変で green

## T-08: follow-up 回数を 1 回に制限する

- [x] `unpushable-path` contract に対する follow-up 上限が 1 になるようにする
      (`src/core/step/step-context-builder.ts` の `outputVerification.maxAttempts` 決定ロジックを
      拡張し、follow-up 対象契約に `unpushable-path` が含まれる場合の上限を 1 とする)
- [x] 既定値 `OUTPUT_FOLLOWUP_MAX_ATTEMPTS = 2` は変更しない。他 kind の挙動を変えないこと
- [x] 上限を 1 にする根拠 (要件が「ちょうど 1 回」と規定している) を TSDoc に残す
- [x] TSDoc コメントに次のトレードオフを明記する:
      `maxAttempts` は step 全体の follow-up 回数上限を単一値で管理するため、
      同一 step に `tasks-complete` など他の follow-up contracts が混在する場合、
      それらの contracts も 1 回に制限される（通常は 2 回）。
      `unpushable-path` が含まれるケースではこれは意図した動作であり、
      仕様上 unpushable-path 検出後の多重リトライは不要と判断している。
      混在ケース（例: tasks-complete + unpushable-path が同一 step に存在）での
      tasks-complete の試行数が暗黙的に 1 に制限される点は TC-034 の保証対象外である。

**Acceptance Criteria**:
- `tests/unit/step/unpushable-path-contract.test.ts` が以下を検証して green:
  - 違反が follow-up 後も解消しないケースで、adapter の repair ループが送る follow-up が
    ちょうど 1 回 (2 回目が送られない)
  - 違反が follow-up 後に解消するケースで、follow-up が 1 回送られ、その後 halt しない
- `unpushable-path` を含まない契約集合では `maxAttempts` が従来どおり 2

## T-09: `awaiting-resume` escalation halt factory の追加と executor 側の分岐

- [x] `src/core/step/step-halt.ts` に `makeUnpushablePathHalt(...)` を追加する。
      `makeDriftHalt` を範とし、`kind: "awaiting-resume"` で `transitionJob` +
      `resumePoint` + `interruption` を設定する
- [x] 理由文には (1) 一致したパスの一覧、(2) 環境制約
      (「この環境のトークンは `.github/workflows/**` を push できない」)、
      (3) 変更は未コミットのまま worktree に残っていること、(4) operator の選択肢
      (要件の見直し / workflows 権限を持つ PAT の用意 / 手動適用) を含める
- [x] `src/core/step/executor.ts` の出力ゲート (`partitionByPolicy` の halt 側) で、
      halt 対象違反に kind `unpushable-path` が含まれる場合は `makeOutputGateHalt` ではなく
      `makeUnpushablePathHalt` を使うよう分岐する
- [x] `unpushable-path` 以外の halt 違反は従来どおり `makeOutputGateHalt` を使う

**Acceptance Criteria**:
- `tests/unit/step/unpushable-path-escalation.test.ts` が以下を検証して green:
  - follow-up 後も違反が残るとき、step 結果が `kind: "halt"` かつ halt が `awaiting-resume`
  - halt の理由に一致パス (`.github/workflows/ci.yml`) が含まれる
  - halt の理由に環境制約の説明が含まれる
  - `unpushable-path` 以外の halt 違反では従来どおり `STEP_OUTPUT_MISSING` の `failed` halt になる
- 既存の `tests/unit/step/executor-output-gate.test.ts` が無改変で green

## T-10: Layer 2 — `commitAndPush` の決定論的バックストップ

- [x] `src/errors.ts` の `ERROR_CODES` に `UNPUSHABLE_PATH_BLOCKED` を追加し、
      `unpushablePathBlockedError(paths, patterns)` factory を実装する
      (`stagingLimitExceededError` の記述スタイルに揃え、
      「commit 前に fail-closed で停止し、push を試行せずに escalation する」旨を TSDoc に書く)
- [x] エラーメッセージに一致パス一覧と環境制約を含める
- [x] `src/core/step/commit-push.ts` の `commitAndPush` 内、`git reset --mixed headBeforeStep`
      の **直後** かつ staging・各種 guard の **前** に検査を挿入する
- [x] `deps.pushCapability?.patterns` が空 (または undefined) の場合は git コマンドを
      一切実行せずに素通りする
- [x] patterns が非空の場合のみ `collectPublishablePaths` → `matchUnpushablePaths` を実行し、
      一致があれば `unpushablePathBlockedError` を throw する
      (stage も commit も push も行わない)
- [x] `src/core/step/executor.ts` の `finalizeStepArtifacts` 失敗経路
      (単一の `makeCommitFailHalt` 呼び出し箇所) で、エラーコードが `UNPUSHABLE_PATH_BLOCKED`
      のときは `makeUnpushablePathHalt` に分岐する
- [x] `commitAndPush` を共有していない round artifacts のコミット経路がある場合は、
      同じ検査ヘルパを差す (呼び出しグラフを確認して判断する)

**Acceptance Criteria**:
- `tests/unit/step/unpushable-path-escalation.test.ts` が fake spawn で以下を検証して green:
  - patterns 宣言下で公開予定パスが `.github/workflows/ci.yml` のとき、
    spawn 履歴に `push` を含む git 呼び出しが 1 件も無い
  - 同ケースで `commit` を含む git 呼び出しも 1 件も無い
  - throw されたエラーの `code` が `UNPUSHABLE_PATH_BLOCKED`
  - executor 経由では `awaiting-resume` halt になり、理由にパスと環境制約が含まれる
  - patterns 宣言下で公開予定パスが `src/foo.ts` のみのとき、commit と push が通常どおり実行される
  - patterns が空のとき `collectPublishablePaths` 由来の git コマンドが 1 回も呼ばれない
- 既存の `tests/unit/step/commit-and-push.test.ts` と
  `tests/unit/step/pipeline-sole-committer-*.test.ts` が無改変で green

## T-11: 仕様の実行可能化と回帰確認

- [x] `spec.md` の各 Requirement に対応する TC-ID を、T-01〜T-10 で追加したテストに紐づける
      (テスト名またはコメントに Requirement 名を記載し、対応を追跡可能にする)
- [x] 未宣言環境 (patterns 空) での回帰を通しで確認する:
      既存テストスイート全体を無改変で走らせ、新規 git コマンドが発生していないことを
      少なくとも 1 本の統合的テストで確認する
- [x] `src/git/push-capability.ts` の階層違反がないことを
      `tests/unit/architecture/core-invariants.test.ts` で確認する
- [x] `.github/workflows/**` を **一切変更していない** ことを確認する
      (本変更自体が Actions 上で push 可能である必要がある)
- [x] `npm run typecheck && npm test` を実行して green を確認する

**Acceptance Criteria**:
- `npm run typecheck` がエラー 0 で終了する
- `npm test` が全件 green
- `git diff --name-only` の結果に `.github/` 配下のファイルが 1 件も含まれない
- 既存テストファイルへの変更が 0 件 (新規テストファイルの追加のみ)
- `spec.md` の全 Requirement に対応するテストが存在する
