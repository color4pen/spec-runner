# job 終端処理を slug 正本に一本化する

## Meta

- **type**: spec-change
- **slug**: finalize-job-on-slug-state
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

job state の正本は slug ディレクトリ（`specrunner/changes/<slug>/`）にある。しかし job 終端まわりの一部が legacy の jobId ストア（`.specrunner/jobs/<jobId>/`）を参照したままで、正本と乖離する。

- archive の最終遷移（`markJobArchived`）は `new JobStateStore(jobId, repoRoot).load()` で jobId ストアを読む。run 中の state 更新は worktree 配下と slug 正本に書かれるため、main 直下の `.specrunner/jobs/<jobId>/state.json` は job 作成時（`status=running` / `step=init`）のまま更新されない。結果、archive の最終遷移が `running → archived` の不正遷移となり失敗する。
- finishable gate は slug 正本（`awaiting-archive`）を読んで通過するのに、最終遷移は jobId ストア（`running`）を読むため、gate 通過後に遷移失敗するという不整合が生じる。
- status が `archived` に切り替わらないため、終端済みの job が `job ls`（default）から消えず `awaiting-archive` のまま残る。
- pipeline の commit-push は step 単位で実行され、終端 phase 完了後に commit が走らない。終端時点の `events.jsonl` / `state.json` / 成果物が branch に乗らないことがある。

## 要件

1. archive の最終遷移は slug 正本の state を読み・遷移・永続化する。jobId-only の legacy ストアに依存しない。
2. finishable gate と最終遷移は同一の state ソース（slug 正本）を参照する。gate 通過後に遷移が失敗しないこと。
3. pipeline 終端 phase 完了後、slug 正本（`state.json` / `events.jsonl` と終端成果物）が branch にコミットされる。
4. status が `archived`（終端）になった job は default の `job ls` に表示されない。
5. 既に archive 済み（folder 移動・push 済み）だが status が `awaiting-archive` のまま取り残された job を、`job archive` の冪等な再実行で `archived` まで完了できる。新規コマンドは追加しない。

## スコープ外

- jobId ストア（`.specrunner/jobs/`）の machine-local cache としての役割の是非・完全廃止
- 取り残し job 整理のための新規コマンド（`job reconcile` 等）の追加 — 既存 `job archive` の冪等な再実行で代替する
- daemon 化 / CI ネイティブ実行

## 受け入れ基準

- [ ] slug 正本が `awaiting-archive` の job を archive すると最終遷移が成功し status が `archived` になる
- [ ] archive 後、その job が `job ls`（default）に表示されない
- [ ] finishable gate と最終遷移が同じ state を読み、gate 通過後の遷移失敗が起きない
- [ ] 終端 phase 完了後、最終 `state.json` / `events.jsonl` が branch にコミットされている
- [ ] archive 済み（folder 移動済み）で status が `awaiting-archive` の job に `job archive` を再実行すると `archived` になる（新規コマンド不要）
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

TBD
