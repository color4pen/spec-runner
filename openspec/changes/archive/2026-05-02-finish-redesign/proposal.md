## Why

PR #51 で実装した `specrunner finish` を PR #48 (readme-status-section) で dogfooding した結果、設計レベルの defect が 4 件露呈した: (1) slug 解決を `state.request.path` の basename に過剰結合し canonical な slug を取り逃した、(2) archive 両方 skip でも archive PR を作成して "No commits between" で fail させ orphan branch を残した、(3) escalation 前に `markJobArchived` しないため filesystem と state が乖離した、(4) `mergeStateStatus=UNKNOWN` の transient retry を欠落させ false positive escalation を起こした。test 686/686 pass でも検出されなかった理由は、test fixture が「整合した slug を持つ clean state」前提で stub されており、現実の dogfooding 入力分布（`/tmp/...` request.path、半端な archive 状態、transient GitHub state）が含まれていなかったから。構造的な根本原因は (a) slug の canonical source を schema に固定しなかったこと、(b) openspec-workflow の 2-PR モデルを LLM の柔軟性なしに deterministic CLI へ翻訳したこと、(c) irreversible な merge 前の pre-flight 検証が無いこと、の 3 点。今やる理由は、merge orchestration を可逆な単位に分割しないと dogfooding を 1 周回すたびに orphan branch / 状態乖離 が累積し、self-host pipeline 全体の信頼性が下がるため。

## What Changes

- **BREAKING** `specrunner finish <jobId>` 形を廃止し、第一形を `specrunner finish <slug>` に変更する。`--job <jobId>` flag は forensics / debug 用として降格保持
- `specrunner finish` 引数なしで cwd / awaiting-merge から slug を auto-detect する（`pipeline-context.md` または `awaiting-merge/<dir>/` の単一性で判定）
- `specrunner finish --pr <num>` で PR 番号からの逆引きを追加（`gh pr view --json headRefName` → prefix strip → slug）
- `specrunner finish --dry-run <slug>` で Phase 0 のみ実行する非破壊モードを追加（destructive op ゼロ assertion）
- **BREAKING** 2-PR モデル（archive PR + chore/archive-<slug> branch）を **完全に廃止** する。`createArchivePr` / `pushAndCreateArchivePr` / `prepareArchiveBranch` / `checkArchivePrAlreadyMerged` を削除し、archive 操作を feature branch に commit してから feature PR を merge する 1-PR モデルに転換
- Phase 0 pre-flight を導入し、reversible な検査（slug 解決可 / PR 取得可 / mergeStateStatus 安定 / openspec validate / バイナリ存在）を irreversible な feature PR merge 前に全実行する
- `mergeStateStatus=UNKNOWN` を 3 秒間隔×3 回 retry する transient handling を追加
- `RequestInfo` schema に `slug: string | null` field を追加し、`request-execute` 起動時に pipeline-context.md の `request-path` から populate する（non-canonical path の場合は `null`）
- `getJobSlug(state): string` helper を新設し、`state.request.slug → state.branch suffix → request.path basename` の fallback で legacy state 互換を維持
- `register_branch` custom tool で slug field を登録（または branch から server 側で導出する fallback）
- `specrunner ps` 出力に `SLUG` 列を `JOB_ID` の次に追加する
- adversarial test fixture（TC-101〜TC-110）を追加し、legacy slug divergence / transient UNKNOWN / Phase 0 fail / `--dry-run` / `--pr` 逆引き / ps SLUG 列 を test として固定
- 2-PR モデル前提の既存 test ケース（archive PR 作成・chore branch 操作・双方 merge orchestration）を削除する
- 1-PR モデル転換の判断を ADR `ADR-{date}-finish-1pr-model.md` として残す（openspec-workflow 側で生成）

## Capabilities

### New Capabilities

- `cli-finish-command`: `specrunner finish` の入力解決（`<slug>` 第一形 / `--pr` 逆引き / cwd / awaiting-merge auto-detect）、Phase 0 pre-flight、1-PR モデルでの archive 実行 / merge orchestration、`mergeStateStatus=UNKNOWN` の transient retry、escalation フォーマット、冪等性 / resume を網羅する SHALL/MUST 要件と Scenario を定義する。**注**: 既存 archive（2026-05-02-cli-finish-command）は openspec/specs/ に promote されておらず drift 状態。本 change で 1-PR モデル仕様として新規に建て直す

### Modified Capabilities
- `cli-commands`: `specrunner finish` の subcommand 仕様を `<slug>` 第一形・`--pr` `--dry-run` `--job` flag 構成に更新する
- `job-state-store`: `RequestInfo` に `slug: string` field を追加し、`getJobSlug` helper の fallback 仕様を Requirement として固定する
- `register-branch-tool`: 入力 schema に `slug` field を追加し、未指定時は `branch` から server 側で stripPrefix で導出する後方互換要件を追加する

## Impact

- **影響コード**: `src/cli/finish.ts`（再設計）、`src/core/finish/archive-pr.ts`（**削除**）、`src/core/finish/*`（archive 実行 / merge orchestration 1-PR 化）、`src/state/schema.ts`（`RequestInfo.slug` 追加）、`src/state/store.ts` (`getJobSlug` helper)、`src/cli/ps.ts`（SLUG 列）、`src/agents/.../register_branch.ts`（slug field）、`src/cli/run.ts`（slug populate at startup）
- **削除対象 API**: `createArchivePr`、`pushAndCreateArchivePr`、`prepareArchiveBranch`、`checkArchivePrAlreadyMerged`、archive PR 関連 test fixture
- **state 互換性**: 既存 state file（`slug` field 無し）は `JobStateStore.load()` で読めること。`getJobSlug` の fallback 経由で slug を derive。on-disk schema は次回 persist で `slug` field が書き込まれる
- **CI / branch protection**: 1-PR モデルでは feature branch に複数 commit が積まれてから merge される。「approval dismissal on new commit」設定との互換性は諦める（SpecRunner repo は当面入れない方針）
- **test**: TC-101〜TC-110 を追加、TC-001〜TC-064 のうち 2-PR モデル前提のものを削除。test スイート全体は pass を維持
- **外部依存**: 変更なし（`gh` / `git` / `openspec` バイナリの subprocess spawn を継続）
- **Self-bootstrap**: 本 change merge 後、PR #48 を 1-PR モデルでの最初の dogfooding ターゲットにする
- **scope 外**: openspec-workflow 側の RENAMED 規約 / spec-reviewer header consistency / fork PR 対応 / branch protection rule 設定は別 request
