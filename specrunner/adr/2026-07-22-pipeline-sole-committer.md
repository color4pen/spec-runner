# ADR-20260722: pipeline を唯一の committer にする — 検査モデルから合成モデルへ

## ステータス

accepted

## コンテキスト

write-set の commit 境界強制は「agent の効果を後追いで検査する（inspection）」モデルで実装されてきた。このモデルは「agent が git の全能力を持つ」前提の上に blocklist を敷く構造であり、効果の隠れ場所の列挙が構造的に収束しない。

v23 時点で実証済みの残存 2 経路が具体的に再現された:

1. **index residual + 裸 add -A**: 許可外ファイルを事前 stage すると scoped commit（pathspec）には混入しないが index に残存し、後続 `commitFinalState` の裸 `git add -A`（`commit-push.ts:561`）が次 commit に取り込む。
2. **round 自己 commit bypass**: parallel custom reviewer が正典を弱化して自己 commit すると、round の未宣言変更検査は worktree 変更のみ（`listWorktreeChanges`）を見るため、worktree が clean になった時点で素通りし、HEAD が弱化 commit に前進したまま後続 push の祖先として remote に到達する。

この 2 経路の発見は「検査モデルでは隠れ場所の列挙が収束しない」という構造的問題を示す具体的な証拠であり、個別パッチで対処し続けることの限界を示した。

## 決定

### D1: sequential step の commit を「mixed reset + 明示パス合成」で構成する（R1）

step 完了時、pipeline は `headBeforeStep` を起点に commit を合成する。agent が自己 commit していた場合は `git reset --mixed <headBeforeStep>` で起点に戻してから合成する。mixed reset は HEAD/index を起点へ戻し worktree を保持するため、agent の作業内容は worktree に unstaged で残り、歴史からは除外される。

- **scoped 合成**: 宣言 writes ∪ pipeline 管理パス（`pipelineManagedPaths`）を pathspec として stage/commit する。
- **guarded 合成**: `git status --porcelain -z --no-renames` で実変更 path を列挙し write-scope allowlist で検証した上で、列挙した実変更 path を明示 pathspec で stage/commit する。
- **push-as-is 廃止**: agent 著 commit を検査後そのまま push する経路を削除する。

**採用理由**: mixed reset で「作業内容（worktree）」と「歴史（HEAD）」を分離し、歴史を pipeline 所有にする。検査モデルの「効果の隠れ場所の列挙」を、合成モデルの「構成の正しさ 1 点」に置換する。明示 pathspec commit により index 残存（事前 stage）は構造的に混入しない。

**却下案**:
- *cherry-pick / 選別検査*: 検査モデルの継続であり経路列挙の非収束問題が残るため却下。
- *hard reset*: agent の正当な作業内容を破壊するため却下。mixed reset で内容を保持する。

### D2: `commitFinalState` を pipeline 管理パスに限定する（R2）

`commitFinalState`（checkpoint / finalize）の裸 `git add -A` を廃し、`pipelineManagedPaths(slug)` を明示 pathspec とした staging/commit に置換する。agent の未 commit 作業内容は checkpoint / finalize に含めない。local resume は worktree 残存で継続可能（現行 local-first 運用と整合）。

**採用理由**: checkpoint の目的は resume 用の pipeline 状態公開であり、agent 未 commit 内容の同梱は過剰。これにより v23 経路 1 の最終混入点（`commitFinalState` の add -A）が消える。

**却下案**:
- *checkpoint の add -A 維持*: v23 で実証された混入経路そのもの。却下。

### D3: parallel round に fan-out 前後の HEAD guard を追加する（R3）

`ParallelReviewRound.run` に HEAD guard を追加する。fan-out 前に `headBeforeRound = captureHeadSha(cwd)` を記録し、fan-out 後に HEAD 照合を実施する。HEAD が前進していれば違反として commit range の diff を退避し、`git reset --mixed <headBeforeRound>` で起点へ復帰して escalation halt する（fail-closed）。reset 失敗は halt に倒す。

reviewer round は read-only であり、HEAD 前進自体が違反。内容検査は不要（前進 = 違反）。

**採用理由**: 未宣言変更検査が worktree 変更のみを対象とする構造欠陥（reviewer が自己 commit で worktree を clean にすると素通り）を、HEAD 前進という observable な事実で塞ぐ。

