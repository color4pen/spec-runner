# job 一覧が archive 全件をロードし、履歴の長さに比例して遅くなる

## Meta

- **type**: bug-fix
- **slug**: job-list-archive-skip
- **base-branch**: main
- **adr**: false

## 背景

`job ls` は既定で archived job を表示しないが、表示しない archived の state を毎回全件ロードしてから捨てている。実測: archive 326 件 / 41MB の現在、表示 0 件の `job ls` に 2.5 秒かかる。archive は単調増加するため、このコストは履歴と共に線形に成長する（1 日約 6 件ペースで 1 年後は推定 7 秒超）。

同じロードを inbox run（cron tick、5 分ごと）も払っており、無人ループの足回りが履歴の長さに比例して鈍る構造になっている。

## 現状コードの前提

- `JobStateStore.list` は (1) active changes (2) **archived states** (3) worktree states (4) machine-local sidecar の順に全件ロードして合成する（`src/store/job-state-store.ts:203` のコメント、archive 走査は `src/store/job-state-store.ts:237-258`）。archive の各エントリは state.json + events.jsonl の split layout 読み込み（journal projection 再構成）を伴う
- フィルタはロードの後: `runPs` は `JobStateStore.list` の戻りを status で絞る（`src/cli/ps.ts:130-145`）。既定は非終端のみ、archived は `--all` または `--status` 指定時のみ表示される
- inbox run は tick ごとに `JobStateStore.list` を呼ぶ（`src/core/inbox/run-inbox.ts:86` および `src/core/inbox/run-inbox.ts:331`）。inbox の reconcile は archived job を一切使わない
- cancel / resume / finish / exit-guard も同じ `list` を経由する（archived 不要）

## 要件

1. `JobStateStore.list` に archived ロードの要否を制御するオプション（既定: ロードしない）を追加し、不要時は archive ディレクトリの走査自体をスキップする
2. archived が必要な呼び出し元（`--all`、`--status` が終端 status を含む場合の表示系）だけがオプトインする
3. 既定の `job ls` / `--active` / inbox tick の実行コストが archive 件数に依存しない
4. `--all` / `--status archived` の表示内容は現行と完全一致する

## スコープ外

- archive の git 履歴蓄積（clone サイズ）への retention 方針
- `.specrunner/local/` sidecar の掃除（別 request）
- jobId → slug 解決（local-job-index）の index 化

## 受け入れ基準

- [ ] archive を大量に置いた fixture で、既定の `job ls` の archive ロード回数がゼロであることをテストで固定する
- [ ] `--all` で archived job が従来どおり表示される
- [ ] inbox run の経路で archived state がロードされない
- [ ] 既存テストが無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- フィルタを表示層からロード層（`JobStateStore.list`）に押し下げる。呼び出し元ほぼ全コマンドが同じ list を通るため、1 箇所の修正で全経路が直る
- 既定を「ロードしない」に倒す。archived を必要とする呼び出しは表示系の 2 経路だけであることを呼び出し元の全列挙で確認済み
