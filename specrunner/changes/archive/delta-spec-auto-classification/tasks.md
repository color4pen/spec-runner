# Tasks: Delta Spec Auto-Classification

## T-00: このチェンジフォルダの delta spec を新形式に変換（自己マイグレーション）

本チェンジは自己参照的変更のため、実装完了後かつ `specrunner finish` 実行前に
以下 3 ファイルを新形式に書き換える:

- specrunner/changes/delta-spec-auto-classification/specs/spec-merge/spec.md
- specrunner/changes/delta-spec-auto-classification/specs/delta-spec-rule/spec.md
- specrunner/changes/delta-spec-auto-classification/specs/prompt-fragment-registry/spec.md

タイミング: T-01（新 parseDeltaSpec 実装）完了後、かつ `specrunner finish` 実行前。
注: self-referential migration pattern に従い finish は新コード（PR merge 後または local 新 bin）で実行。

補足: `specrunner/changes/delta-spec-auto-classification/delta-spec-validation-result.md` は
現時点で "approved" だが新 dsv では旧形式を reject するため、T-00 の変換完了で自然に解消する
（ブートストラップ上の既知問題）。

## T-01: 新 delta spec parser の実装（`spec-merge.ts`）

`src/core/finish/spec-merge.ts` の parse 層を新形式に対応させる。

- [x] `ParsedDelta` 型を定義: `{ requirements: RequirementBlock[], removed: string[], renamed: RenameEntry[] }`
- [x] `RenameEntry` 型を定義: `{ from: string, to: string }`
- [x] `parseDeltaSpec()` を新形式対応に書き換え:
  - `## Requirements` セクション配下の `### Requirement:` ブロックを `requirements` に格納
  - `## Removed` セクション配下のリスト項目（`- "name"` 形式）を `removed` に格納
  - `## Renamed` セクション配下のリスト項目（`- "old" → "new"` 形式）を `renamed` に格納
  - 旧形式の `## ADDED Requirements` 等のセクションは parse しない（dsv で reject される前提）
- [x] 旧 `DeltaSpec` 型（`{ added, modified, removed }`）は export を維持（`applyMerge` / `validateDeltaSpec` / `checkBaselineHeaderConsistency` が依存）
- [x] ファイル冒頭の JSDoc コメント（L1-24）を新形式の例に更新

**受け入れ基準**: `parseDeltaSpec()` が新形式の delta spec を `ParsedDelta` として正しく parse できる。旧形式は空の結果を返す。

## T-02: auto-classification ロジックの実装（`spec-merge.ts`）

baseline 突合による ADDED / MODIFIED 自動分類を実装する。

- [x] `classifyDeltaSpec()` 関数を新設。シグネチャ: `(parsed: ParsedDelta, baselineRequirements: RequirementBlock[] | null) => DeltaSpec`
- [x] 分類ロジック:
  1. `renamed` の `from` → `to` を `baselineRequirements` 上で適用（header の rename）。rename 後の baseline を作成
  2. `requirements` を rename 後 baseline と突合:
     - baseline に同名 Requirement あり → `modified` に分類
     - baseline に同名 Requirement なし → `added` に分類
  3. `removed` の各 name → `RequirementBlock` に変換（content は `### Requirement: <name>\n` のみ）して `removed` に格納
- [x] baseline が `null`（新規 capability）の場合、全 `requirements` が `added` に分類される
- [x] header 比較は `normalizeRequirementHeader()` を使用（既存の markdown decoration 耐性を維持）

**受け入れ基準**: `classifyDeltaSpec()` が baseline との突合で正しく ADDED / MODIFIED を自動分類する。新規 capability で全 Requirement が ADDED になる。

## T-03: `mergeSpecsForChange()` の統合

`mergeSpecsForChange()` 内の呼び出しチェーンを新 parser + classifier に切り替える。

