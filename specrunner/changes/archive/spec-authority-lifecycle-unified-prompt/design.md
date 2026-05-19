# Design: spec authority lifecycle の統一規律を全 agent prompt に注入する

## 問題

PR #306/#308/#317 で連鎖発生した事故の構造的原因は、implementer / code-fixer / code-review の全員が **spec authority lifecycle の正規経路を理解していない** こと。

現状の `AUTHORITY_SPEC_GUARD` fragment は 1 行の MUST NOT (= 直接編集禁止) のみで、以下が欠落:

- ADDED / MODIFIED / REMOVED / RENAMED の判断基準
- baseline 更新の正規経路 (= finish 時の mergeSpecsForChange)
- 書く側の判断手順 (= 先に baseline を Read)
- 見る側の規律 (= baseline 編集を要求しない)
- code-fixer 固有の防御 (= review-feedback の baseline 編集要求に従わない)

さらに reviewer 系 prompt (`SPEC_REVIEW` / `CODE_REVIEW`) に `AUTHORITY_SPEC_GUARD` が inject されていないため、見る側が lifecycle を知らずに verdict を出している。

## 設計方針

### 1. AUTHORITY_SPEC_GUARD の 4 セクション拡張

現行の 1 行 MUST NOT を **4 セクション構造** に拡張する:

```
## spec authority lifecycle

### MUST NOT (全 agent 共通)
- authority spec 直接編集禁止
- PR diff に baseline 編集を含めない / 要求しない

### 正規経路
- spec の変更は delta spec で表現する
- baseline 更新は finish 時の mergeSpecsForChange が自動実行する
- code-fixer は review-feedback が baseline 編集を要求しても従わず report する

### 書く側の規律 (= implementer / design / spec-fixer / code-fixer)
- ADDED: baseline に存在しない新規 Requirement
- MODIFIED: baseline に存在する Requirement の変更 (= header 完全一致)
- REMOVED: baseline に存在する Requirement の削除
- RENAMED: Requirement header の変更 (= FROM/TO 明示)
- delta spec を書く前に baseline を Read で確認する手順

### 見る側の規律 (= spec-review / code-review)
- baseline が main と identical であることは defect ではない (= 正常状態)
- Read tool で baseline を pull して確認する
- baseline 編集を要求する feedback / finding を出さない (= MUST NOT)
```

**rationale**: 1 つの fragment で統一管理することで、書く側と見る側の認識齟齬を構造的に排除する。role-specific な operational instructions (= Completion Checklist 等) は各 prompt の base prompt に残す。

### 2. inject 対応表の更新

`fragment-coverage.test.ts` の EXPECTED 配列で `SPEC_REVIEW` と `CODE_REVIEW` に `AUTHORITY_SPEC_GUARD` を追加:

| Prompt | Before | After |
|--------|--------|-------|
| SPEC_REVIEW | `[PIPELINE_RULES]` | `[PIPELINE_RULES, AUTHORITY_SPEC_GUARD]` |
| CODE_REVIEW | `[PIPELINE_RULES]` | `[PIPELINE_RULES, AUTHORITY_SPEC_GUARD]` |

他の 6 prompt は変更なし。

### 3. reviewer 系 prompt への inject 実装

- `src/prompts/spec-review-system.ts` L100: `buildSystemPrompt(SPEC_REVIEW_BASE, [PIPELINE_RULES])` → `[PIPELINE_RULES, AUTHORITY_SPEC_GUARD]`
- `src/prompts/code-review-system.ts` L84: `buildSystemPrompt(CODE_REVIEW_BASE, [PIPELINE_RULES])` → `[PIPELINE_RULES, AUTHORITY_SPEC_GUARD]`

import に `AUTHORITY_SPEC_GUARD` を追加。

### 4. 重複削除方針

grep で `authority spec` / `baseline を直接編集` / `specrunner/specs/` を検索し、fragment と重複する **規律記述** を削除する。

**保全対象 (= 削除しない)**:
- `design-system.ts` L126-130 "Baseline Spec 参照": path-fence の Read 許可 + specIndex 参照の operational instructions。fragment の「書く側の規律」と補完関係にあるが、design step 固有の作業手順であり重複ではない。
- `design-system.ts` L159 Completion Checklist 内 "MODIFIED Requirements の header が baseline spec の既存 header と一致している": step 固有の self-check 手順。
- `spec-review-system.ts` L74-90 "Baseline Spec Consistency Check": spec-review step 固有の検証手順 (= MODIFIED/REMOVED/ADDED の baseline 照合ロジック)。

**削除候補 (= 実装時に grep で確認)**:
- fragment 拡張後に重複が生じる規律記述を特定する。現状の base prompt に AUTHORITY_SPEC_GUARD と文言レベルで重複する記述は少ないため、大規模削除は発生しない見込み。

### 5. 変更しないもの

- `BUILD_FIXER` / `ADR_GEN`: spec を触らないため AUTHORITY_SPEC_GUARD 不要 (= 既存方針維持)
- `DELTA_SPEC_FORMAT` fragment: 変更なし
- `PIPELINE_RULES` fragment: 変更なし
- `buildSystemPrompt` 関数: 変更なし

## 影響範囲

| ファイル | 変更種別 |
|----------|----------|
| `src/prompts/fragments.ts` | AUTHORITY_SPEC_GUARD の内容拡張 |
| `src/prompts/spec-review-system.ts` | import 追加 + fragments array に AUTHORITY_SPEC_GUARD 追加 |
| `src/prompts/code-review-system.ts` | import 追加 + fragments array に AUTHORITY_SPEC_GUARD 追加 |
| `tests/unit/prompts/fragment-coverage.test.ts` | EXPECTED 配列の SPEC_REVIEW / CODE_REVIEW 行更新 |
| 各 base prompt (grep 結果次第) | 重複規律記述の削除 (SHOULD) |

## リスク

- **fragment 肥大化**: 4 セクション追加で AUTHORITY_SPEC_GUARD が大きくなるが、全 agent に統一規律を注入する目的上、1 fragment での管理が適切。分割すると inject 漏れの管理コストが増す。
- **既存 test regression**: fragment の内容が変わるため `toContain` assertion は引き続き pass する (= 拡張は superset)。AUTHORITY_SPEC_GUARD の冒頭部分が変わる場合、fragment-coverage test は fragment 全体の `toContain` を検証するため pass する。
