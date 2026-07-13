# ADR-20260713: verification step の coverage config を step 実行直前に disk から再解決する

**Date**: 2026-07-13
**Status**: accepted

## Context

型定義のみのファイル（実行行なし）は coverage の lcov に `DA` レコードとして現れず、changed-line-coverage gate が fail-closed で「未 load（`not-loaded`）」と誤検出して verification を失敗させる。build-fixer はこれを `.specrunner/config.json` の `verification.coverage.exclude` に追加して正しく修正できる。

しかし config は `runPreflight`（`src/core/preflight.ts`）が `loadConfig(repoRoot)` を 1 回呼んで `PreflightResult.config` に格納し、以後 `deps.config` として pipeline 全体で不変に流れる設計だった。build-fixer が job worktree の `.specrunner/config.json` を disk 上で編集・commit しても、in-memory の `deps.config.verification.coverage` は job 開始時の値のままなので、同一 job 内の後続 verification（post-fixer reverification 等）に編集が反映されない。結果、正しい fix を加えても self-heal できず verification retry が枯渇して escalation する（resume＝新プロセスで config 再 load すると解消する）。

### 実行時のディレクトリ topology

- main checkout: `<repo>`（`deps.repoRoot`。preflight が config を読む起点）
- job worktree: `<repo>/.git/specrunner-worktrees/<slug>-<id>`（`deps.cwd`。verification の cwd）
- build-fixer の編集は **job worktree 側** の `.specrunner/config.json` に commit される（feature branch に着地）。main checkout 側の config は変わらない。

したがって「build-fixer の編集を読み直す」には `deps.cwd`（worktree）を起点とした再解決が必要であり、`deps.repoRoot`（main checkout）を読み直しても編集は見えない。

## Decision

### D1: config-read の timing を「job 開始時 1 回」から「verification 実行直前に coverage のみ再解決」に変える

`deps.config` 全体の load timing は変えず、**`VerificationStep.run` が `runVerification` を呼ぶ直前に `verification.coverage` だけを disk から再解決する**。実装は新ヘルパ関数 `reloadCoverageConfig(cwd)` として `src/core/verification/reload-coverage-config.ts` に独立させ、verification step からのみ呼ぶ。

再 load を「必要な step・必要な field」だけに絞ることで、gate 弱体化面を最小化する。全 config を毎 step 再 load する案（model 設定・pipeline 設定など無関係な config まで途中変更を許す）は要件に反するため採用しない。

### D2: 再解決する対象は `verification.coverage` 1 フィールドのみ

disk から再解決した config の `verification.coverage` のみを取り出し、effective config を `{ ...deps.config.verification, coverage: <再解決した coverage> }` として組み立てる。`verification.commands` を含む他フィールドおよび verification 以外の全 config は job 開始時の値を維持する。

`commands` を in-job で差し替え可能にすると、build-fixer が verification コマンド列（例: 失敗する test コマンドの除去）を同一 job 内で書き換えられ gate 弱体化面が広がる。報告事象は `coverage.exclude` に閉じるため `commands` は再 load 対象外とする。再 load 範囲を型（`CoverageConfig | undefined`）で固定することで、範囲がコードレビューで自明になる。

### D3: 再解決失敗は job 開始時 config へ fail-safe する

`reloadCoverageConfig` は例外を投げず `{ applied: boolean; coverage?: CoverageConfig }` を返す。`applied: false` のとき呼び出し側は `deps.config.verification.coverage`（job 開始時の値）をそのまま使う。

`applied: false` になる条件: repo-root 解決失敗・`loadConfig` の validation エラー（build-fixer が壊れた JSON を書いた等）・その他の I/O 例外。再 load は self-heal を助ける additive な強化であり、失敗時に verification を crash させたり gate を弱めたりしてはならない。build-fixer が壊れた config を commit した場合も、reload は不適用になりつつ config 自体は PR に残り人間レビューに載る。

### D4: 再解決の起点は verification の cwd（worktree）、project-local 存在を適用の gate にする

`reloadCoverageConfig(cwd)` は `cwd = deps.cwd ?? process.cwd()` を起点に `resolveRepoRoot(cwd)` → `loadConfig(repoRoot)` を行う（user global + project local の 2 層 overlay を再現）。ただし **`<repoRoot>/.specrunner/config.json`（project local）が存在するときのみ** 再解決結果を適用する。