- [x] `parseDeltaSpec()` → `classifyDeltaSpec()` → `validateDeltaSpec()` → `checkBaselineHeaderConsistency()` → `applyMerge()` の順で呼び出すよう変更
- [x] `parseDeltaSpec()` の戻り値が `ParsedDelta` になるため、空判定を `requirements.length + removed.length + renamed.length === 0` に更新
- [x] `classifyDeltaSpec()` の呼び出し時に baseline を渡す（既に `mergeSpecsForChange` 内で baseline を読んでいるので、読み込み位置を `parseDeltaSpec` の直後に移動）
- [x] 旧形式の `DELTA_SECTION_RE`（`/^## (ADDED|MODIFIED|REMOVED) Requirements\s*$/m`）を削除
- [x] baseline が `null`（新規 capability）かつ `removed` または `renamed` が非空のとき、エラーを返すバリデーションを追加する（`classifyDeltaSpec` 呼び出し前に実施）

**受け入れ基準**: `mergeSpecsForChange()` が新形式 delta spec → auto-classify → merge の一貫したフローで動作する。baseline が null で removed/renamed が非空の場合はエラーになる。

## T-04: dsv rule 更新（`canonical-spec-structure.ts`）

旧形式を reject し新形式を require する。

- [x] section header 検証ロジックを更新:
  - 旧: `## (ADDED|MODIFIED|REMOVED|RENAMED) Requirements` にマッチすれば valid
  - 新: `## Requirements` が存在すれば valid。`## Removed` / `## Renamed` はオプション
- [x] 旧形式検出ルールを追加:
  - `## ADDED Requirements` / `## MODIFIED Requirements` / `## REMOVED Requirements` / `## RENAMED Requirements` のいずれかが存在 → `legacy-section-header` violation（severity: error / HIGH 相当）
  - suggested: `"Replace ## ADDED/MODIFIED/REMOVED/RENAMED Requirements with ## Requirements (tool auto-classifies)"`
- [x] `missing-requirements-section` の suggested メッセージを `"Add ## Requirements section"` に更新

**受け入れ基準**: 旧形式 section header で dsv violation が発生する。新形式 `## Requirements` で violation なし。

## T-05: prompt fragment 更新（`fragments.ts`）

### T-05a: `DELTA_SPEC_FORMAT` の書き換え

- [x] `DELTA_SPEC_FORMAT`（L52-76）を新形式に書き換え:
  - セクションヘッダー一覧を `## Requirements` / `## Removed` / `## Renamed` に変更
  - 「ADDED / MODIFIED の判断は agent がしない、tool が baseline 突合で決定する」を明示
  - Requirement ブロックのルール（`### Requirement:` header、`#### Scenario:` 必須、normative keyword 必須等）は維持
  - `## Removed` の記法（`- "name"` リスト形式）を説明
  - `## Renamed` の記法（`- "old" → "new"` リスト形式）を説明
  - 旧形式セクションヘッダー（`## ADDED/MODIFIED/REMOVED/RENAMED Requirements`）の使用禁止を明示
- [x] ファイル配置ルール（L69-76）は変更なし

### T-05b: `AUTHORITY_SPEC_GUARD` の「書く側の規律」節の更新

- [x] 「書く側の規律」節（L29-35 周辺）を更新:
  - 旧: `ADDED` / `MODIFIED` / `REMOVED` / `RENAMED` の選択基準を agent に指示
  - 新: 「`## Requirements` に変更/追加したい Requirement を書く。ADDED / MODIFIED の判断は tool が行う」に変更
  - `## Removed` / `## Renamed` の説明は残す（agent が「何を消すか」「何を rename するか」は agent の判断）
  - 「baseline spec を Read tool で確認し、既存 Requirement の header を把握する」指示は維持（MODIFIED の header 一致は引き続き重要）

**受け入れ基準**: `DELTA_SPEC_FORMAT` と `AUTHORITY_SPEC_GUARD` が新形式を反映している。旧セクションヘッダーの指示が消えている。

## T-06: design-system.ts の checklist 更新

- [x] `Self-review checklist`（L94-101 周辺）を新形式に更新:
  - 旧: 「各 delta spec で使用しているセクションが `## ADDED/MODIFIED/REMOVED/RENAMED Requirements` のいずれかである」
  - 新: 「各 delta spec に `## Requirements` セクションが存在する」
  - 旧: 「`## MODIFIED Requirements` の header が変更前の元の header と一致している」
  - 新: 「baseline に存在する Requirement を変更する場合、header が baseline と一致している」
  - `#### Scenario:` 必須 / normative keyword / コードブロック禁止のルールは維持
