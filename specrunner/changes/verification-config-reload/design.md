# Design: build-fixer の config 編集を同一 job 内 verification に反映する（in-job coverage 再解決）

## Context

型定義のみのファイル（実行行なし）は coverage の lcov に `DA` レコードとして現れず、changed-line-coverage gate が fail-closed で「未 load（`not-loaded`）」と誤検出して verification を失敗させる（`src/core/verification/changed-line-coverage.ts:8, :98`）。build-fixer はこれを `.specrunner/config.json` の `verification.coverage.exclude` に追加して正しく修正できるが、同一 job 内では反映されない。

### 現状構造（変更の土台）

- **config は job 開始時に一度だけ load される**。`runPreflight`（`src/core/preflight.ts:48-49`）が `resolveRepoRoot(cwd)` → `loadConfig(repoRoot)` を 1 回呼び、結果が `PreflightResult.config` になる。
- その config は `CommandRunner.execute`（`src/core/command/runner.ts:167`）で `runtime.buildDeps(config, …)` に渡され、`deps.config` として固定される（`local.ts:615` / `managed.ts:299`）。以後 `deps.config` は pipeline 全体で不変。
- verification step は `deps.config.verification` をそのまま `runVerification` に渡す（`src/core/step/verification.ts:36`）。runner は受け取った `coverage` を gate へ引き渡す（`runner.ts:329, :333, :337`）。gate は `coverage.exclude` を尊重する（`changed-line-coverage.ts:91`）。
- build-fixer は verification 失敗後に呼ばれ、worktree 内の `.specrunner/config.json` を編集・commit できる（`src/core/step/build-fixer.ts`。PR に含まれ人間レビュー可能）。
- **問題の核**: build-fixer が disk（worktree の `.specrunner/config.json`）を書き換えても、メモリ上の `deps.config.verification.coverage` は job 開始時の値のままなので、同一 job 内の後続 verification（post-fixer reverification 等）は古い exclude で走り、self-heal できず verification retry が枯渇して escalation する。resume（＝新プロセス）だと config が再 load されて解消する。

### 実行時のディレクトリ topology（local runtime、dogfooding 対象）

- main checkout: `<repo>`（`deps.repoRoot` = `this.cwd`。preflight が config を読む起点）。
- job worktree: `<repo>/.git/specrunner-worktrees/<slug>-<id>`（`deps.cwd` = `workspace.cwd`。verification の cwd）。
- **build-fixer の編集は worktree 側の `.specrunner/config.json` に着地する**（feature branch に commit）。main checkout 側の config は変わらない。
- したがって「build-fixer の編集を読み直す」には **worktree（`deps.cwd`）の disk config を再解決する**必要がある。`deps.repoRoot`（main checkout）を読み直しても編集は見えない。

## Goals / Non-Goals

**Goals**:

- build-fixer が `.specrunner/config.json` を編集した後、同一 job 内の後続 verification が **`verification.coverage`** の更新を反映するようにする（要件 1）。
- 再 load の対象範囲を **`verification.coverage` のみ**に限定し、verification 無関係の config（さらには `verification.commands` 等の coverage 以外）が同一 job の途中で意図せず差し替わらないことを構造で保証する（要件 2）。
- config 変更が従来どおり PR に含まれ人間レビュー可能である性質を保つ（build-fixer の commit 経路は不変）。

**Non-Goals**（request のスコープ外を継承）:

- changed-line-coverage の fail-closed 判定ロジック自体の変更（`evaluateChangedLineCoverage` は不変）。
- merge-wait / archive 系。
- 型のみファイルを lcov から自動判定する仕組み（lcov 上「未 load」は untested と区別できないため扱わない）。既存の `exclude` 機構を in-job で効かせるだけに留める。
- managed runtime での self-heal 保証（後述 D5・Risks。本変更は disk-based で、disk が build-fixer の編集を反映する環境＝local worktree で機能する。managed は no-regression を保証するに留める）。
- `runVerification` / gate の signature 変更（runner は引き続き `coverage` を引数で受ける純粋な配線を保つ）。

## Decisions

### D1: 再 load の timing を「job 開始時 1 回」から「verification 実行直前に coverage のみ再解決」に変える

最重量部（config-read の timing 変更）の確定。`deps.config` 全体の load timing は変えず（他 step の config は job 開始時の値で不変を維持）、**verification step の実行直前に `verification.coverage` だけを disk から再解決する**。

