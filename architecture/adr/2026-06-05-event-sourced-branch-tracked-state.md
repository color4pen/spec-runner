# ADR-20260605: state を event journal / projection / liveness に分解し branch-borne にする

## ステータス

accepted。構造判断のみを定める。実装・移行・resume の振る舞いは in-loop change `minimal-state-slug-dir`（spec ＋ `specrunner/adr/`）が担う。

## コンテキスト

`JobState` Aggregate は単一の monolithic 構造として machine-local（git 追跡外）に永続化され、性質の異なる 3 種が同居していた:

- append で失えない event（step attempt / transition）
- 再計算できる projection（現在位置 ＝ step / status / resumePoint）
- 別マシンで無効な machine-local 値（worktreePath / pid / session）

この同居は 2 つの構造的問題を生む。(1) state が git 外のため作業ディスクが使い捨てられる環境で再開できない。(2) event を毎回 rewrite する単一ファイルに載せるため、書き込み中断が event を破損しうる。

## 決定

- **D1**: `JobState` Aggregate を durability で 3 分解する ― event journal（append-only truth）/ projection（rebuildable cache）/ liveness（machine-local, Aggregate 外）。
- **D2**: truth（journal `events.jsonl`）と projection（`state.json`）を branch-borne（`changes/<slug>/`、git 追跡・step ごと commit）に置く。git を唯一の durable source とする。cost（`usage.json`）は state ではない peer concern であり、本 Aggregate に含めない。
- **D3**: liveness（worktreePath / pid / session）は state でなく**実行時束縛（動的構造）**として扱い、永続しない。worktreePath は規約から導出、pid / session は実行ごと再生成。machine-local sidecar は設けない。
- **D4**: identity を分離する ― slug ＝ 作業単位の identity（配置キー）、jobId ＝ run/attempt の identity（branch / worktree 名に内在）。

## 構造的含意

- **Aggregate 境界の再定義**: 単一 JobState → event journal（truth）/ projection（cache）/ liveness（Aggregate 外）。`domain-model.md` §Aggregate に反映。
- **不変条件**（`domain-model.md` 側に昇格、歯による機械強制は in-loop change が realize する）:
  - `events.jsonl` は append-only ＝ truth。projection は journal の fold で再構成可能（truth でない）。
  - liveness（worktreePath / pid / session）は state でない ―― 論理↔物理の実行時束縛（動的構造）。永続せず各 run で導出/再生成（worktreePath は規約から、pid / session は新規）。
  - state は branch-borne ＝ git が唯一の durable source。
  - resume・routing が読む `verdict`・`toolResult` は journal の fold で保持。
  - `StepOutcome.fileContent` を持たない（truth ＝ 実ファイル）。`modelUsage` は state でなく Aggregate 外の cost 追跡ファイル `usage.json`（`usageStore` が書く）へ分離。
- **層・依存（DSM）は不変**: persistence 層の内部構造変更。`JobStateStore` は standalone Repository のまま（B-3 / §5-4）。
- **単一 mutator 不変は維持・強化（B-11 候補・ratify 待ち）**: Aggregate の変更は `JobStateStore` 経由のみ。物理分割後はこれが強化され、journal への append と projection の overwrite を `JobStateStore` 経由のみに限る（外部の直 write は projection を truth と乖離させる）。B-9（status 単一 mutator）と同型。歯（`tests/unit/architecture/core-invariants.test.ts`）と `model.md §4` 昇格は in-loop change が realize する（それまで ratify 待ち）。

## 検討した代替案

- **machine-local 単一 JSON を維持**: CI 等の使い捨て環境で resume 不可（git 外）。event を rewrite blob に載せるため書き込み中断で破損しうる。却下。
- **state を外部 DB / 常駐プロセスに置く**: 依存・運用が増え、project-local・依存極小・非デーモンの方針に反する。却下。
- **jobId をディレクトリキーに維持**: branch 名が slug を含む branch-borne と不整合で、作業単位 identity が分散する。slug をキーとし jobId を attempt identity に降格。

## 結果

- **Positive**: git だけが durable state（clone / CI checkout で完全・cross-env resume）。append journal による event 破損耐性。state が machine-portable。
- **Negative**: truth（journal）と cache（projection）の 2 表現を持つ（fold で整合）。liveness を永続しないため、worktreePath 等を各 run で導出/再生成する。

---

> 移行手順・resume の fold アルゴリズム・routing 等の振る舞いは in-loop change `minimal-state-slug-dir` が持つ。本 ADR は構造のみで、振る舞いは参照に留める。
