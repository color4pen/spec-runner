# Spec Review Result 001: dsv-format-rules-expansion

- **verdict**: needs-fix

---

## Summary

背景・動機・設計判断 (DJ1-DJ7) は solid。request.md の TBD 項目はすべて design.md で解決されており、tasks.md の粒度・検証ステップも十分。ただし delta spec 自体が導入する `normative-keyword-required` rule に違反している（自己参照不整合）。

---

## Findings

### [MUST FIX] F1: delta spec の MODIFIED 2 件が `normative-keyword-required` rule に違反している

**File**: `specrunner/changes/dsv-format-rules-expansion/specs/delta-spec-rule/spec.md`

`normative-keyword-required` rule（要件 5）は「各 Requirement の本文に英語の SHALL または MUST が少なくとも 1 回出現すること」を強制する。しかし delta spec の MODIFIED 2 件の本文にいずれも `SHALL`/`MUST` が存在しない。

**Requirement: DeltaSpecRuleName union type** — 本文:
> `src/core/spec/rules/types.ts` に `DeltaSpecRuleName` union 型を export する。
> - DSV rule 10 件の name を string literal union で列挙する: ...

**Requirement: createDeltaSpecRegistry() の戻り型を DeltaSpecRuleRegistry\<DeltaSpecRuleName\> に変更** — 本文:
> `src/core/spec/rules/index.ts` の `createDeltaSpecRegistry()` が `DeltaSpecRuleRegistry<DeltaSpecRuleName>` を返す。
> - 登録 rule 数は 9: ...

どちらも `SHALL`/`MUST` ゼロ。

**影響**: 実装後に `specrunner request validate dsv-format-rules-expansion` を手動実行すると新 rule がこの delta spec に対して violation を返す。パイプライン上の blocking（delta-spec-validation は implementer より前に実行されるため現ラン内では発火しない）ではないが、spec が自身の定義する rule を満たしていないのは品質上の不整合。

**Fix**: 上記 2 件の本文に `SHALL` を明示的に追加する。

例（1 件目）:
```
`src/core/spec/rules/types.ts` の `DeltaSpecRuleName` union 型 SHALL 以下の 10 rule name を string literal で列挙する: ...
```

例（2 件目）:
```
`src/core/spec/rules/index.ts` の `createDeltaSpecRegistry()` SHALL `DeltaSpecRuleRegistry<DeltaSpecRuleName>` を返す。
```

---

### [INFO] F2: DJ5 と Task 5a の微細な不整合（実装は正しい）

**File**: `design.md` DJ5、`tasks.md` Task 5a

DJ5:
> rules 3-6 が `## Requirements` 内の Requirement block をパース — parsing ロジックの一元化

Rule 3 (`requirement-header-required`) は `### ` 行のうち `### Requirement:` でないものを検出する必要があり、`parseRequirementBlocks`（`^### Requirement:` 専用パーサー）は非標準 header を読み飛ばす構造上、Task 5a が raw line scan を採用しているのは**正しい**。

DJ5 が「rules 3-6 すべてが parseRequirementBlocks を使う」と述べているのは不正確。Task 実装は正しいので修正不要。

---

## Not Flagged (確認済み、問題なし)

| 観点 | 判断 |
|------|------|
| DJ1: `baselineSpecLoader` optional 化 | request.md の `required` から `optional?` への変更は DJ1 で合理的に説明済み。後方互換も維持される |
| DJ2: rule 独立実行 | registry の既存 validate ループと整合、全違反一括報告は fixer にとって有益 |
| DJ3: baseline 不在 = PASS | rule 側で `null` チェックする Single Responsibility 設計は適切 |
| DJ7: normalized match ロジック | exact → normalized の 2 段階は false positive が少なく、typo 検出の精度バランスが妥当 |
| `DeltaSpecViolationReason` 追加 6 件 | `delta-spec-validator.ts` 変更対象として design.md / tasks.md 両方に記載されており整合 |
| 受け入れ基準の完全性 | 6 rule ファイル・registry 登録・型拡張・regression test・green test・archive 3 件確認。すべてカバー済み |
| セキュリティ観点 | rule は fs read のみで write なし。`baselineSpecLoader` は path traversal リスクがあるが、capability 文字列は change folder 内 `specs/` 配下のディレクトリ名由来であり外部入力ではない。問題なし |

---

## Required Actions

1. `specs/delta-spec-rule/spec.md` の MODIFIED 2 件の本文に `SHALL` を追加する（F1）
