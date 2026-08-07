# 同一性検証済みの重複コードを統合する

## Meta

- **type**: refactoring
- **slug**: dedup-verified-safe
- **base-branch**: main
- **adr**: false

## 背景

コードベース監査で多数の重複コードが検出された。うち意味論的差異を持つもの（adapter の repair ループ、runtime の bootstrap 系列、spawn wrapper 群等）は統合すると挙動が変わるため対象外とし、本 request は「コピー同士の diff 比較で同一（または表示文字列 1 箇所差のみ）と検証済み」の重複だけを統合する。挙動は完全に不変であることが前提であり、既存 test の期待値変更が発生したら挙動が変わった兆候として扱う。

## 現状コードの前提

- `src/cli/command-registry.ts` の `run` command handler(:400-454 付近) と `job start` subcommand handler(:523-577 付近) は indent 差を除き byte-identical（flag 定義・detach 経路・--issue parse 含む）。差は positional help label（`request.md|slug` vs `slug|file`）とコメントのみ。worktree guard は両経路とも同じ `detectWorktree` を通る（`bin/specrunner.ts:79,:125`）
- `computeCodeReviewIteration`（`src/core/step/code-review.ts:28`）・`computeSpecReviewIteration`（`src/core/step/spec-review.ts:51`）・`computeRequestReviewIteration`（`src/core/step/request-review.ts:40`）・`computeConformanceIteration`（`src/core/step/conformance.ts:35`）は全て `(state.steps?.[NAME]?.length ?? 0) + 1` で、`nextIteration`（`src/core/step/io-iteration.ts:12`）と同一。4 ファイルとも既に io-iteration.js を import 済み
- `src/util/detect-pm.ts` の `detectPackageManager`(:48) phase-1 の上方 walk は `findLockfile`(:128) と同一ロジック（同じ LOCKFILE_MAP 順・`.git` stop・fs root stop）で、返り値の形だけが違う
- `src/config/store.ts` の `loadConfig`(:77) は `loadConfigWithSourceMetadata`(:144) と read→migrate→merge→validate の全段が同一。metadata 版のみの追加処理は返却 metadata の `projectLocalPath` 計算で、config 内容には影響しない
- `src/store/job-journal.ts` の `appendInterruption`(:218)・`appendLineage`(:228)・`appendOperatorEvent`(:238)・`appendFindingRecency`(:248) は 4 つとも本体が `appendEventRecord(this.resolver.getEventsPath(), record)` の 1 行で、引数型のみが異なる。`src/store/job-state-store.ts:261-293` の同名 4 wrapper も全て `this._journal.appendX(record)` の 1 行委譲（`appendHistory` は本体が異なるため対象外）
- `src/core/verification/runner.ts` の `runVerificationCommands`(:351) と `runVerificationPhases`(:482) の末尾（coverage-gate → lockfile-gate → verdict → write）はコメントと skip 文言（`"_(skipped — previous command failed)_"` vs `"_(skipped — previous phase failed)_"`）を除き同一。skip 文言は結果 markdown に永続化される
- `src/core/command/resume.ts:274-289` と `src/core/command/reopen.ts:311-326` の liveness-sidecar worktreePath 解決 block は byte-identical。（slug による job 解決 block は `includeArchived` の値が resume=false / reopen=true と異なるため対象外）
- `src/core/pipeline/descriptor-input-completeness.ts:63-64` の `PROBE_SLUG` は `VALIDATOR_PROBE_SLUG` の同一ファイル内 alias
- `src/store/job-state-projection.ts:79-86` に条件を計算して本体がコメントのみの空 if block がある
- `src/core/step/spec-review.ts:100-102` の `enrichContext` は optional method の identity 実装（削除しても `?? ` fallback で同じ結果）

## 要件

1. `run` / `job start` の handler 本体を単一の `CommandDef`（または共有定数）に統合し、両 command から参照する。help label の差（`request.md|slug` / `slug|file`）は維持する
2. `compute*Iteration` 4 関数を削除し、呼び出しを既 import 済みの `nextIteration(state, STEP_NAMES.X)` に置き換える
3. `detectPackageManager` の phase-1 を `findLockfile` 呼び出しに置き換える
4. `loadConfig` を `(await loadConfigWithSourceMetadata(repoRoot)).config` の委譲にする
5. journal append wrapper 4 組を、両クラスとも union 型 1 引数の `appendRecord` 1 メソッド（+ 委譲）に統合する。呼び出し側は機械的に追随する
6. `runVerificationCommands` / `runVerificationPhases` の共通末尾を、skip 文言を label 引数で受ける単一関数に抽出する。**出力される markdown の文字列は現状と 1 byte も変えない**
7. resume / reopen の worktreePath 解決 block を core/resume/ の共有 helper に抽出する
8. `PROBE_SLUG` alias・空 if block・identity `enrichContext` を削除する（`VALIDATOR_PROBE_SLUG` へ rename 統一）

## スコープ外

- adapter の repair ループ / report-tool retry ループ（失敗時 break/continue・session guard・counter が adapter 間で異なる）
- runtime の request.md bootstrap 3 系列（git add 失敗の扱いが throw / 警告続行 / worktree 掃除と意図的に異なる）
- spawn wrapper 群の統合（null exit の成功/失敗解釈が実装間で逆）
- resume / reopen の job 解決 block（`includeArchived` が異なる）
- StepRun の conditional spread 3 箇所（whitelist が passthrough 化するため。journal に schema 検証はなく、無検証化のリスクがある）
- prompt 文面の統合（別途）

## 受け入れ基準

- [ ] **既存 test が 1 ファイルも無改変で green**（この request の性質上、test 期待値の変更 = 挙動が変わった兆候として reject 対象）
- [ ] verification 結果 markdown の skip 文言が変更前と同一（command 経路 / phase 経路それぞれ）
- [ ] `run` と `job start` の `--help` 出力が変更前と同一
- [ ] 削除した symbol（`computeCodeReviewIteration` 等 4 関数、`PROBE_SLUG`）が src/ tests/ で grep 0 件
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- 統合は「diff で同一と確認済みのコピー」に限定し、意味論差のある近似重複は統合しない（差が仕様か bug か判断がつくまで温存する方が安全）
- journal append の union 型化は呼び出し箇所ごとの record 種別チェックをやや弱めるが、record 型は構築時点で確定しており実害がないと判断
- 却下した代替案: verification 末尾の skip 文言統一（ユーザー可視の出力変更になるため、文言は label 引数で現状維持）