**却下案**:
- *round commit の内容検査で選別*: 検査モデルの継続。round は read-only なので前進自体を違反にする方が単純かつ収束的。

### D4: egress（push 直前）を合成 commit 台帳と照合する単一の壁にする（R4）

新 state field `synthesizedCommits?: string[]`（append-only）を追加し、pipeline が commit を作成するたびに OID を append する。すべての push は公開範囲（`git rev-list HEAD --not --remotes=origin`）の全 commit が台帳に含まれることを検証し、未知の commit があれば `EGRESS_UNKNOWN_COMMIT` で halt して push しない。

識別の正を state（agent が書けない領域）の OID 集合に置く。台帳を StepRun.commitOid と独立した専用 field にすることで、revision 束縛 / canonHash 束縛の意味論を一切変更しない。

**位置づけ**: agent 偽装への壁ではなく（壁は D1/D3 の reset + 合成）、合成漏れ・harness 欠陥の backstop。

**採用理由**: commit message / trailer は agent が偽装可能なため識別根拠にしない。state（agent が書けない領域）に置くことで偽装不能な根拠にする。

**却下案**:
- *StepRun.commitOid を台帳として流用*: CLI step の commitOid は entry-HEAD（評価 revision）であり作成 commit と一致しない。意味論変更リスクあり。専用 field で分離する。
- *message / trailer による識別*: agent が偽装可能。却下。

### D5: 合成・復帰経路の git 操作を fail-closed 化する（R5）

合成・復帰経路の git 操作（status / clean / checkout / reset / add / commit）の失敗を黙殺せず halt に倒す。現行の scoped residual における status 失敗の黙殺・restore 失敗の黙殺を解消する。

restore 失敗時は改変済み正典が worktree に残るため、復元済みと偽る halt メッセージを出してはならない。

**採用理由**: fail-open な検査は「検査面の外」を作る。全 git 操作を fail-closed にすることで、状態を検証できないまま push へ進む経路を消す。

### D6: `pipelineManagedPaths` に bite-evidence-result.md を追加する（#888 同時解消）

`round-git-scope.ts` の `pipelineManagedPaths(slug)` に `biteEvidenceResultPath(slug)` を追加する。この単一ソースは (a) scoped 合成の管理パス集合と (b) `partitionRoundChanges` の offending 除外の両方に効く。

**採用理由**: bite-evidence は CLI step で自 step の commit を持たず result md を dirty で残す。単一ソースへの追加で「合成に取り込む」「round 誤発火を防ぐ」の両要件を 1 箇所で満たす。

### D7: 合成モデル成立後に存在理由を失う inspection 経路を除去する

合成モデル成立により不要になる経路を除去する:

- **自己 commit 範囲検査**（`commitAndPushTail` step-0 の `listCommitRangeChangedPaths` / `findScopedCommitViolations`）: D1 の mixed reset で agent 自己 commit は除外されるため不要。
- **push-as-is 経路**（`commit-push.ts:237-247`）: D1 で廃止済み。

除去しないもの（存在理由が残る経路）:

- **scoped residual restore + halt**: 改変された正典を後続 step に読ませないための halt の存在理由は消えない。restore を外すと改変済み正典が worktree に残留し後続 sequential step が汚染された正典を読む。
- **guarded restore**（clean/checkout）: checkpoint の管理パス限定（D2）で commit layer の leak 経路は閉じているが、resume 後の step が違反内容を読まないための worktree 衛生として保持する。

### D8: 破壊確認（destruction confirmation）を記録する

各封鎖の有効性を、修正前挙動へ戻すと該当テストが fail することで記録する:

- 裸 add -A へ戻す → R6-1 / commitFinalState 混入テストが fail。
- push-as-is へ戻す → 「agent 著 commit が歴史に無い」テストが fail。
- HEAD guard 無しへ戻す → R6-2 / round HEAD 前進 halt テストが fail。

## 検討した代替案

### A1: 個別経路の inspection を継続強化する（現状の延長線）

v23 で発見された 2 経路を個別にパッチし、他の経路を引き続き列挙・ブロックする案。