- 実装位置は `VerificationStep.run`。`runVerification` を呼ぶ前に新ヘルパ `reloadCoverageConfig(verificationCwd)` を呼び、得た coverage を `deps.config.verification` に上書きした effective config を作って `runVerification` へ渡す。
- **Rationale**: 再 load を「必要な step・必要な field」だけに絞ると、gate 弱体化面（config 変更が同一 job 内で効く経路）を最小化できる。全 config を毎 step 再 load する案は、model 設定・pipeline 設定など無関係な config まで途中変更を許し、要件 2 に反する。
- **Alternatives considered**:
  - 全 config を毎 step 再 load → 却下（architect 評価済。gate 弱体化面が最大、要件 2 違反）。
  - `runVerification` 内部で再 load → 却下: runner は config を引数で受ける純粋な配線層で、repo-root 解決・config-store I/O を持ち込むと結合が増え、既存 runner テスト（config を注入）が壊れる。timing 変更は step 層に閉じる。
  - 型のみファイルを coverage から自動除外 → 却下（architect 評価済。lcov 上「未 load」は untested と区別できず信頼できない）。既存 `exclude` を in-job で効かせる本方針を採る。

### D2: 再 load の対象範囲は `verification.coverage` のみ（`commands`・非 verification は job 開始時の値を維持）

再解決した disk config から取り出すのは `config.verification.coverage` **1 フィールドだけ**。effective config は `{ ...deps.config.verification, coverage: <再解決した coverage> }` として組み立て、`deps.config` の他フィールド（`commands` を含む verification 内の他 key、および verification 以外の全 config）は job 開始時の値を保持する。

- **なぜ coverage のみで十分か**: 報告された self-heal 失敗は `coverage.exclude` に閉じる。gate は commands path / phases path のどちらでも `coverage.exclude` を尊重する（`runner.ts:333/337` → gate）。`commands` vs `phases` の dispatch（`runner.ts:332` の `verificationConfig?.commands !== undefined`）は coverage と独立なので、`commands` を job 開始時の値に固定しても coverage 再解決は両 path で一貫して効く。
- **なぜ `commands` を再 load しないか**: `commands` を in-job で差し替え可能にすると、build-fixer が verification コマンド列そのもの（例: 失敗する test コマンドの除去）を同一 job 内で書き換えられ、gate 弱体化面が広がる。報告事象は coverage に閉じるため、`commands` は再 load 対象から外す（要件 2 の「対象範囲を明示し、無関係 config を途中変更しない」を構造で満たす）。
- **Rationale**: 「再 load 対象範囲を明示」する最も強い形は、コード上で 1 フィールドしか取り出さないこと。範囲は型（`CoverageConfig | undefined`）で固定され、レビューで自明になる。
- **Alternatives considered**: `verification` ブロック全体（`commands` + `coverage`）を再 load → 却下: 弱体化面が広く要件 2 の趣旨に反する。coverage のみで報告事象は解消する。

### D3: 再 load 失敗・disk config 不整合は job 開始時の config へ fail-safe（verification を止めない・弱めない）

`reloadCoverageConfig` は例外を投げず、判別可能な結果 `{ applied: boolean; coverage?: CoverageConfig }` を返す。`applied: false` のとき呼び出し側は `deps.config.verification.coverage`（job 開始時の値）をそのまま使う。

- `applied: false` になる条件: repo-root 解決失敗、`loadConfig` の validation エラー（build-fixer が壊れた JSON を書いた等）、その他の I/O 例外。
- **Rationale**: 再 load は self-heal を助ける additive な強化であり、失敗時に verification を crash させたり gate を弱めたりしてはならない。job 開始時の config は preflight で validation 済みの既知の良い値なので、そこへ倒すのが最も安全（fail-closed 判定ロジックには触れない＝スコープ外を尊重）。build-fixer が壊れた config を commit した場合も、reload は不適用になりつつ config 自体は PR に残り人間レビューに載る。
- **Alternatives considered**: 再 load 失敗で verification を fail にする → 却下: 道具（config 再解決）の失敗で正当な verification を落とすのは過剰。既存の gate 側 fail-closed とは別レイヤの話。

### D4: 再 load 起点は verification の cwd（worktree）。project-local config の存在を再 load 適用の gate にする

`reloadCoverageConfig(cwd)` は `cwd = verificationCwd`（`deps.cwd ?? process.cwd()`）を起点に `resolveRepoRoot(cwd)` → `loadConfig(repoRoot)` を行い、既存の 2 層 overlay（user global + project local）を再現する。ただし **`<repoRoot>/.specrunner/config.json`（project local）が存在するときのみ** 再解決結果を適用する（存在しなければ `applied: false`）。

