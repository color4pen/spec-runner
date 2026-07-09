# worktree job による main checkout への逃避書き込みを検出する

## Meta

- **type**: spec-change
- **slug**: main-checkout-write-detection
- **base-branch**: main
- **adr**: true

## 背景

worktree mode の job では、agent は job worktree 内でのみ作業する前提だが、claude-code adapter は tool のパス検査を持たないため（`permissionMode: "bypassPermissions"`、`canUseTool` 未使用）、Edit / Write / Bash いずれでも絶対パスで main checkout に書き込める。実際に、fast pipeline の run 中に agent が main checkout 側の `.specrunner/config.json` を直接編集する事象が発生した（worktree 側 branch には同変更が正当に commit されており、main 側への書き込みは逃避）。この書き込みは既存のどの機構でも検出されず、後日 `git pull` の失敗で偶然発覚した。

conformance の scope 検査は worktree 内の changed files（branch diff）だけを見るため、main checkout への直接書き込みは観測範囲外。main checkout の clean 検査は no-worktree mode の run 開始時にしか存在しない。本 request は、依存を追加せず（git コマンドのみ）、step 境界での状態比較により逃避書き込みを検出して escalation する backstop を追加する。

adapter 側の書き込みスコープ制限（SDK の許可機構によるパス制限）は別 request で行う。本 request は「制限をすり抜けた書き込みを検出する」層のみを扱う。

## 現状コードの前提

- `src/adapter/claude-code/agent-runner.ts:278-280` — `allowedTools: ["Read","Edit","Write","Bash","Grep","Glob"]` + `permissionMode: "bypassPermissions"`。パス制限なし
- `src/core/step/executor.ts:202` — `runAgentStep` が agent step の実行単位。`deps.cwd`（worktree path）で動作し、main checkout の path は保持していない
- `src/core/worktree/detection.ts:100-122` — worktree path から main checkout root を導出するロジックが既にある（`.git/specrunner-worktrees/` セグメントの解析）
- `src/core/worktree/manager.ts:56` — worktree は `<repoRoot>/.git/specrunner-worktrees/<slug>-<jobId8>/` に作られる
- `src/core/worktree/orphan.ts:178` — `git status --porcelain` を spawn で実行する既存パターンがある
- `src/core/pipeline/pipeline.ts:218,426,683` — run を中断して `awaiting-resume` + `resumePoint` を書く既存経路（escalation / iteration exhaustion）
- `src/core/step/scope-check.ts` — 機械検査の結果を Finding に合成して verdict に反映する既存パターン（checkpoint 限定）。本 request の検査は checkpoint ではなく agent step 境界で行う点が異なる
- `.specrunner/config.json:18` — `pipeline.fast.forbiddenSurfaces` に 4 surface（public-types / persisted-format / state-transitions / guard-config）の path が宣言されている
- `src/core/runtime/local.ts:288-294` — no-worktree mode の run 開始時のみ main checkout の clean 検査がある

## 要件

1. worktree mode の job において、agent を実行する step の前後で main checkout 側の監視対象 path の状態を比較し、step 実行中に生じた変更（内容変更・新規作成・削除）を検出する
2. 監視対象は「config の `pipeline.fast.forbiddenSurfaces` に宣言された全 path」+「`.specrunner/` 配下」とする。pipeline 種別（fast / standard / design-only）に関わらず監視する
3. 変更を検出した場合、run を継続せず escalation（`awaiting-resume` への遷移 + `resumePoint` 書き込み）とし、検出した path と変更種別を state に記録する。CLI 出力には、検出差分・操作者自身の並行編集である可能性・確認のうえ `job resume` する案内を含める
4. 変更が検出されない場合、run の観測可能な挙動は従来と同一である
5. no-worktree mode では本検査を行わない（workspace が main checkout 自身であるため）
6. 依存パッケージを追加しない。検査は git コマンド（`git status --porcelain` + pathspec 等）と既存 util のみで実装する

## スコープ外

- adapter 側の書き込みスコープ制限（`canUseTool` / sandbox によるパス制限）— 別 request
- main checkout 全体（監視対象外 path）の変更検出 — 操作者が main checkout で並行作業する運用が通常であり、全域監視は誤検出が常態化する
- 検出時の自動 revert・自動修復
- cli step（pr-create 等、agent を実行しない step）への検査追加
- forbiddenSurfaces 宣言スキーマの変更

## 受け入れ基準

- [ ] agent step 実行中に main checkout 側の監視対象 path が変更された fixture で、run が escalation（awaiting-resume + resumePoint）になり、検出 path が state に記録されることをテストで固定する
- [ ] 監視対象外 path の変更（例: 操作者による draft 追加）では escalation しないことをテストで固定する
- [ ] no-worktree mode で本検査が実行されないことをテストで固定する
- [ ] 変更なしの worktree run が従来どおり完走する（既存テスト無変更で green）
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: 監視対象を forbiddenSurfaces + `.specrunner/` に限定する。attended 運用では操作者が main checkout で並行編集するのが通常のため、全域の git status 比較は誤検出が常態化する。ガード価値が最も高いのは自己解除経路（guard 構成データ）であり、そこに絞る
- **採用**: step 境界での before/after 比較。検査タイミングが決定的で、agent や運用者の判断場面を増やさない
- **採用**: 検出時は escalation（人間の確認）。main checkout への書き込みは操作者自身の正当な編集の可能性があり、機械では帰属を判定できない
- **却下**: hooks・sandbox 等の外部ユーティリティへの依存 — 依存極小の方針に反する
- **却下**: fs.watch による常時監視 — プラットフォーム依存とリソースコストに対し、step 境界比較で検出時機として十分
- **却下**: 検出時の自動 revert — 操作者の正当な編集を破壊し得る。帰属判断は人間に返す