project-local が無い cwd で常に適用すると、`loadConfig` が user-global のみを返すため、job 開始時に main checkout の project-local から得ていた coverage を取りこぼす回帰になり得る。build-fixer の編集は必ず `<worktree>/.specrunner/config.json` を作成/更新するので、その存在を「この cwd の project-local が権威である」signal として使い、存在時のみ適用する。

### D5: runtime 別の効き方を明示する

- **local runtime（dogfooding 対象・本変更の主対象）**: build-fixer が worktree の config を編集・commit → 同 worktree で verification が再解決 → `coverage.exclude` が反映されて self-heal 成立。
- **managed runtime**: build-fixer がクラウド sandbox で編集し origin/branch に push する。local worktree（`deps.cwd`）に編集が同期されない限り `reloadCoverageConfig` は disk 上の値（job 開始時と同じ、または project-local 不在で `applied: false`）を読むため、**今日の挙動から悪化しない**（no-regression）。managed での self-heal は本変更のスコープ外。

## Alternatives Considered

### Alternative 1: 全 config を毎 step 再 load する

- **Pros**: すべての config 変更が即座に反映され、coverage 以外の build-fixer 修正も in-job で効く。
- **Cons**: model 設定・pipeline 設定・verification.commands など、coverage と無関係な config まで途中変更を許す。build-fixer が verification コマンド列を書き換えて同一 job 内の verification を回避できる gate 弱体化経路が生まれる。architect 評価で却下済み。
- **Why not**: 再 load 対象範囲を限定して gate 弱体化面を最小化する要件に反する。

### Alternative 2: `runVerification` 内部で coverage を再解決する

- **Pros**: 呼び出し側（verification step）が再 load を意識しなくて済む。
- **Cons**: `runVerification`（`src/core/verification/runner.ts`）は config を引数で受ける純粋な配線層であり、repo-root 解決・config-store I/O を持ち込むと結合が増え、既存の runner テスト（config を注入）が壊れる。config timing の変更は step 層に閉じるべき。
- **Why not**: runner 層に I/O 副作用を持ち込む設計は層の責務分離に反する。timing 変更を step 層に限定する方が拡張・テストの両面で優れる。

### Alternative 3: 型のみファイルを coverage から自動除外する

- **Pros**: build-fixer が config を編集しなくても自動で解消するため in-job reload の仕組みが不要になる。
- **Cons**: lcov 上「未 load」は「実行行なし（型のみ）」と「テスト不足で未 load」を区別できない。自動除外は coverage gate の信頼性を損ない、意図しないテスト漏れを隠す恐れがある。architect 評価で却下済み。
- **Why not**: `exclude` 機構を使い、それを in-job で効かせる本方針の方が信頼性が高い。

### Alternative 4: `deps.repoRoot`（main checkout）を起点に再解決する

- **Pros**: worktree topology を意識しなくて済む。
- **Cons**: build-fixer の編集は job worktree 側に commit されるため、main checkout の config を読んでも編集が見えず self-heal しない。
- **Why not**: worktree topology の実態（D4 参照）と整合しない。

## Consequences

### Positive

- build-fixer が `verification.coverage.exclude` を正しく追加した後、同一 job 内の後続 verification が exclude を反映して self-heal できるようになる（resume が不要になる）
- 再 load 範囲を型で 1 フィールドに固定しており、gate 弱体化経路を構造で封じている
- config 変更は引き続き build-fixer の commit 経路を通じて PR に載り、人間レビュー可能性が保たれる
- fail-safe（D3）により、再 load の失敗が既存の verification 品質を下げることはない

### Negative

- verification step が毎回 1 回の追加 disk read（`git rev-parse` + config file 読み）を行う（verification 本体に比べ無視できるコスト）
- managed runtime では今回のメカニズムで self-heal しない（disk が build-fixer の編集を反映する環境限定）

### Known Debt / Open Questions

- managed runtime で build-fixer の config 編集を同一 job 内 verification に反映するには、agent step 後に local worktree へ branch を同期する別機構が必要。本変更のスコープ外とし、必要になれば別 request で扱う。

## References

- Request: `specrunner/changes/verification-config-reload/request.md`
- Design: `specrunner/changes/verification-config-reload/design.md`
- Spec: `specrunner/changes/verification-config-reload/spec.md`
- Implementation: `src/core/verification/reload-coverage-config.ts`・`src/core/step/verification.ts`
- Tests: `tests/unit/core/step/verification-config-reload.test.ts`・`tests/unit/core/verification/reload-coverage-config.test.ts`