- **Pros**: 既存コードへの変更が局所的で小さい。
- **Cons**: 「agent が git の全能力を持つ」前提の上に blocklist を敷く構造そのものが問題であり、効果の隠れ場所の列挙は構造的に収束しない。v23 の 2 経路発見がこの事実を実証した。
- **Why not**: 応急処置を繰り返す構造。新しい経路が発見されるたびに設計の欠陥が再顕現する。

### A2: SDK permission 層での agent git 実行遮断を先行させる

agent の git コマンド実行をランタイム permission 層で禁止し、git 操作能力自体を剥奪する案。

- **Pros**: agent が git を操作できない環境では本 ADR の全問題が解消する。
- **Cons**: SDK permission 層の実装は別 request のスコープであり、権限分離は追加レイヤ。本変更（合成モデル）は権限分離とは独立した多重防御の第 1 層として機能するべきであり、SDK 制約に依存すると制約が緩む環境で無防備になる。
- **Why not**: 本変更はスコープ外の SDK 制約に依存せず、push される歴史の構成を pipeline が自律的に制御する設計を採用する。SDK 制約は後続の多重防御として追加する。

### A3: Git / GitHub 権限分離で pipeline 専用 token を使う

pipeline が専用認証 token（agent が持たない）で commit / push し、agent token では push 不能にする案。

- **Pros**: 権限がシステムレベルで分離される。
- **Cons**: Git / GitHub credential の権限分離は別 track のスコープ。現状の shared 認証環境では適用不能。credential 分離後も、本変更（合成モデル）は commit 内容の正しさを保証する層として独立して価値を持つ。
- **Why not**: 別 track で追求するが、それに依存せずに本変更を先行実施する。

## 影響

### Positive

- push される歴史の全 commit が pipeline 合成の産物となり、agent 著 commit オブジェクトが歴史に残らない（「pipeline が sole committer」の不変条件が成立）。
- 個別経路の inspection を廃し、合成モデル + 単一 egress backstop に置換することで、敵対的レビューの対象が有限化される。
- v23 で実証された 2 経路（index residual / round 自己 commit）が E2E テストで封鎖証明される。
- 裸 `git add -A` 全廃が静的テスト（TC-021）で永続的に保証される。
- #888（bite-evidence-result.md 残留による round guard 誤発火）が同時解消される。
- 合成・復帰経路の git 操作失敗が fail-closed に倒り、状態不明のまま push へ進む経路が消える。

### Negative

- scoped 非宣言 worktree 変更は commit も restore もされず worktree に残留し、後続 parallel round の offending 検査で遅延検出される（即時検出ではない）。ただし fail-closed であり汚染されたまま緑進行しない。
- egress の公開範囲計算が remote-tracking ref（`--not --remotes=origin`）に依存するため、fetch 遅延や shared remote で誤差が出うる。誤検出は fail-closed（過剰 halt）側であり silent leak にはならない。
- CLI step（verification / `propagateVerificationResult`）の exit-HEAD を台帳に完全登録する wiring は push 失敗 resume 後の egress 照合に影響する gap が残っている（D4 risk、後続 request で解消予定）。

### Known Debt

- `propagateVerificationResult` の push 経路と `commitScopedPaths`（round artifact push）が egress 台帳照合を経由していない（D4 の完全実装未達）。一次防衛（mixed reset + 合成、HEAD guard）は正しく機能しているため direct セキュリティ hole ではないが、backstop の完全性要件を満たさない。後続 request で対処する。
- guarded mode の空変更フォールバックで `-- .`（repo root 全体）を pathspec に使う実質的な bare add-A 相当の経路が残る（`changedPaths` 空 = 変更なしの時は実害低いが設計原則との乖離）。

## 参照

- Request: `specrunner/changes/pipeline-sole-committer/request.md`
- Design: `specrunner/changes/pipeline-sole-committer/design.md`
- Spec: `specrunner/changes/pipeline-sole-committer/spec.md`
- Related: [ADR-20260523-executor-commit-push-extraction](2026-05-23-executor-commit-push-extraction.md) — commit/push 責務の executor からの抽出（本 ADR の前提構造）
- Related: [ADR-20260601-dsm-closure-src-wide](2026-06-01-dsm-closure-src-wide.md) — write-scope 不変条件の強制（本 ADR と相補的なレイヤ）
- Related: [ADR-20260607-protected-paths-merge-guard](2026-06-07-protected-paths-merge-guard.md) — merge gate での保護パスガード（egress 保護の別レイヤ）
