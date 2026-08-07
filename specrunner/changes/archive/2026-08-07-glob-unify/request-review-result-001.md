# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### 1. `matchGlob` 消費者 3 ファイルの確認

`src/core/reviewers/glob-match.ts` の `matchGlob(pattern, file)` 引数順を確認。

- `src/core/pipeline/scope.ts:16` — `import { matchGlob } from "../reviewers/glob-match.js"` ✓
- `src/core/pipeline/scope.ts:67` — `matchGlob(pattern, file)` ✓
- `src/core/reviewers/activation.ts:11` — `import { matchGlob } from "./glob-match.js"` ✓
- `src/core/reviewers/activation.ts:87` — `matchGlob(pattern, file)` ✓
- `src/core/step/main-checkout-guard.ts:17` — `import { matchGlob } from "../reviewers/glob-match.js"` ✓
- `src/core/step/main-checkout-guard.ts:76` — `matchGlob(g, filePath)` ✓（引数順が逆 = pattern が第 1 引数）

### 2. `matchesGlob` 消費者の実態確認

request の「現状コードの前提」に記載された 3 ファイルを実際に読んで import を確認。

- `src/core/archive/protected-paths.ts` — **`globMatch` を import 済み**（`matchesGlob` は使用していない）
- `src/core/step/staging-containment.ts:27` — `import { matchesGlob } from "../../util/glob-match.js"` ✓（正しい）
- `src/core/verification/changed-line-coverage.ts` — **`globMatch` を import 済み**（`matchesGlob` は使用していない）
- `src/core/step/bite-evidence/test-file-selection.ts:16-17` — `import { matchesGlob }` + `export { matchesGlob }`（request 未記載の実際の消費者・re-export 元）

### 3. `src/util/glob-match.ts` の実装確認

- `:17` `globMatch(filePath, pattern)` ✓
- `:95` `matchesGlob(filePath, pattern)` ✓
- `:71-79` 「2 実装は独立」注記 ✓（request では `:72-77` と記載、実際は `:71-79`）
- `globMatch` の `**/` → `(?:.+/)?`（non-empty segment 必須 = minimatch/git 準拠）✓
- `matchesGlob` の `**/` → `(?:.*/)?`（空 segment 許容）✓
- `matchesGlob` は `?` を regex-escape（literal `\?` 扱い）、`globMatch` は `[^/]`（wildcard）✓

### 4. 構造テストの確認

`src/core/step/__tests__/shared-glob-match-imports.test.ts` を確認。

- `staging-containment.ts` が `glob-match.js` から `matchesGlob` を import していること ✓
- `test-file-selection.ts` が `glob-match.js` から `matchesGlob` を import していること ✓
- `src/util/glob-match.ts` に `function matchesGlob` が **ちょうど 1 つ**あること ✓（行 74 の regex: `/\bfunction\s+matchesGlob\b/g`）

この pin が意味するのは、`matchesGlob` の委譲実装は `export function matchesGlob(...)` 形式で書く必要がある（`export const matchesGlob = globMatch` では `/\bfunction\s+matchesGlob\b/` に match しないため構造テストが失敗する）。

### 5. 既存テストファイルの確認

- `tests/unit/util/glob-match.test.ts` — 存在 ✓、`?` wildcard テスト含む ✓、`a//b` 非 match テストは未掲載（要件 4 で追加が求められている）
- `src/core/reviewers/__tests__/glob-match.test.ts` — 存在 ✓、削除対象として妥当なケース一覧を確認済み

### 6. 受け入れ基準の実現可能性確認

- `matchesGlob` の staging-containment.ts での使用は `globMatch` と互換（本番 pattern 形状で出力一致を確認済み）
- `staging-containment.test.ts` の `matchesGlob` テスト（vendor/**、**/*.test.ts 等）は `globMatch` 委譲後も全通過する見通し ✓

## 検証できなかった項目

None。全確認項目を read-only ツールで直接実行した。

## Findings 詳細

### Finding 1: `matchesGlob` 消費者リストが現状コードと乖離している

「現状コードの前提」に記載された `matchesGlob` 消費者 3 ファイルのうち、2 ファイルはすでに `globMatch` を直接 import している。

- `src/core/archive/protected-paths.ts` — `import { globMatch }` 済み（変更不要）
- `src/core/verification/changed-line-coverage.ts` — `import { globMatch }` 済み（変更不要）

実際に `matchesGlob` を使用しているのは:
- `src/core/step/staging-containment.ts`（独立実装の消費者として正しい）
- `src/core/step/bite-evidence/test-file-selection.ts`（`util/glob-match.ts` から import して re-export、request 未記載）

受け入れ基準は正確であり、実装はその基準で判断すれば正しい成果物が得られる。背景記述の誤りが実装を迷走させる可能性は低いが、実態と異なる記述のため修正推奨。
