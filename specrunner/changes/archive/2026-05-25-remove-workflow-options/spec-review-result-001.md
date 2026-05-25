# Spec Review Result

- **request**: remove-workflow-options
- **verdict**: approved

## Summary

dead code 撤廃の scope が明確で、design / tasks / delta specs の三層が整合している。セキュリティ上の影響なし（入力経路の削除のみ）。

## Findings

### ✅ 設計妥当性

`enabled` の dataflow（parser → 型 → step → prompt）が正確にトレースされており、削除すべき箇所の網羅性に漏れなし。「後方互換 = silent ignore」の設計判断も合理的。

### ✅ Delta spec 構造

3 capability すべて:
- `### Requirement:` header あり
- `#### Scenario:` あり（各 Requirement に 1 つ以上）
- `SHALL` / `MUST` normative keyword あり
- `## Removed` は `- "name"` 形式で正規

### ✅ Requirement header 突合

- `request-md-parser/spec.md` 内 `### Requirement: ParsedRequest exposes 背景 and 目的 sections for downstream consumers` — baseline header と完全一致 → MODIFIED として正しく適用される
- `database/spec.md` 内 `### Requirement: Requests Table Schema Extension` — baseline header と完全一致 → MODIFIED
- `request-management/spec.md` の `## Removed` 3 件 — baseline の header と一致

### ✅ セキュリティ

新規の入力処理・認証・API endpoint なし。削除のみのため OWASP 観点の懸念事項なし。

---

## 注意点（ブロッカーではない）

### [注意] request-md-parser の `## Purpose` 行

baseline の Purpose は `Parse \`request.md\` into a structured object (type, title, content, enabled options).` となっており "enabled options" が残存する。delta spec の `## Purpose` セクションで更新版を提示しているが、merge tool が `## Requirements` / `## Removed` / `## Renamed` 以外のセクションを処理するかは実装依存。

受け入れ基準に `grep enabled specrunner/specs/request-md-parser/spec.md` が pass すること（=baseline に enabled 言及が残らない）がある。**merge 後に Purpose 行が更新されているか確認すること。** 更新されていない場合は implementer が別途 baseline Purpose を直接修正する必要がある。

### [注意] database delta が "Requests Table Schema Extension" を 4 Scenario → 1 Scenario に縮減

baseline には `branch_name`/`base_branch` 個別の Scenario が含まれていたが、delta の MODIFIED で単一の統合 Scenario に置き換わる。migration の詳細は `Branch Name Migration` requirement が独立して残るため情報損失は最小限。ただし意図的な縮減であることを実装者が認識しておくこと。
