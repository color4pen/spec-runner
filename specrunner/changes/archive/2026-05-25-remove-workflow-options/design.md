# Design: remove-workflow-options

## Summary

`request.md` の `## Workflow Options` セクション（`enabled` field）を dead code として完全撤廃する。parser → 型定義 → prompt 注入の全 dataflow を削除し、テンプレートからもセクションを除去する。既存 archive の後方互換は parser の silent ignore で維持する。

## Approach

### 削除対象の dataflow

```
request.md [## Workflow Options / enabled: [...]]
       ↓ extractEnabled()
ParsedRequestRaw.enabled / ParsedRequest.enabled
       ↓
┌─ spec-review.ts → spec-review-system.ts {{ENABLED}}
└─ test-case-gen.ts → test-case-gen-system.ts <must-areas>
```

上記の全経路を削除する。

### 設計判断

1. **完全撤廃** — 後継機能の stub は残さない。将来必要になれば別 request で設計する
2. **後方互換** — parser は `## Workflow Options` を未知セクションとして silent ignore する（extractEnabled を削除すれば、当該セクションは単に読み飛ばされる）
3. **テンプレート除去** — `request new` / `request generate` の両経路から `## Workflow Options` セクションを除去し、新規 request に生成されないようにする
4. **テスト更新** — TC-008/TC-009（must-areas 関連）を削除し、全 mock の `enabled: []` を除去

### 影響範囲

| レイヤー | 対象ファイル | 操作 |
|---------|-------------|------|
| Parser | `src/parser/request-md.ts` | `extractEnabled` 関数削除、`enabled` 代入削除 |
| Types | `src/parser/rules/types.ts` | `ParsedRequestRaw.enabled` 削除 |
| Types | `src/core/request/types.ts` | `ParsedRequest.enabled` 削除 |
| Step | `src/core/step/spec-review.ts` | `enabled` 渡し削除 |
| Prompt | `src/prompts/spec-review-system.ts` | `{{ENABLED}}` placeholder + 計算ロジック削除 |
| Step | `src/core/step/test-case-gen.ts` | `enabled` 渡し削除 |
| Prompt | `src/prompts/test-case-gen-system.ts` | `<must-areas>` section + 関連指示削除 |
| Template | `src/core/command/request.ts` | scaffold template から `## Workflow Options` 除去 |
| Template | `src/prompts/request-generate-system.ts` | 生成 prompt から `## Workflow Options` 除去 |
| Tests | 50+ test files | mock の `enabled: []` 行削除、TC-008/TC-009 削除 |

### Delta Spec 対象

| Capability | 操作 | 内容 |
|-----------|------|------|
| request-md-parser | MODIFIED (Purpose) + REMOVED | Purpose から "enabled options" 除去、`ParsedRequest` shape の `enabled` 言及除去 |
| request-management | REMOVED | `enabled` 関連 Requirement 3 件を全削除 |
| database | MODIFIED | `requests` テーブル構造から `enabled` column 記述を除去 |

## Non-Goals

- `Workflow Options` 後継機能の設計
- `request-management` / `database` spec の Web app 構想全体整理
- archive の retro 編集
