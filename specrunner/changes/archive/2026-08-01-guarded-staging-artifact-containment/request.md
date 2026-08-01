# guarded staging のビルド産物封じ込め — 除外パターンと量ガード

## Meta

- **type**: spec-change
- **slug**: guarded-staging-artifact-containment
- **base-branch**: main
- **adr**: true

## 背景

guarded write steps（implementer / build-fixer / code-fixer / test-materialize / adr-gen）は出力を事前列挙できないため、worktree の全変更（untracked 含む）を stage する。この構造では、agent がビルドのために worktree 内へ作った一時資材（一時 CARGO_HOME・`cargo vendor` 産物・依存キャッシュ等）が対象 repo の .gitignore に無い限り丸ごと commit に混入する。

0.4.8 利用プロジェクト（TypeScript + Rust 構成）で実際に発生した: implementer が worktree 内に `.cargo-tmp/` と vendor 産物（約 4.8 万ファイル / 880 万行）を作り、guarded staging が全量を commit。結果の巨大 pack が push で HTTP 400 になり job が halt、復旧は手動除去だった。混入は staging の構造由来であり、Rust を含むラウンドでは毎回再発しうる。

push の retry 追加は対処にならない（400 の原因は pack サイズであり再送では直らない）。正しい対処は (1) 既知の一時資材を staging から除外する repo 宣言、(2) それでも漏れた大量混入を **commit 前に決定的に検出して halt する**量ガード、の二層である。

## 現状コードの前提

- `src/core/step/write-scope.ts:33-53` — `GUARDED_WRITE_STEPS`（implementer / build-fixer / code-fixer / test-materialize / adr-gen）は staging mode "guarded" ＝ worktree 全変更 stage。他 step は "scoped"（宣言出力のみ）
- `src/core/step/commit-push.ts:602-605` — guarded staging は git status 由来の changedPaths を全列挙して `git add -A -- <paths>` で stage（コメントに旧 bare `-A` 等価と明記）。untracked のビルド産物も対象になる
- `src/core/step/commit-push.ts:490,838` — scoped 経路（宣言出力の pathspec 限定 stage）は既存
- `src/core/step/bite-evidence/test-file-selection.ts` — 依存なしの glob 照合 `matchesGlob`（`**/` / `*` / `.` 厳密リテラル）が既存。現在は bite-evidence 専用の置き場にある
- `src/config/schema/types.ts:236-248` — `PipelineConfig` は `maxRetries` / `fast` のみ。staging 関連の設定は存在しない
- `src/config/schema/validation.ts` — `verification.scopedTestPatterns`（非空文字列配列の validation）の前例あり
- `src/core/step/write-scope.ts:64-74` — `protectedCanonPaths`（request / spec / design / tasks / test-cases / attestation）が forbidden 検査の対象

## 要件

1. **staging 除外パターン設定を追加する**。`pipeline.stagingExcludePatterns?: string[]`（glob）。guarded staging の stage 対象列挙からパターン一致 path を除外する（stage しない・worktree には残す）。既定値は**空**（既定では何も除外しない — 対象 repo の .gitignore が第一防衛線であり、既定除外が意図された成果物を黙って落とす事故を作らない）。glob 照合は既存 `matchesGlob` を共通 util へ移設して再利用し、**新規依存を追加しない**。bite-evidence 側も移設先を参照する（単一実装の共有）
2. **除外は write-scope 検査を迂回できない**。forbidden path（protectedCanonPaths 等）の違反検査は**除外適用前**の全変更に対して行う。除外パターンが canon path に一致しても「stage されない」だけで「検査されない」にはならない。除外設定による scope 強制の fail-open を構造的に封じる
3. **量ガード（fail-closed の背止め）を追加する**。guarded staging で除外適用後の stage 対象件数が閾値 `pipeline.maxStagedFiles`（既定 2000）を超える場合、commit せず step を halt（escalation）する。メッセージには総件数と件数上位のディレクトリ（集計）を列挙し、「一時資材なら stagingExcludePatterns / .gitignore へ、正当な大変更なら maxStagedFiles の引き上げ」の出口を案内する。push 前に決定的に止まるため、巨大 pack の HTTP 400 は発生源で消える
4. **config validation と docs を追随させる**。`stagingExcludePatterns` は非空文字列の配列のみ許容、`maxStagedFiles` は正の整数のみ許容（違反は CONFIG_INVALID）。`docs/configuration.md` に両設定の用途・既定値・guarded steps にのみ効くことを記載する

## スコープ外

- scoped staging（宣言出力 pathspec）経路の変更 — 除外・量ガードは guarded mode のみに適用する
- push の transient failure（5xx / network）retry 機構 — 400 の原因は本 request で発生源から消える。retry は別件
- バイトサイズ閾値（単一巨大ファイルの検出）— 件数閾値で今回の事故クラス（依存ツリー混入）は覆う。サイズ系は将来 request
- 対象 repo の .gitignore の自動編集・agent prompt への指示追加

## 受け入れ基準

- [ ] 除外テスト: untracked の `.cargo-tmp/**` / `vendor/**` 相当ツリーが `stagingExcludePatterns` 設定時に stage されず worktree に残ること、未設定時は従来通り全 stage されること、をテストで固定する
- [ ] scope 迂回封じテスト: 除外パターンに canon path（例 `specrunner/changes/**`）を含めても forbidden 検査が発火して halt すること、をテストで固定する
- [ ] 量ガードテスト: 閾値超過で commit されず halt（escalation）になり、メッセージに総件数と上位ディレクトリ集計が含まれること、閾値以下は従来通り commit されること、をテストで固定する
- [ ] 除外と量ガードの合成テスト: 除外で閾値以下に収まる場合は halt しないこと、をテストで固定する
- [ ] `matchesGlob` が共通 util の単一実装であり、bite-evidence と staging の両方が同一実装を import していることを import 構造で保証する
- [ ] config validation: `stagingExcludePatterns: []` の要素空文字列・非文字列、`maxStagedFiles: 0` / 負値 / 非整数が CONFIG_INVALID になることをテストで固定する
- [ ] 新規 runtime 依存（glob ライブラリ等）が package.json に追加されていない
- [ ] 既存テストは無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: 二層防御 — repo 宣言の除外（既知の一時資材）＋ 量ガード（未知の大量混入の fail-closed 検出）。除外だけでは未知パターンに漏れ、量ガードだけでは既知資材のたびに halt して煩い
- **採用**: 除外の既定は空。「安全な既定」とは何も黙って落とさないこと。`verification.scopedTestPatterns`（repo が runner と対で宣言する）と同じ「repo 宣言 + 安全な既定」の形
- **採用**: 量ガードは除外適用後の件数に対する commit 前検査。push の失敗（事後・回復困難）を staging の halt（事前・出口案内付き）に変換する
- **却下**: agent に一時資材の置き場や除外を自己申告させる — 自己申告が staging の入力になる fail-open（bite-evidence の materialize 自己申告案と同じ理由で不採用）
- **却下**: 既定除外リスト（`.cargo-tmp` 等の内蔵）— エコシステム固有名の内蔵は際限がなく、意図された成果物と衝突した時に黙って落ちる。repo 宣言に置く
- **却下**: push retry の追加 — 原因（pack サイズ）に対して無効。発生源で止める
- **却下**: glob ライブラリ追加 — 依存極小方針に反する。既存 `matchesGlob` の共有で足りる
