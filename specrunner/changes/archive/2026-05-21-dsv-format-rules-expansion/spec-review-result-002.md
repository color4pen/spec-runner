# Spec Review Result 002: dsv-format-rules-expansion

- **verdict**: approved

---

## Summary

review-001 の F1（delta spec MODIFIED 2 件の本文に SHALL がない）は正しく修正されている。delta spec の全 Requirement が `normative-keyword-required` rule に自己適合した状態になった。F2（DJ5 の記述とTask 5a の raw line scan の齟齬）は INFO 止まりであり修正不要と判断されており、今回も同様。

request.md・design.md・tasks.md・delta spec の内容に新たな阻害要因は見当たらない。

---

## F1 修正確認

**File**: `specrunner/changes/dsv-format-rules-expansion/specs/delta-spec-rule/spec.md`

| Requirement | 修正後の body 内 SHALL |
|-------------|----------------------|
| DeltaSpecRuleName union type | `DeltaSpecRuleName` union 型 **SHALL** 以下の 10 rule name を string literal union で列挙する… ✓ |
| createDeltaSpecRegistry() の戻り型 | `createDeltaSpecRegistry()` **SHALL** `DeltaSpecRuleRegistry<DeltaSpecRuleName>` を返す。 ✓ |

両件とも body に `SHALL` が存在する。F1 解消を確認。

---

## 追加確認事項

| 観点 | 判断 |
|------|------|
| delta spec 全 9 Requirement の normative keyword | 全件 body に `SHALL` を含む（詳細は下表）。違反なし |
| delta spec 全 9 Requirement の Scenario 有無 | 全件 1 つ以上の `#### Scenario:` あり。違反なし |
| delta spec の `## Removed` / `## Renamed` なし | section 不在は optional 扱いで PASS。問題なし |
| `requirement-header-required` と `parseRequirementBlocks` の責務分離 | Task 5a が raw line scan を採用しているのは `parseRequirementBlocks` が非標準 header を読み飛ばすためであり正しい。design.md DJ5 の "rules 3-6 が parseRequirementBlocks を使う" 記述は不正確だが、実装仕様（tasks.md）は正しい。review-001 F2 と同評価：修正不要 |
| `scenario-required-per-requirement` が非標準 header を検査しない件 | `parseRequirementBlocks` は `^### Requirement:` のみを検出するため、`### REQ-001:` 等は Scenario チェック対象外。`requirement-header-required` が先にエラーを出すため cascading として許容範囲内 |
| `DeltaSpecViolationReason` 拡張（6 reason 追加） | `delta-spec-validator.ts` 現行 union に 6 件追加（tasks.md 1a）。既存 7 + 6 = 13 reason になる。design.md DJ6 と整合 |
| セキュリティ: `baselineSpecLoader` の path traversal | capability 文字列は `readdir(specs/)` 由来（外部入力ではない）。変数展開でパスを構築するが入力経路は制御下にある。問題なし |
| 後方互換 | `baselineSpecLoader` を optional 引数 (default `async () => null`) にすることで既存テスト・呼び出し箇所の変更不要。DJ1 の後方互換設計は正しい |
| registry 登録数 | 受け入れ基準「3 → 9」と tasks.md Task 9a（3 既存 + 6 新規）が一致 ✓ |

### delta spec 全 Requirement の normative keyword 確認

| Requirement | body 内キーワード |
|-------------|----------------|
| DeltaSpecRuleName union type | SHALL ✓ |
| createDeltaSpecRegistry() の戻り型 | SHALL ✓ |
| DeltaSpecRuleInput SHALL provide optional baselineSpecLoader | SHALL（"PASS を返す SHALL"）✓ |
| removed-section-format rule SHALL validate ## Removed section format | SHALL（"SHALL 検証する"）✓ |
| renamed-section-format rule SHALL validate ## Renamed section format | SHALL（"SHALL 検証する"）✓ |
| requirement-header-required rule SHALL validate Requirement header prefix | SHALL（"SHALL 検証する"）✓ |
| scenario-required-per-requirement rule SHALL validate Scenario presence | SHALL（"SHALL 検証する"）✓ |
| normative-keyword-required rule SHALL validate normative keyword presence | SHALL（"SHALL 検証する"）✓ |
| baseline-header-match rule SHALL validate Requirement headers against baseline | SHALL（"SHALL 検証する"）✓ |

---

## Not Flagged（確認済み、問題なし）

- DJ2（rule 独立実行）: 全違反一括報告は fixer にとって有益。registry の既存設計と整合
- DJ3（baseline 不在 = PASS）: rule 側で判定する Single Responsibility 設計は適切
- DJ7（normalized match）: exact → normalized の 2 段階で false positive を抑制。typo 検出の精度バランスが妥当
- `loadSpecFiles` の複数呼び出し（rule ごとに個別 read）: パフォーマンス上の冗長さはあるが正確性に影響なし。受け入れ基準は green test のみを要求
- 受け入れ基準の完全性: 6 rule ファイル・registry 登録・型拡張・regression test・green test・archive 3 件確認。すべてカバー済み
