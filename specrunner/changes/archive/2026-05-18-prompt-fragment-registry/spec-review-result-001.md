# Spec Review Result: prompt-fragment-registry

- **verdict**: approved
- **iteration**: 001
- **date**: 2026-05-18
- **reviewer**: spec-review-agent

## Overall Assessment

Score: 9.2 / 10

明確な事故例 (#303/#304) に基づく動機、適切に絞ったスコープ、YAGNI を守った設計判断。request → design → tasks → delta spec の一貫性が高く、実装上の重大な曖昧性はない。

## Findings

### MEDIUM — Task 6 の DESIGN_SYSTEM_PROMPT に関する注記が不正確

- **Location**: tasks.md Task 6 注意書き
- **Description**: 「`DESIGN_SYSTEM_PROMPT` は関数呼び出しの戻り値なので」と記載されているが、実際には module-level の `export const` である。`buildInitialMessage()` は initial message 用の別関数であり system prompt の export とは無関係。SPEC_FIXER / SPEC_REVIEW は wrapper 関数があるため注記は正しいが、DESIGN については誤認。
- **Impact**: 実装者が不要な関数呼び出しパターンを採用する可能性があるが、ソースを読めば自明に解決するため実害は小さい。
- **Recommendation**: 修正不要 (実装者がソースから判断可能)。

### LOW — fragment 末尾連結時の section heading ガイダンス

- **Location**: tasks.md Task 3-7, Task 3-8
- **Description**: `spec-review-system.ts` と `code-review-system.ts` は現在 `## Pipeline Rules\n${PIPELINE_RULES}` の形で fragment を prompt 中間に埋め込んでいる。builder 経由化後は末尾連結になるため、base prompt の section 構成調整が必要。design.md D8 でこの方針は明記されているが、tasks.md の具体手順では「template literal 内の `${PIPELINE_RULES}` 埋め込みを除去し、base prompt を const 化」としか書かれておらず、`## Pipeline Rules` heading の扱い (base 末尾に残す / 削除する / fragment 先頭に含める) が明示されていない。
- **Impact**: 実装者の判断で解決可能だが、heading が base 途中に残ると空セクションになるリスクがある。
- **Recommendation**: 修正不要 (D8 の方針 + 実装者のソース確認で解決可能)。実装時に base 末尾に heading を配置するか、heading を fragment 側に移動しない (中身編集なし制約) ことを意識すれば良い。

### LOW — `_changesDir` 動的パスの扱いが tasks で暗黙

- **Location**: tasks.md Task 3-2 (design), Task 3-7 (spec-review), Task 3-8 (code-review)
- **Description**: これら 3 prompt は `changesDirRel()` の戻り値を template literal 内で `${_changesDir}` として使っている。builder 経由化後の BASE const もこの動的パスを保持する必要があるが、tasks では「base prompt を const 化」とだけ記載。BASE は template literal のままで良い (fragment interpolation だけ除去) ことが暗黙。
- **Impact**: 実装者がソースを読めば自明。
- **Recommendation**: 修正不要。

### INFO — fragment over-inclusion の未検出は設計上の選択

- **Description**: `fragment-coverage.test.ts` は「必須 fragment が含まれているか」のみ assert する。不要な fragment が混入した場合 (例: implementer に PIPELINE_RULES が入る) は検出しない。request の「各 prompt に対する必要 fragment 群の正確な決定の改訂はスコープ外」と整合しており、将来の拡張ポイントとして認識。

## Verification Checklist

| Area | Status | Notes |
|------|--------|-------|
| request.md ↔ design.md 整合性 | PASS | 9 要件すべてが design decisions + target state で対応 |
| design.md ↔ tasks.md 整合性 | PASS | 9 tasks が 9 要件を網羅、実行順序の依存関係が正確 |
| delta spec (specs/) 整合性 | PASS | 5 Requirements が request の要件 1,3,4,6 + 依存方向制約を反映 |
| スコープの妥当性 | PASS | 8 prompt 限定、fragment 中身不変、後方互換なし — 適切に絞られている |
| 既存コードとの事実整合 | PASS | import map, export patterns, unused const (grep 検証済み) すべて request の記載と一致 |
| task 実行可能性 | PASS | 各 task に verification step あり、依存関係が DAG で明示 |
| セキュリティ | N/A | 開発者定義の string const の連結のみ。ユーザー入力の prompt injection 経路なし |
| 受け入れ基準の網羅性 | PASS | 15 項目が 9 要件 + test green + typecheck green を完全にカバー |
