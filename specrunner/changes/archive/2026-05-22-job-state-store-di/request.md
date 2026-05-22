# JobStateStore を依存注入に統一し pipeline の inline new を排除する

## Meta

- **type**: spec-change
- **slug**: job-state-store-di
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

`new JobStateStore(jobId)` がコードベース全体で 23 回・8 ファイルに散在しており、特に `src/core/pipeline/pipeline.ts` 単体で 7 回 inline 生成している（L93/203/213/278/296/367/470）。一方で `src/core/step/executor.ts` は `getStore()` で 1 インスタンスをキャッシュし、`spawnFn`/`sleepFn` は外部から注入できる構造になっている。

つまり「DI する依存」と「実行中に素 new する依存」が同一レイヤー内で混在しており、設計意図が一貫していない。実害は testability に出る:

- `JobStateStore` の constructor は `jobId` のみを取り、内部で XDG パスを解決してファイル I/O を行う。pipeline は実行中に直接 new するため、テストで永続化分岐（loop exhaustion・escalation・transition 時の persist）を差し替えられない。
- 1 回の pipeline run では jobId は不変なのに、同一 jobId のインスタンスを 7 回作り直している。

この不整合を、executor 側で既に成立している DI パターンに揃えて解消する。

## 要件

1. `PipelineDeps` に `storeFactory: (jobId: string) => JobStateStore` を追加し、pipeline run の中で `JobStateStore` を inline `new` せず `deps.storeFactory(jobState.jobId)` 経由で取得する。単一インスタンス注入ではなく factory 注入とする（`buildDeps` は jobId を引数に取らず、jobId が確定するのは prepare 後のため。`spawn` と同じく省略不可とし leaky default を作らない）。
2. composition root は `RuntimeStrategy.buildDeps()`（`local.ts` / `managed.ts`、`spawn: spawnCommand` を注入しているのと同じ場所）に置く。CommandRunner を root にして runtime 抽象を貫通させない。
3. `executor` の `getStore()` キャッシュは「同一 jobId の重複構築回避」という別責務として残し、内部の `new JobStateStore` のみ `deps.storeFactory(jobId)` 呼び出しに置換する。これにより executor / pipeline が同一の注入された factory を共有する（executor だけ DI で pipeline は素 new という非対称を解消）。
4. テストから差し替え可能にする。`storeFactory` を in-memory fake（load/persist/update を持つ最小オブジェクトを `satisfies` で構造的に JobStateStore へ合わせる）に差し替え、pipeline / executor の永続化分岐を観測・抑制できること。既存の結合テストは実 store のままでよく、テストヘルパー側に `(id) => new JobStateStore(id)` の default を 1 箇所だけ置く。
5. 注入 seam の契約を delta spec に記述する。主: `specrunner/changes/job-state-store-di/specs/step-execution-architecture/spec.md`（「JobStateStore は storeFactory 経由で注入され inline new しない」）。従: `specrunner/changes/job-state-store-di/specs/pipeline-orchestrator/spec.md`（deps 構築への storeFactory 追加）。`job-state-store` capability は触らない（store の責務と注入方法を混同しない）。
6. `JobStateStore` の port 化（interface 抽出）はしない。具象 factory 注入で足りる。
7. `src/state/store.ts` の `@deprecated` 関数（loadJobState / updateJobState など）は本変更で触らない。pipeline run 経路では使われておらず、注入対象でもない。

## スコープ外

- JobStateStore の永続化フォーマット（JSON / XDG パス）・public メソッド契約の変更
- state schema（JobState / StepRun）の変更
- `core/cancel`・`core/finish`・`core/command/resume`・`core/command/runner`（L91/136/155）配下の `new JobStateStore`。これら CommandRunner 層およびコマンド経路は `PipelineDeps` チェーンに接続されていない短命経路で、巻き込むと deps 構築の新設が必要になり本変更の凝集を壊す。ただし `storeFactory` の型は export し、別 request で同じ型に乗れる形にしておく。
- ProgressDisplay の core→cli 逆参照（別 request `core-layer-boundary-fix` で扱う）

## 受け入れ基準

- [ ] pipeline run 経路（pipeline.ts / executor.ts）で `JobStateStore` を inline `new` していない（grep で確認可能）
- [ ] pipeline と executor が同一の注入された store 依存を共有している
- [ ] 永続化分岐をモック store で検証する test が追加されている
- [ ] 注入 seam が delta spec に記述されている
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

module-architect レビュー済み（DI/モジュール観点）:

- **注入の形**: `(jobId) => JobStateStore` factory に確定。単一インスタンス注入は却下。理由: `buildDeps(config, request, slug, workspace)` は jobId を引数に取らず、jobId が確定するのは prepare 後。インスタンス注入は composition root のシグネチャ変更を強制し結合が増える。factory なら deps は jobId 非依存で構築でき、cancel/finish/resume（複数 jobId）とも同一 seam で将来統一できる。
- **composition root**: `RuntimeStrategy.buildDeps()`（local.ts / managed.ts）に確定。`spawn: spawnCommand` を注入しているのと同じ場所で、executor の既存 DI 経路の起点。CommandRunner を root にすると runtime strategy 分離が崩れる。
- **port 化**: しない。単一具象実装であり、テスト目的は永続化分岐の観測/抑制。factory を fake に差し替えれば達成でき、interface 抽出は over-abstraction。
- **触る capability spec**: `step-execution-architecture`（主）+ `pipeline-orchestrator`（従）。`job-state-store` は触らない（注入は consumer の関心であり store の関心ではない）。
- **scope**: cancel/finish/resume の new はスコープ外で正。ただし `storeFactory` 型を export し将来統一可能にしておく。
