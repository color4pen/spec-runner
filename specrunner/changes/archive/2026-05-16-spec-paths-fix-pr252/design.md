# Design: spec-paths-fix-pr252

## Summary

PR #252 で `specrunner/requests/` → `specrunner/changes/` へのディレクトリ構造再編が行われたが、2 つの spec authority 文書に旧 path 参照が残存している。これらを新構造に一括置換する。

## Approach

単純なテキスト置換。設計判断は不要。

### 置換ルール

| Old | New |
|-----|-----|
| `specrunner/requests/active/` | `specrunner/changes/active/` |
| `specrunner/requests/merged/` | `specrunner/changes/merged/` |
| `specrunner/requests/{active,merged}/` | `specrunner/changes/{active,merged}/` |
| `specrunner/requests/` (base dir reference) | `specrunner/changes/` |

### 対象ファイル

1. **`specrunner/specs/cli-commands/spec.md`** (L168-200)
   - doctor の workflow-structure check が参照する directory path
   - 16 箇所の `specrunner/requests/` → `specrunner/changes/`

2. **`specrunner/specs/job-state-store/spec.md`** (L260-302)
   - `RequestInfo.slug` の canonical path 説明
   - `CANONICAL_PATTERN` regex
   - Scenario 内の path 例
   - 5 箇所の `specrunner/requests/` → `specrunner/changes/`

### コード影響

なし。spec 文書のみの変更。`bun run typecheck && bun run test` への影響はない。

## Risks

- なし。spec テキストの参照整合性修正のみ。