- [x] `Completion Checklist`（L155-162 周辺）を新形式に更新:
  - 旧: 「各 delta spec セクションが `## ADDED Requirements`, `## MODIFIED Requirements`, ...」
  - 新: 「各 delta spec に `## Requirements` セクションが存在する」
  - 旧: 「`## MODIFIED Requirements` の header が baseline spec の既存 header と一致している」
  - 新: 「baseline に存在する Requirement を変更する場合、`## Requirements` 配下の header が baseline と一致している」

**受け入れ基準**: design-system.ts のすべての checklist 項目が新形式を参照している。旧セクションヘッダーへの言及がない。

## T-07: spec-review-system.ts の Baseline Consistency Check 更新

- [x] `SPEC_REVIEW_BASE` の「Baseline Spec Consistency Check」節（L76-91 周辺）を更新:
  - 旧形式の section header 条件判定（`## MODIFIED` / `## REMOVED` / `## RENAMED` / `## ADDED`）を削除
  - 新形式対応: 「delta spec に `## Requirements` がある場合、各 Requirement header が baseline と整合するか確認する」に変更
  - 「ADDED / MODIFIED の分類は tool 側が担保するため、spec-review では Requirement の semantic 品質と baseline header の一致性を確認する」旨を明記
  - 「baseline file が存在しない場合 + `## Removed` / `## Renamed` がある → HIGH finding」のルールは維持

**受け入れ基準**: spec-review の Baseline Consistency Check が新形式に対応している。

## T-08: delta-spec-validation.ts / delta-spec-fixer.ts のメッセージ更新

- [x] `delta-spec-validation.ts` L68-69: `How to Fix` セクションのメッセージを新形式に更新
  - 旧: `## ADDED Requirements`, `## MODIFIED Requirements`, or `## REMOVED Requirements` section
  - 新: `## Requirements` section (and optionally `## Removed` / `## Renamed`)
- [x] `delta-spec-fixer.ts` L54: fixer への指示メッセージを新形式に更新
  - 旧: 「at least one `## ADDED Requirements`, `## MODIFIED Requirements`, or `## REMOVED Requirements` section header」
  - 新: 「a `## Requirements` section header」

**受け入れ基準**: validation result / fixer 指示メッセージが新形式を参照している。

## T-09: type-config.ts の specImpact 更新

- [x] `src/config/type-config.ts` の `specImpact` フィールドを新形式の用語に更新:
  - `new-feature`: 「`## Requirements` で新規 capability を追加」
  - `spec-change`: 「`## Requirements` + `## Removed`/`## Renamed` で既存 spec を変更」
  - `bug-fix`: 「原因が spec 不備なら `## Requirements`、実装だけの問題なら不要」（MODIFIED 言及を削除）

**受け入れ基準**: type-config の全 specImpact が旧セクションヘッダーを参照していない。

## T-10: テスト — `parseDeltaSpec` + `classifyDeltaSpec` unit test

`tests/finish-spec-merge.test.ts` に新テストケースを追加し、旧テストケースを新形式に移行する。

- [x] TC-SM-010〜TC-SM-014（parseDeltaSpec）: 新形式の `## Requirements` / `## Removed` / `## Renamed` で書き直す
- [x] 新規: `classifyDeltaSpec` — baseline あり + requirements → ADDED/MODIFIED 自動分類
- [x] 新規: `classifyDeltaSpec` — baseline なし（新規 capability）→ 全 ADDED
- [x] 新規: `classifyDeltaSpec` — `## Removed` → removed に分類
- [x] 新規: `classifyDeltaSpec` — `## Renamed` + requirements → rename 後に MODIFIED 判定
- [x] 新規: `classifyDeltaSpec` — normalized header matching（markdown decoration 耐性）
- [x] TC-SM-030〜TC-SM-035（validateDeltaSpec）: `DeltaSpec` 型の入力は不変なのでそのまま維持（classify 後の出力を検証）
- [x] TC-SM-040〜TC-SM-047（applyMerge）: そのまま維持（入力の DeltaSpec 型は不変）

