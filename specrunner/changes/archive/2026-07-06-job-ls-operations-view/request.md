# job ls を運用一覧にする — 区分表示・escalation の可視化・次アクションの提示

## Meta

- **type**: new-feature
- **slug**: job-ls-operations-view
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

無人運用では複数 job が並走し、人の関心は「いまどれが動いていて、どれが自分の対応を待っていて、次に何を打てばよいか」に集約される。現状の `job ls` はフラットな表で、この 3 つの問いに答えるには status の意味（escalation は `awaiting-resume` に埋まっている・merge 待ちは `awaiting-archive`）と対応コマンドの知識が必要で、実質作者専用になっている。

一覧を状態区分で構造化し、escalation の発生元と次に打つコマンドを行に出すことで、「一覧を見れば次の操作がわかる」状態にする。

## 現状コードの前提

- `src/cli/ps.ts:123-194`: `runPs` が `JobStateStore.list` で全 job を列挙しフラットな表（JOB_ID / SLUG / STEP / STATUS / BRANCH / AGE、`:170-183`）を出す。`--active` / `--all` / `--status <単一値>` フィルタ（`:133-144`）。`--json` フラグは無い。
- `src/cli/ps.ts:156-165,99-113`: `awaiting-archive` の job は GitHub PR の merge 状態を確認し `awaiting-archive (PR merged, run archive)` と表示する既存機構がある。
- `src/cli/ps.ts:190` + `src/core/resume/safety.ts:40-67`: `running` の staleness（プロセス死亡）は `isStaleRunning` で検出済みで `running (stale?)` 表示がある。
- `src/state/schema.ts:5`: `JobStatus` は `running | awaiting-resume | awaiting-archive | failed | terminated | archived | canceled`。**escalation という status は無い。**
- `src/core/step/judge-verdict.ts:35-37`、`src/core/step/executor.ts:824,834,856`、`src/core/inbox/run-inbox.ts:291-316`: escalation は step verdict（`"escalation"`）であり、job status としては `awaiting-resume` に遷移する。escalation の発生元は `state.steps[*].outcome.verdict` から導出できる。
- `src/state/lifecycle.ts:36-48`: `failed` / `terminated` / `awaiting-resume` → `running` の遷移が許可されており、`src/cli/resume.ts:76-` の `job resume` が再着手動詞として既に機能する（stale running の自動回復 `resume.ts:112-133` を含む）。
- `tests/finish-ps-integration.test.ts`、`tests/cli.test.ts`: `job ls` の出力を参照する既存テストがある。

## 要件

1. **`job ls` のデフォルト出力を状態区分付きにする。** 区分は「実行中」（running、stale 注記含む）/「対応待ち」（awaiting-resume）/「merge・archive 待ち」（awaiting-archive、PR merged か否かの既存注記を維持）/「失敗・停止」（failed / terminated）。空の区分は表示しない。
2. **「対応待ち」の行に escalation の発生元を表示する。** `state.steps[*].outcome.verdict === "escalation"` である最後の step 名を行に出す。escalation 由来でない awaiting-resume（poll timeout 等）は step 名なしでよい。理由の詳細表示はスコープ外（`job show` へ誘導）。
3. **各行に次アクションを表示する。** 状態から一意に決まる推奨コマンド（例: 対応待ち → `job resume <slug>`、PR merged の awaiting-archive → `job archive <slug>`、stale running → `job resume <slug>`）を行または区分単位で出す。
4. **`--json` フラグを追加する。** 区分・各 job の状態・escalation 発生元 step・次アクションを含む機械可読出力。
5. **既存フィルタの意味を維持する。** `--active` / `--all` / `--status` は現行のフィルタ意味を保つ（表示形式は新形式でよい）。

## スコープ外

- 新しい subcommand・動詞の追加（`job retry` / `job list` 等は作らない。再着手は既存 `job resume` に委ねる）
- `JobStatus` への新 status 追加・永続 schema（state.json）の変更
- escalation 理由の本文要約（findings の内容表示）
- リアルタイム更新（watch / TUI）
- inbox の挙動変更

## 受け入れ基準

- [ ] fixture の JobState 群（running / stale running / escalation 由来 awaiting-resume / 非 escalation の awaiting-resume / awaiting-archive / failed）に対する区分表示・escalation 発生元 step・次アクションの出力がテストで固定される
- [ ] `--json` 出力のトップレベルキー集合がテストで固定される
- [ ] `--active` / `--all` / `--status` のフィルタ挙動（対象集合）が現行と同一であることがテストで固定される（表示形式変更に伴う既存テストの期待値更新は可）
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **`job ls` の強化とし、新コマンドを作らない（採用）**: 一覧が 2 つになると「どちらを見るか」という新しい判断を生む。動詞は増やさない方針に従う。
- **`job retry` を新設しない（採用）**: `failed` / `terminated` / stale running からの再着手は `job resume` が lifecycle 上すでにカバーしている（`lifecycle.ts:36-48`）。同義語の動詞追加は概念の重複であり、次アクション列での誘導で足りる。
- **escalation は表示層で verdict から導出（採用）** / `JobStatus` に `escalated` を追加（却下: 永続 schema と遷移表の変更はこの目的に対して過大で、既存 job の migration を要する）。
