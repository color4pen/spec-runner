# managed agent-runner.ts (633行) を stage 抽出 + error-wrap 集約でリファクタする

## Meta

- **type**: refactoring
- **slug**: managed-agent-runner-refactor
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

`src/adapter/managed-agent/agent-runner.ts` が **633 行**で責務が複数同居し、テスト境界が不明瞭（当初のモジュール評価で「真に分割すべき唯一の大ファイル」と判定）。

実機確認した現状:
- `runDesignStyle` (L130-313, 約 184 行) と `runPollingStyle` (L314-587, 約 274 行) の **2 つの巨大メソッド**が、session 作成 / message 送信 / poll / fallback / follow-up / verify / fetch をインラインで全部抱える
- 冒頭コメントは「4 stages に分割」と謳うが、実コードは private stage メソッドに切り出されていない
- error-wrap パターンの反復: `throwWrappedError|ErrorInfo` の grep ヒットは 26 件（import・型注釈含む）、実際の『`ErrorInfo` 構築 + throw』フルパターンは約 11-12 箇所
- resume fallback ロジックが単体で ~76 行

## type: refactoring の理由（module-architect 確認済み）

振る舞い・port 契約とも不変で delta spec を作らない。`spec-change`/`new-feature` だと `no-specs-for-required-type` ルールが delta 0 件を violation とし delta-spec-fixer ループに入ってしまう（`TYPES_REQUIRING_SPECS = ["spec-change","new-feature"]`）。構造リファクタの前例（`session-lifecycle-extraction`, `refactor-finish-orchestrator-phases` 等）も一貫して `refactoring` 型。adr: true は構造的リファクタとして維持。

## spec 制約（重要・保持する）

`managed-agent-runtime/spec.md` は `ManagedAgentRunner.runDesignStyle(ctx)` / `runPollingStyle(ctx)` のメソッド名を明示参照し、scenario で「実行すると `sendUserMessage` / `pollUntilComplete` が呼ばれる」等を要求する。本リファクタは:
- `runDesignStyle` / `runPollingStyle` のメソッド名・公開シグネチャを変えない
- 実行経路でこれらの呼び出しが起きる振る舞いを保つ

これらを保てば既存 scenario は green のまま。

## 要件

1. **各 style 内で縦に stage 抽出する**（design/polling を横断統合しない）。`runDesignStyle` → `prepareDesignSession` / `streamWithFallback` / `verifyDesignArtifacts`、`runPollingStyle` → `preparePollingSession` / `pollOnce` / `guardCommit` / `fetchResultFile` 相当。design と polling は完了判定・resume fallback・guard の有無が別物なので **1 メソッドに畳まない**（条件分岐の海になり可読性が悪化する）。`runDesignStyle`/`runPollingStyle` はメソッド名を保ったまま薄い orchestrator にする。
2. **真に重複している小さい定型のみ共通 private 化する**: timeout 解決（`getStepExecutionConfig`→`effectiveTimeoutMs`、design/polling/follow-up の 3 箇所）、follow-up turn ブロック（design/polling のほぼ同形）、usage read（完全重複）。
3. **error-wrap を集約する**: `ErrorInfo` 組み立て + throw の定型（26 箇所）を helper 化。置き場所は `src/adapter/managed-agent/` 内に新設（例 `error-helpers.ts`）し、実体の throw は既存 `executor-helpers.throwWrappedError` に委譲する（再実装しない）。`executor-helpers.ts`（executor 寄り・JobStateStore 依存）には寄せない。
4. 振る舞い・契約は不変。`AgentRunner` port / `managed-agent-runtime` / session 系 spec の挙動・出力が従来と意味的に等価。

## スコープ外

- `AgentRunner` interface / `SessionClient` port の契約変更
- design/polling の実行フロー・完了判定ロジックの挙動変更（移すのは構造のみ）
- `runDesignStyle` / `runPollingStyle` のメソッド名・シグネチャ変更（spec が名指し）
- **spec が internal method 名に依存している設計負債の是正**（spec を「公開境界の振る舞い」へ書き換えるのは真の spec-change。別 issue として切り出す。本件では method 名保持で対応）
- `createManagedAgentRunner` / `ManagedAgentRunnerDeps` / `buildManagedGitPushInstruction`（触る必要なし）
- managed runtime 以外（claude-code adapter 等）

## 振る舞い保持で壊しやすい箇所（regression 注意）

- **timeout fallback の二段ロジック**（`timeoutMs > 0 ? : DEFAULT_POLL_TIMEOUT_MS`）— 共通化時も挙動を 1:1 で移す
- **resume fallback の二重 catch**（createSession 失敗と sendUserMessage 失敗で error code / メッセージが別）— 1 本にまとめて診断メッセージを変えない
- **`sseEndTurn = !needsPollingFallback` による follow-up 実行条件**（design は SSE end_turn のみ、polling fallback では follow-up を回さない）— follow-up 共通化の最大の落とし穴
- **design 側 verify の選択的 catch**（`verifyBranch` は warn 非 fatal、`verifyChangeFolder` は `CHANGE_FOLDER_NOT_FOUND`/`GITHUB_TOKEN_EXPIRED` のみ rethrow）— warn と throw の振り分けを保つ
- **`void completedAt`**（error path のみ参照）— 生成位置と参照関係を切らない

## 受け入れ基準

- [ ] `runDesignStyle` / `runPollingStyle` がメソッド名を保持しつつ stage 組み立ての薄い形になっている
- [ ] 各 style 内で session 準備 / 送受信 / verify / fetch が private stage に縦抽出されている（design/polling 横断統合はしない）
- [ ] error-wrap の定型が adapter 内 helper に集約され、throw は executor-helpers に委譲している
- [ ] `agent-runner.ts` が縮小している（350 行級は努力目標。行数のために振る舞い保持の条件分岐を圧縮しない）
- [ ] `managed-agent-runtime` の **behavior scenario のみ**（runDesignStyle/runPollingStyle の follow-up 等の振る舞い）が green。pre-existing な不整合 scenario（例: constructor の `configStore: ConfigStore` 期待など実装と乖離している分）は本件対象外・別 issue。主たる合否基準は `typecheck + test`
- [ ] 振る舞い不変（regression なし）
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

module-architect レビュー済み:

- **type**: `refactoring`（delta 不要・`no-specs-for-required-type` 対象外・前例一致）。`spec-change` だと delta 0 件で needs-fix ループに入る。
- **stage 抽出**: design/polling は名前が似るだけで実体が別（完了判定・resume fallback・guard が異なる）。横断統合せず各 style 内で縦に割る。共通化は timeout 解決 / follow-up block / usage read の小さい定型のみ。
- **error-wrap 置き場所**: adapter 内新設（`executor-helpers.ts` は executor 寄り・JobStateStore 依存なので cohesion が崩れる）。throw 本体は executor-helpers に委譲し coupling 方向（adapter→core）を維持。
- **spec の method 名依存**: 設計負債だが本件では触らない（書き換えると真の spec-change になり refactoring 型と自己矛盾）。別 issue 候補。
- **adr: true** 維持（構造的リファクタ）。
