# lineage event の outputs を実生成ファイルに対応付け、hash を実計算する

## Meta

- **type**: bug-fix
- **slug**: lineage-output-attribution
- **base-branch**: main
- **adr**: false

## 背景

各 step attempt の完了時に記録される lineage event は、その attempt が読んだ入力と生成した出力の対応を証跡として残すためのものである。しかし現行実装では、step 結果を state に追記した**後**に step の writes() を再計算して lineage を記録するため、iteration 依存のパス（nextIteration() でパスを算出する step）では iteration が +1 された**次回**のパスが outputs として記録される。実際に生成されたファイルではなく、存在しないファイルが証跡に載る。

さらに outputs / inputs の hash は計算されず null のまま記録されており、lineage が「どの内容を読み書きしたか」を証明できない。

実例（archive に保存済みの実 run）: spec-review の attempt が `spec-review-result-002.md` を生成した直後（endedAt と同一 timestamp）の lineage event が、outputs に `spec-review-result-003.md`（存在しないファイル）を hash: null で記録している。

## 現状コードの前提

- `specrunner/changes/archive/2026-07-20-packaged-smoke-contract/events.jsonl` line 115 — `{"type":"lineage","step":"spec-review",...,"outputs":[{"path":".../spec-review-result-003.md","hash":null}]}`。同 archive のファイル実体は `spec-review-result-001.md` と `spec-review-result-002.md` のみで 003 は存在しない。直前 line 114 の step-attempt event は `findingsPath: .../spec-review-result-002.md`・`endedAt: 2026-07-20T13:28:47.719Z` で、lineage event の ts と一致する
- `src/core/step/commit-orchestrator.ts` — step 結果の state への追記と lineage 記録を行う（追記後に writes() を評価する順序が原因。該当行は設計時に特定する）
- `src/core/step/spec-review.ts:89-93` — writes() は `specReviewResultPath(deps.slug, nextIteration(state, STEP_NAMES.SPEC_REVIEW))` で iteration 依存パスを算出する
- step-attempt event には `commitOid` が既に記録されている（同 events.jsonl line 114 に実例）

## 要件

1. lineage event の outputs は、**その attempt が実際に生成したファイル**を指すこと。state 追記の前に writes() を確定させるか、attempt 開始時点の iteration でパスを算出する。iteration 依存パスを持つ全 step（spec-review / code-review / conformance / request-review / custom-reviewer 等）で正しいこと。
2. lineage event の outputs / inputs の hash を実ファイル内容から計算して記録する（null 記録をやめる）。ファイルが存在しない input（任意入力）は hash 欠落を明示できる形式とする。
3. 過去の archive / 既存 events.jsonl の遡及修正は行わない。

## スコープ外

- 承認の revision 束縛（lineage hash を照合に使う機構は後続 request）
- lineage schema の拡張（フィールド追加は最小限。既存 reader の互換を壊さない）
- 並列 round 経路の lineage 変更（同一欠陥がある場合のみ同修正を適用し、それ以外は触らない）

## 受け入れ基準

- [ ] iteration 依存パスを持つ step を連続 2 iteration 実行するテストで、各 attempt の lineage.outputs が**各自の実生成ファイルパス**と一致することを固定する（1 回目 → -001、2 回目 → -002）
- [ ] lineage.outputs / inputs の hash が non-null で、実ファイル内容の hash と一致することをテストで固定する
- [ ] 修正前の挙動（追記後再計算で +1）に戻すと上記テストが fail することを破壊確認として記録する
- [ ] 既存テストは無改変で green（lineage の消費者は現状存在しないため挙動互換）
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: writes() の評価を state 追記前に行い、その結果を lineage 記録まで持ち回す（評価順序の修正）。パス算出ロジック自体（nextIteration ベース）は変更しない。
- **却下: writes() に「現 iteration」を渡す引数追加** — 全 step の writes() シグネチャ変更が波及する。評価タイミングの修正で十分。
- **却下: lineage 記録の削除** — 証跡の revision 束縛（後続 request）の基盤であり、修正して生かす。