- **なぜ worktree 起点か**: build-fixer の編集は worktree 側の project-local config に着地する（Context の topology）。`deps.repoRoot`（main checkout）ではなく `deps.cwd`（worktree）を起点にしないと編集を読めない。verification が実際に coverage コマンド・lcov・git diff を評価する cwd と同一であり、coverage config をその cwd の config から解決するのは意味的にも整合する。
- **なぜ project-local 存在を gate にするか**: `loadConfig(repoRoot)` は project-local が無いと user-global のみを返す。もし cwd に project-local が無い環境（例: managed runtime のように verification cwd が project-local overlay を持たない場合）でそのまま適用すると、job 開始時に main checkout の project-local から得ていた coverage を**取りこぼす**回帰になり得る。build-fixer の編集は必ず `<worktree>/.specrunner/config.json` を作成/更新するので、その存在を「この cwd の project-local が権威である」signal とし、存在時のみ再解決を適用する。存在しなければ job 開始時 config を維持（回帰なし）。
- **Rationale**: local worktree（編集がここに commit される）では file が存在し self-heal が効く。project-local を持たない cwd では job 開始時 config を維持し、要件 2 の「無関係な途中変更を起こさない」を満たしつつ回帰を防ぐ。
- **Alternatives considered**: gate 無しで常に適用 → 却下: project-local 不在 cwd で job 開始時 coverage を落とす回帰リスク。`deps.repoRoot` 起点で再 load → 却下: main checkout を読むため worktree の編集が見えず self-heal しない。

### D5: runtime 別の効き方を明示する（local=self-heal 有効、managed=no-regression）

- **local runtime（dogfooding 対象・本 request の主対象）**: build-fixer が worktree の config を編集・commit → 同 worktree で verification が再解決 → coverage.exclude が反映され self-heal 成立。
- **managed runtime**: build-fixer はクラウド sandbox で編集し origin/branch に push する。local worktree（`deps.cwd`）に編集が同期されない限り、`reloadCoverageConfig` は disk 上の値（＝ job 開始時と同じ、または project-local 不在で `applied: false`）を読むため、**今日の挙動から悪化しない**（no-regression）。managed での self-heal は本変更のスコープ外（Non-Goals）。
- **Rationale**: 本 request の受け入れ基準・再現は local worktree flow（resume で解消する事象）に対応する。disk-based の機構は「disk が編集を反映する環境」で正しく機能し、それ以外では job 開始時 config に倒れて安全。

## Risks / Trade-offs

- **[Risk] project-local を持たない cwd で再 load が job 開始時 coverage を落とす** → **Mitigation**: D4 の存在 gate（`<repoRoot>/.specrunner/config.json` 存在時のみ適用）。存在しなければ job 開始時 config を維持。ユニットテストで「file 不在 → `applied: false` → job 開始時 coverage 使用」を固定する。
- **[Risk] build-fixer が壊れた/検証不能な config を commit し再 load が失敗する** → **Mitigation**: D3 の fail-safe（`applied: false` → job 開始時 config）。verification は crash せず、壊れた config は PR に残り人間レビューに載る。
- **[Risk] in-job 再 load が gate を弱める経路になる** → **Mitigation**: D2 で再 load を `coverage` 1 フィールドに限定。`commands`・非 verification config は job 開始時の値で固定。coverage 変更自体は build-fixer の commit を通じて PR に載り人間レビュー可能（要件 2）。fail-closed 判定ロジック（`evaluateChangedLineCoverage`）は不変（スコープ外）。
- **[Trade-off] verification step が 1 回追加の disk read（config 再解決）を行う** → 実行あたり `git rev-parse` + config file 読み 1 回。verification 本体（コマンド実行・coverage）に比べ無視できるコスト。
- **[Risk] 既存 `verification-step.test.ts` が実 git/fs I/O を踏む** → **Mitigation**: 新ヘルパをモジュール関数として分離し、既存/新規テストは `vi.mock` で差し替える（既存テストが runner.js / propagate.js をモックしているのと同じ方針）。

## Migration Plan

- 本変更は additive: 新ヘルパ 1 本 + verification step の 1 箇所配線。config schema・runner・gate・他 step は不変。
- coverage 未宣言 repo: `reloadCoverageConfig` が返す coverage が undefined でも、effective config の coverage は undefined のまま（gate skip の既存挙動不変）。
- coverage 宣言済 repo（project-local あり）: build-fixer が exclude を追加した後の同一 job 内 verification がその exclude を反映する。
- rollback: 配線を外し `deps.config.verification` を直接渡す従来コードに戻すだけ（無害）。

## Open Questions

- managed runtime で build-fixer の config 編集を同一 job 内 verification に反映するには、agent step 後に local worktree へ branch を同期する別機構が要る。本変更のスコープ外とし、必要になれば別 request で扱う（現状は no-regression で安全）。
