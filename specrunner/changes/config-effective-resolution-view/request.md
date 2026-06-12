# step 実効設定（model 等）の解決結果と適用 source を可視化するコマンド面を追加する

## Meta

- **type**: new-feature
- **slug**: config-effective-resolution-view
- **base-branch**: main
- **adr**: false

## 背景

step 設定は「user global（`~/.config/specrunner/config.json`）と project local（`.specrunner/config.json`）の deep merge」の上に「5 level の解決チェーン（step × requestType → step → defaults × requestType → defaults → stepdef ハードコード）」が乗る二段構造で、**global の step 個別設定が project の defaults に黙って勝つ**。

2026-06-12 の codex 実証で実害を観測した: project local に `steps.defaults.model: gpt-5.5` を設定して「全 step が gpt-5.5 で走る」と想定したが、user global に残っていた `steps.design.byRequestType.bug-fix.model: claude-sonnet-4-6`（level 1）が defaults（level 4）に優先し、design だけ別 provider で実行された。解決自体は仕様通りだが、**実効値とその出所を確認する手段がなく**、usage ログの事後分析と transcript の照合まで原因が特定できなかった。

## 現状コードの前提

- `src/config/store.ts:65,111` — user global → project local の deepMergeConfig。merge 後の config には「どの値がどちら由来か」の情報は残らない
- `src/config/step-config.ts:61-82` — `getStepExecutionConfig` の 5 level 解決。返り値は解決後の値のみで、どの level が効いたかは返さない
- `src/cli/doctor.ts` — 環境診断コマンドの既存実装（checks の追加面がある）。config の実効値表示は現状どのコマンドにもない
- step 一覧と requestType は既知の有限集合（pipeline descriptor / request type union）

## 要件

1. 各 step について「実効 model / maxTurns / timeoutMs」と「**どの source が効いたか**（global か project か × どの level か）」を表示するコマンド面を追加する。置き場（`doctor` への追加 / `config show` 等の新設）は design で決定する
2. 解決は requestType に依存するため、requestType を指定して表示できる（未指定時の挙動は design で決定）
3. 表示専用とし、解決ロジック（merge / 5 level チェーン）自体は一切変更しない

## スコープ外

- 解決チェーンの優先順位の変更（global per-step が project defaults に勝つのは仕様として維持）
- config schema の変更
- 設定の編集機能

## 受け入れ基準

- [ ] global per-step 設定が project defaults に勝つケース（今回の実害パターン）で、実効値と source が正しく表示されることをテストで固定する
- [ ] requestType 指定で byRequestType の解決結果が変わって表示されることをテストで固定する
- [ ] stepdef ハードコードに落ちる step（config 未設定）の source 表示をテストで固定する
- [ ] `typecheck && test` が green

## 関連

- 実害観測: 2026-06-12 の codex e2e 実証（job c812a533）で design step だけ意図しないモデルで実行され、原因特定に usage ログと SDK transcript の照合を要した
