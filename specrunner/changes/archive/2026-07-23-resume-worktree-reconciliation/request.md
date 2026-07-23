# resume が中断 attempt の残骸を機械的に後始末する — halt→resume 回復契約

## Meta

- **type**: spec-change
- **slug**: resume-worktree-reconciliation
- **base-branch**: main
- **adr**: true

## 背景

step 実行中の停止（write-scope violation halt / crash / process kill）は worktree に未コミットの step 成果物を残すことがある。現状の resume はこの残骸を後始末しないため、次の step で write-set 検査が残骸を当該 step の宣言外書込として誤帰属し、store-fail → halt を再生産する。operator が残骸を手動削除するまで自律的に前進できない。

実運用 run の journal で確認された実例: 中断された spec-review attempt が残した `spec-review-result-002.md` が、resume 後の spec-review（iteration 003 を宣言）の write-set 検査で「Forbidden paths changed」として halt を引き起こした。

停止の態様（正常 halt / crash / kill）によらず、halt 側の cleanup 実行は保証されない。したがって後始末の責務は resume 側に置き、resume を単一の回復点として「一貫した開始状態の機械的確立」を契約にする。

## 現状コードの前提

- src/core/command/resume.ts:268-328 — resume の dirty 検査は protected canon paths に限定されている（apply-canon gate）。canon dirty は `--apply-canon` で operator 適用 commit になるか fail-closed で停止する。非 canon の dirty / untracked ファイルは無検査で step 開始に進む
- src/core/resume/apply-canon.ts:50 — dirty 検出は `git status --porcelain -z --no-renames -- <protectedCanonPaths>` で canon paths に scope されている
- src/core/step/commit-push.ts:92-96 — write-set 検査には pre-staged ファイルを「step の変更ではない」と識別して residual halt から除外する仕組みが存在するが、untracked / unstaged の残骸には適用されない
- src/core/step/commit-push.ts:53-79 — 違反内容を `.specrunner/local/<slug>/` （machine-local、commit されない）へ退避する quarantine の仕組みが既に存在する
- src/core/pipeline/round-git-scope.ts:109 — `pipelineManagedPaths(slug)` が change folder 配下の pipeline 管理パス集合を定義している

## 要件

1. resume は step 開始前に worktree を機械的に reconcile し、前回停止の態様（正常 halt / crash / process kill）に依存しない一貫した開始状態を確立する
2. reconcile は dirty / untracked パスを次の 3 クラスに分類して処理する:
   - **protected canon paths**: 既存の apply-canon gate の挙動を変更しない（`--apply-canon` で operator 適用 commit、無指定なら fail-closed 停止）
   - **pipeline 管理成果物**（change folder 配下の step artifacts。result ファイル等）: 内容を `.specrunner/local/<slug>/` に quarantine 退避した上で worktree から除去し、HEAD の clean 状態から step を開始する
   - **上記以外の非管理パス**（src/ 等）: 現状挙動を維持する（本 request では処理を変更しない）
3. 除去は必ず退避を伴う（evidence を失わない）。退避の失敗時は除去せず fail-closed で停止する
4. この reconcile により、中断 attempt の残骸が次 step の write-set 検査で宣言外書込として誤帰属される経路を閉じる
5. reconcile は resume の全経路（既定 / `--from` / `--apply-canon` 併用）で一貫して実行される。経路による素通りを作らない
6. 回復契約（分類 × 処理 × 実行タイミング）を docs に 1 ページで明文化する

## スコープ外

- 非管理パス（src/ 等）の dirt 処理の変更 — crash 途中の実装系 step が残す作業中ファイルへの介入は自律性を損なう。現状挙動の維持を契約に明文化するに留める
- write-set 検査ロジック自体の変更（検査の除外は fail-open 方向の緩和であり採らない）
- halt 側での cleanup 追加（crash / kill で実行が保証されない）
- step の output contract 不満足（test-materialize 等）による halt の扱い

## 受け入れ基準

- [ ] 中断 attempt が残した untracked な step result ファイルがある worktree からの resume で、残骸が quarantine に退避・除去され、後続 step が write-scope violation なしで完走することを regression test で固定する（halt → 残骸 → resume の実経路を辿る）
- [ ] quarantine 退避の失敗時に除去せず fail-closed で停止することをテストで固定する
- [ ] 残骸の無い worktree からの resume が reconcile を no-op として成功すること（冪等性）をテストで固定する
- [ ] protected canon paths の dirty に対する apply-canon gate の既存テストが無変更で green
- [ ] 回復契約が docs に明文化される（分類 × 処理の対応表を含む）
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: resume 時 reconcile（単一回復点）。halt 側 cleanup ではなく resume 側に置く理由は、crash / kill では halt 側の実行が保証されず、resume がすべての停止態様の合流点であるため
- **採用**: quarantine + 除去。既存の quarantine 機構（`.specrunner/local/<slug>/`）を再利用し、evidence 保全と clean な開始状態を両立する
- **却下**: write-set 検査側で「開始時に既に dirty だったパス」を除外する — 検査の緩和は fail-open 方向であり、sole-committer の合成 commit に残骸が乗る汚染も残る
- **却下**: 非管理パスの dirt への fail-closed 停止 — crash 途中の実装系 step の残骸のたびに operator 介入が必要になり、自律収束の目的に反する
