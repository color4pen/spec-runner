# custom reviewer round の運用欠落 2 件を修正する — pr-create-result の管理パス化と activationPaths の欠落補完

## Meta

- **type**: bug-fix
- **slug**: round-operational-gaps
- **base-branch**: main
- **adr**: false

## 背景

並列 run の運用で custom reviewer round に 2 つの欠落が実発現した:

1. **pr-create-result.md が pipeline 管理パス外**(#898): `pr-create-result.md` は `pipelineManagedPaths` に含まれず、findings 系の除外パターン `*-result-*.md` にも一致しない(`-result.` で終わるため)。pr-create 実行後に round が再走する経路(全 skip escalation からの resume 等)で、round guard が ROUND_NONDECLARED_CHANGE として誤 halt する。bite-evidence-result.md(#888)と同一クラスの残留回帰で、実例は job 27f57112(operator の手 commit で回避した)。
2. **cross-boundary-invariants の activationPaths に src/core/runtime/** と src/core/verification/** が無い**(#896): runtime 層(bootstrap / workspace materialization — synthesizedCommits 台帳や worktree 生成という横断不変の参加者)と verification 層(coverage gate 等)のみを変更する request で全 member が skip し、全 skip 非 green 規則により escalation halt する。実例は job 27f57112 / 6283b476(operator が state snapshot への追記で回避した)。

## 現状コードの前提

- `src/core/pipeline/round-git-scope.ts:105` — `pipelineManagedPaths(slug)` は `[slugStateJsonPath, slugEventsPath, usageJsonPath, biteEvidenceResultPath]` の 4 つで、`prCreateResultPath` を含まない
- `src/util/paths.ts:83-84` — `prCreateResultPath(slug)` = `specrunner/changes/<slug>/pr-create-result.md` が既に存在する
- `pipelineManagedPaths` は単一ソースで (a) scoped 合成の commit 対象と (b) `partitionRoundChanges` の offending 除外の両方に効く(#888 の bite-evidence-result.md と同じ組み込み点)
- `specrunner/reviewers/cross-boundary-invariants.md` — frontmatter `paths` は `src/core/pipeline/** / src/core/step/** / src/state/** / src/store/** / src/adapter/**` の 5 つ
- reviewer 定義は job bootstrap 時に state へ snapshot されるため、本修正は修正後に起動する job から効く(実行中 job には遡及しない)

## 要件

1. `pipelineManagedPaths(slug)` に `prCreateResultPath(slug)` を追加する(単一ソースへの追加のみ。呼び出し側の変更はしない)。
2. `specrunner/reviewers/cross-boundary-invariants.md` の frontmatter `paths` に `src/core/runtime/**` と `src/core/verification/**` を追加する。本文(観点・判定基準)は変更しない。
3. 回帰テスト: pr-create-result.md が dirty な worktree で round の offending 検査が halt しない(managed として除外される)ことをテストで固定する(#888 の bite-evidence 回帰テストと同型)。

## スコープ外

- scale-tolerance の activationPaths 見直し
- 全 skip escalation の resume UX 改善
- reviewer 定義の schema 変更

## 受け入れ基準

- [ ] pr-create-result.md のみが dirty な round で offending が空になり halt しないことをテストで固定する
- [ ] pr-create-result.md が scoped 合成 / round 合成の commit 対象に含まれることをテストで固定する
- [ ] cross-boundary-invariants.md の frontmatter に 2 つの glob が追加され、既存 5 つが保存されていること
- [ ] 修正前の挙動(pr-create-result.md が offending 扱い)に戻すと該当テストが fail することを破壊確認として記録する
- [ ] 既存の round-git-scope / bite-evidence テストは無改変で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用: pipelineManagedPaths 単一ソースへの追加**。#888 と同じ組み込み点で、合成対象と offending 除外の両方に 1 箇所で効く。
- **却下: 除外パターン `*-result-*.md` の緩和(`*-result*.md` 等)** — パターンの適用範囲が広がり、意図しないファイルの除外(検査の盲点)を生み得る。管理パスの明示列挙が fail-closed。
- **却下: pr-create-result.md の命名変更(`pr-create-result-001.md` 化)** — 既存 archive・参照との互換を壊す割に得るものがない。
