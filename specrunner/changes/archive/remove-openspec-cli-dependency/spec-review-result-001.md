# Spec Review Result: remove-openspec-cli-dependency (Iteration 001)

- **verdict**: approved
- **iteration**: 1
- **date**: 2026-05-11

## Summary

request.md の 7 要件すべてが design.md（AD-1〜AD-10）、tasks.md（T-01〜T-15）、delta spec 3 本にわたって網羅されている。受け入れ基準 5 項目も tasks の検証ステップで対応済み。既存ソースコードとの整合性を検証した結果、delta spec が記述する before→after 変換はすべて正確かつ実現可能。CRITICAL / HIGH の指摘なし。

## Review Axes

### Completeness

request.md の要件と delta spec / tasks の対応:

| 要件 | Design | Tasks | Delta Spec |
|------|--------|-------|------------|
| 1. パス定数切り替え | AD-1 | T-01 | propose-pipeline (path resolution) |
| 2. propose prompt 書き換え | AD-2 | T-02 | propose-pipeline (artifact generation) |
| 3. finish 簡素化 | AD-3, AD-4 | T-03, T-04, T-05 | cli-finish-command |
| 4. doctor 更新 | AD-5 | T-06 | pipeline-orchestrator (doctor) |
| 5. dynamic-context 更新 | AD-6 | T-07 | pipeline-orchestrator (dynamic context) |
| 6. proposal.md 参照除去 | AD-7 | T-08 | pipeline-orchestrator (prompt references) |
| 7. request.md 配置変更 | AD-8 | T-09 | propose-pipeline (request.md copy) |

追加の設計判断（AD-9: init.ts, AD-10: maxTurns）も pipeline-orchestrator spec と propose-pipeline spec でそれぞれカバー。

### Consistency

- `collectChangesList()` は既存コードで `e.name !== "archive"` フィルタ済み。design.md の「変更不要」は正確。
- propose-pipeline/spec.md の `## MODIFIED Requirements` ヘッダが 2 回出現する構造的重複あり（下記 LOW 指摘）。ただしセマンティクスに曖昧さはない。
- cli-finish-command spec は `archiveChangeFolder()` の振る舞いを記述しているが、新規ファイル名（`archive-change-folder.ts`）は design.md / tasks.md 側で定義。spec は振る舞い仕様として適切。

### Feasibility

既存ソースコード 18 ファイルを検証。すべての記述が現状のコードと整合:
- `CHANGES_DIR = "openspec/changes"` → 切り替え可能
- `archiveOpenspec()` → 存在確認、削除可能
- `openspecCheck` → index.ts 登録あり、削除可能
- `collectSpecsList()` → 空配列化は関数本体の 1 行変更
- `ENVIRONMENT_PACKAGES_NPM = ["@fission-ai/openspec"]` → 除去可能
- `maxTurns: 20` → 変更可能

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | consistency | specs/propose-pipeline/spec.md | `## MODIFIED Requirements` H2 ヘッダが 2 箇所（L4, L41）に重複。同一ファイル内で同じ H2 が 2 回出現すると、リンクアンカーの衝突やパーサーの混乱リスクがある | 2 つ目の `## MODIFIED Requirements`（L41〜）を 1 つ目のセクションにマージするか、2 つ目を `## MODIFIED Requirements (core utilities)` 等に区別する |
| 2 | LOW | completeness | tasks.md T-09 | `managed.ts` への request.md コピー追加が記載されているが、propose-pipeline/spec.md の Scenario は `pipeline startup` としか記述せず runtime 種別を明示していない。managed runtime でも同一の動作が保証される旨を spec で明示するとトレーサビリティが向上する | Scenario に `AND this applies to both local and managed runtimes` を追記、または runtime-agnostic であることを Requirement 本文で明記 |
| 3 | LOW | maintainability | design.md AD-6 | `collectChangesList()` が `archive` を除外する既存フィルタに依存しているが、その前提が AD-6 のテキストに明記されていない。読み手が「なぜ変更不要か」を理解するには dynamic-context.ts L102 を読む必要がある | AD-6 に「既存の `e.name !== "archive"` フィルタにより archive/ は自動除外される」旨を 1 文追記 |

## Security Assessment

- openspec CLI（外部バイナリ）の実行を廃止するため、攻撃面が縮小する（正の影響）
- パス変更は内部定数のみ。ユーザー入力由来のパス構築は既存の `slugify()` 経由で sanitize 済み
- request.md コピーはファイルシステム内のコピーであり、新たな入力経路を開かない
- セキュリティ上の懸念なし