**受け入れ基準**: 新形式の parse + classify の unit test が green。旧 applyMerge / validateDeltaSpec のテストも green。

## T-11: テスト — dsv rule unit test 更新

`tests/unit/core/spec/rules/canonical-spec-structure.test.ts` と `tests/unit/core/spec/delta-spec-validator.test.ts` を新形式に移行。

- [x] `helpers.ts` の `validSpecContent()` を新形式に書き換え（`## ADDED Requirements` → `## Requirements`）
- [x] `canonical-spec-structure.test.ts`: 有効な section header を `## Requirements` に変更、旧形式が violation を返すテストを追加
- [x] `delta-spec-validator.test.ts`: fixture の `## ADDED Requirements` を `## Requirements` に変更
- [x] 新規: 旧形式 `## ADDED Requirements` が `legacy-section-header` violation を返すテスト
- [x] 新規: 旧形式 `## MODIFIED Requirements` が violation を返すテスト

**受け入れ基準**: dsv の新形式テストが全て green。旧形式が violation として検出される。

## T-12: テスト — prompt fragment string assertion

prompt 文字列が新形式を参照していることを assertion で検証する。

- [x] `DELTA_SPEC_FORMAT` が `## Requirements` を含み、`## ADDED Requirements` を含まないことを assert
- [x] `AUTHORITY_SPEC_GUARD` が旧セクションヘッダー（`ADDED:`, `MODIFIED:`, `REMOVED:`, `RENAMED:`）の分類基準を含まないことを assert
- [x] `DESIGN_SYSTEM_PROMPT`（build 後の完成文字列）が `## ADDED Requirements` を含まないことを assert
- [x] 既存テストファイル（`tests/unit/step/delta-spec-validation.test.ts`, `tests/pipeline-integration.test.ts`）の旧形式 fixture を新形式に更新

**受け入れ基準**: string assertion テストが green。pipeline-integration テストが green。

## T-13: `mergeSpecsForChange` integration test の更新

`tests/finish-spec-merge.test.ts` の TC-SM-070 以降（`mergeSpecsForChange` の統合テスト）を新形式に移行する。

- [x] fixture の delta spec 内容を新形式（`## Requirements` / `## Removed`）に書き換え
- [x] 新規 capability（baseline 不在）→ 全 ADDED 扱いの統合テスト
- [x] 既存 capability + baseline → ADDED/MODIFIED 自動分類の統合テスト
- [x] empty delta（`requirements.length + removed.length + renamed.length === 0`）→ error の統合テスト

**受け入れ基準**: `mergeSpecsForChange` の統合テストが全て green。

## T-14: `bun run typecheck && bun run test` green 確認

- [x] `bun run typecheck` が green
- [x] `bun run test` が green
- [x] 旧形式 section header への参照が src/ 配下に残っていないことを grep で確認（archive / テストの期待値以外）
  - grep 除外対象: `specrunner/changes/` 配下（T-00 で新形式変換済みだが、変換前に実行する場合は一時的に旧形式を含む）および `tests/` 配下の旧形式を期待値とするテストケース

**受け入れ基準**: 全テスト・型チェックが pass。

## T-15: ADR 作成（docs/adr/ 配下）

- [x] `docs/adr/` に本 request の設計記録ファイルを作成する
- [x] タイトル例: 「Delta Spec の section header 分類を LLM から tool に委譲」
- [x] 記録内容:
  - 背景: LLM 不確定性に対する構造的解決の第 1 弾として本変更を位置付ける（PR #283/#289/#299/#323 の事故分析）
  - 決定事項: D1〜D7（design.md の Decisions）を要約
  - 結果・トレードオフ: 旧形式 delta spec の移行が必要 / PR #323 同型事故の物理的消滅

**受け入れ基準**: `docs/adr/` に本変更の ADR ファイルが存在し、「LLM 不確定性に対する構造的解決」の思想と本 request の位置付けが記録されている。
