# ADR-20260605: state を event journal / projection / liveness に分解し branch-borne にする

## ステータス

accepted。構造判断のみを定める。実装・移行・resume の振る舞いは in-loop change `minimal-state-slug-dir`（spec ＋ `specrunner/adr/`）が担う。

## コンテキスト

`JobState` Aggregate は単一の monolithic 構造として machine-local（git 追跡外）に永続化され、性質の異なる 3 種が同居していた:

- append で失えない event（step attempt / transition / cost）
- 再計算できる projection（現在位置 ＝ step / status / resumePoint）
- 別マシンで無効な machine-local 値（worktreePath / pid / session）

この同居は 2 つの構造的問題を生む。(1) state が git 外のため作業ディスクが使い捨てられる環境で再開できない。(2) event を毎回 rewrite する単一ファイルに載せるため、書き込み中断が event を破損しうる。

## 決定

- **D1**: `JobState` Aggregate を durability で 3 分解する ― event journal（append-only truth）/ projection（rebuildable cache）/ liveness（machine-local, Aggregate 外）。
- **D2**: truth（journal `events.jsonl` ＋ cost `usage.json`）と projection（`state.json`）を branch-borne（`changes/<slug>/`、git 追跡・step ごと commit）に置く。git を唯一の durable source とする。
- **D3**: machine-local liveness（worktreePath / pid / session）を Aggregate から外し、machine-local sidecar（`.specrunner/local/<slug>/`、gitignored）へ分離する。losable・git から再生成。
- **D4**: identity を分離する ― slug ＝ 作業単位の identity（配置キー）、jobId ＝ run/attempt の identity（branch / worktree 名に内在）。

## 構造的含意

- **Aggregate 境界の再定義**: 単一 JobState → event journal（truth）/ projection（cache）/ liveness（Aggregate 外）。`domain-model.md` §Aggregate に反映。
- **不変条件**（`domain-model.md` 側に昇格、歯による機械強制は in-loop change が realize する）:
  - `events.jsonl` は append-only ＝ truth。projection は journal の fold で再構成可能（truth でない）。
  - liveness（worktreePath / pid / session）は Aggregate に属さない（losable・再生成・branch に同伴しない）。
  - state は branch-borne ＝ git が唯一の durable source。
  - resume・routing が読む `verdict`・`toolResult` は journal の fold で保持。
  - `StepOutcome.fileContent` を持たない（truth ＝ 実ファイル）。`modelUsage` は cost ledger `usage.json` に分離。
- **層・依存（DSM）は不変**: persistence 層の内部構造変更。`JobStateStore` は standalone Repository のまま（B-3 / §5-4）。
- **単一 mutator 不変は維持**: Aggregate の変更は `JobStateStore` 経由のみ。

## 検討した代替案

- **machine-local 単一 JSON を維持**: CI 等の使い捨て環境で resume 不可（git 外）。event を rewrite blob に載せるため書き込み中断で破損しうる。却下。
- **state を外部 DB / 常駐プロセスに置く**: 依存・運用が増え、project-local・依存極小・非デーモンの方針に反する。却下。
- **jobId をディレクトリキーに維持**: branch 名が slug を含む branch-borne と不整合で、作業単位 identity が分散する。slug をキーとし jobId を attempt identity に降格。

## 結果

- **Positive**: git だけが durable state（clone / CI checkout で完全・cross-env resume）。append journal による event 破損耐性。state が machine-portable。
- **Negative**: truth（journal）と cache（projection）の 2 表現を持つ（fold で整合）。machine-local sidecar を git から rebuild する経路が必要。

---

> 移行手順・resume の fold アルゴリズム・routing 等の振る舞いは in-loop change `minimal-state-slug-dir` が持つ。本 ADR は構造のみで、振る舞いは参照に留める。
