# Test Cases: parser-kernel-demote

## Summary

- **Total**: 25 cases
- **Automated** (unit/integration): 22
- **Manual**: 3
- **Priority**: must: 18, should: 6, could: 1

---

### TC-001: parser/types.ts が ParsedRequest と ParsedRequestSections を export する

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-01

**GIVEN** `src/parser/types.ts` が新規作成されている  
**WHEN** `ParsedRequest` と `ParsedRequestSections` を import する  
**THEN** 両インターフェースが export されており、フィールド定義が現行 `core/request/types.ts` と同一である

---

### TC-002: parser/types.ts 自体に core/ への import がない

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-01, T-05

**GIVEN** `src/parser/types.ts` が作成されている  
**WHEN** `grep -n 'from ".*core/' src/parser/types.ts` を実行する  
**THEN** マッチがゼロ行（ファイル自身が上向き依存を持たない）

---

### TC-003: parser/validation/types.ts が ValidationRule を export する

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-02

**GIVEN** `src/parser/validation/types.ts` が新規作成されている  
**WHEN** `ValidationRule<TInput, TViolation, TName>` を import する  
**THEN** ジェネリック付きインターフェースが export されており、現行 `core/validation/types.ts` と定義が同一である

---

### TC-004: parser/validation/registry.ts が RuleRegistry を export する

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-02

**GIVEN** `src/parser/validation/registry.ts` が新規作成されている  
**WHEN** `RuleRegistry<TInput, TViolation, TName>` を import する  
**THEN** クラスが export されており、公開 API が現行 `core/validation/registry.ts` と同一である

---

### TC-005: parser/validation/registry.ts の ValidationRule import が local パス

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-02

**GIVEN** `src/parser/validation/registry.ts` が作成されている  
**WHEN** ファイル内の import 文を確認する  
**THEN** `ValidationRule` の import が `./types.js` を参照しており、`core/` への参照がゼロである

---

### TC-006: core/request/types.ts が parser/types.ts からの re-export バレルになっている

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-03

**GIVEN** `src/core/request/types.ts` の内容が re-export バレルに置き換えられている  
**WHEN** ファイルの内容を確認する  
**THEN** `export type { ParsedRequest, ParsedRequestSections } from "../../parser/types.js"` の形式の re-export 文のみ存在する（定義行がない）

---

### TC-007: core/request/store.ts が型変更なしにコンパイルされる

**Category**: integration  
**Priority**: must  
**Source**: tasks.md T-03

**GIVEN** `core/request/types.ts` が re-export バレルになっている  
**WHEN** `bun run typecheck` を実行する  
**THEN** `core/request/store.ts` でのコンパイルエラーがゼロであり、`ParsedRequest` が正しく解決される

---

### TC-008: core/validation/types.ts が parser/validation/types.ts からの re-export バレルになっている

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-04

**GIVEN** `src/core/validation/types.ts` の内容が re-export バレルに置き換えられている  
**WHEN** ファイルの内容を確認する  
**THEN** `export type { ValidationRule } from "../../parser/validation/types.js"` の形式の re-export 文のみ存在する

---

### TC-009: core/validation/registry.ts が parser/validation/registry.ts からの re-export バレルになっている

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-04

**GIVEN** `src/core/validation/registry.ts` の内容が re-export バレルに置き換えられている  
**WHEN** ファイルの内容を確認する  
**THEN** `export { RuleRegistry } from "../../parser/validation/registry.js"` の形式の re-export 文のみ存在する

---

### TC-010: 既存の validation registry unit test が変更なしで通る

**Category**: integration  
**Priority**: must  
**Source**: tasks.md T-04

**GIVEN** `tests/unit/core/validation/registry.test.ts` が修正されていない  
**WHEN** `bun run test` を実行する  
**THEN** `registry.test.ts` の全テストが green であり、re-export バレル経由でも振る舞いが不変である

---

### TC-011: src/parser/ 配下に core/ への import がゼロになる

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-05, 受け入れ基準①

**GIVEN** T-05 の全 import 書き換えが完了している  
**WHEN** `grep -r 'from ".*core/' src/parser/` を実行する  
**THEN** 出力がゼロ行（マッチなし）

---

### TC-012: parser/request-md.ts が ./types.js を参照する

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-05

**GIVEN** `src/parser/request-md.ts` の import が書き換えられている  
**WHEN** ファイルの import 行を確認する  
**THEN** `ParsedRequest`/`ParsedRequestSections` の import が `"./types.js"` を参照しており、`core/` への参照がない

---

### TC-013: parser/rules/types.ts が ../types.js を参照する

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-05

**GIVEN** `src/parser/rules/types.ts` の import が書き換えられている  
**WHEN** ファイルの import 行を確認する  
**THEN** `ParsedRequestSections` の import が `"../types.js"` を参照しており、`core/` への参照がない

---

### TC-014: parser/rules/index.ts が ../validation/registry.js を参照する

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-05

**GIVEN** `src/parser/rules/index.ts` の import が書き換えられている  
**WHEN** ファイルの import 行を確認する  
**THEN** `RuleRegistry` の import が `"../validation/registry.js"` を参照しており、`core/` への参照がない

---

### TC-015: parser/rules の全 rule ファイル（7件）が ../validation/types.js を参照する

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-05

**GIVEN** `adr-required.ts` / `adr-valid.ts` / `base-branch-required.ts` / `slug-required.ts` / `title-required.ts` / `type-known.ts` / `type-required.ts` の import が書き換えられている  
**WHEN** 各ファイルの import 行を確認する  
**THEN** `ValidationRule` の import が `"../validation/types.js"` を参照しており、いずれのファイルにも `core/` への参照がない

---

### TC-016: arch-allowlist.ts に tracking: "R1" エントリが残っていない

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-06, 受け入れ基準②

**GIVEN** `tests/unit/architecture/arch-allowlist.ts` が編集されている  
**WHEN** `grep 'tracking: "R1"' tests/unit/architecture/arch-allowlist.ts` を実行する  
**THEN** マッチがゼロ行であり、R1 コメントブロックも削除されている

---

### TC-017: B-3 arch test が parser に対して green になる

**Category**: integration  
**Priority**: must  
**Source**: tasks.md T-06, T-07, 受け入れ基準①②

**GIVEN** parser の全上向き import が除去され、allowlist R1 エントリが削除されている  
**WHEN** `bun run test` を実行し architecture テストの B-3 describe ブロックを確認する  
**THEN** `grep finds no upward imports into core/ from shared-kernel/persistence beyond the allowlist` が PASS し、`src/parser/` 由来の violation がゼロである

---

### TC-018: R1 edge が残存する場合 B-3 test が失敗する（ratchet 強制の検証）

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-06, 受け入れ基準②

**GIVEN** allowlist から R1 エントリが削除されており、`filterViolations` 関数が利用可能である  
**WHEN** `src/parser/` ファイルが `from "../core/y.js"` を含む場合を `GrepMatch` として注入し `filterViolations` を呼ぶ  
**THEN** 戻り値が 1 件以上の violation を含む（半端な fix が green を通らないことを確認）

---

### TC-019: 全 verification コマンドが green になる

**Category**: integration  
**Priority**: must  
**Source**: tasks.md T-07, 受け入れ基準④

**GIVEN** T-01〜T-06 が完了している  
**WHEN** `bun run build && bun run typecheck && bun run lint && bun run test` を実行する  
**THEN** 4コマンドすべてが exit code 0 で終了する

---

### TC-020: core/request/types.ts に canonical location コメントがある

**Category**: manual  
**Priority**: should  
**Source**: design.md D3（risk mitigation）

**GIVEN** `src/core/request/types.ts` が re-export バレルになっている  
**WHEN** ファイルの先頭コメントを目視確認する  
**THEN** canonical location が `src/parser/types.ts` であることを示す JSDoc コメントが存在する

---

### TC-021: core/validation/ の各バレルに canonical location コメントがある

**Category**: manual  
**Priority**: should  
**Source**: design.md D3（risk mitigation）

**GIVEN** `core/validation/types.ts` と `core/validation/registry.ts` が re-export バレルになっている  
**WHEN** 各ファイルのコメントを目視確認する  
**THEN** canonical location が `src/parser/validation/` であることを示す JSDoc コメントが存在する

---

### TC-022: DeltaSpecRuleRegistry が影響を受けていない

**Category**: unit  
**Priority**: should  
**Source**: request.md スコープ外定義

**GIVEN** `src/core/spec/rules/` は本変更のスコープ外とされている  
**WHEN** `src/core/spec/rules/` 配下の import 文を確認する  
**THEN** `DeltaSpecRuleRegistry` の定義・import が本変更前後で変化しておらず、`core/validation/` とは独立している

---

### TC-023: R3 / B3-state-port / B3-state-helpers / B3-logger の allowlist エントリが残っている

**Category**: unit  
**Priority**: should  
**Source**: request.md スコープ外定義

**GIVEN** 本変更が R1 のみを対象としている  
**WHEN** `arch-allowlist.ts` 内の tracking フィールドを確認する  
**THEN** `"R3"` / `"B3-state-port"` / `"B3-state-helpers"` / `"B3-logger"` のエントリがそのまま残っており、削除されていない

---

### TC-024: parser/rules の各 rule の実行時振る舞いが不変である

**Category**: integration  
**Priority**: should  
**Source**: request.md 受け入れ基準③

**GIVEN** rule ファイルが `../validation/types.js` から `ValidationRule` を import している  
**WHEN** 各 rule（`adr-required`, `title-required`, `slug-required` など）に有効・無効な入力を与えるテストを実行する  
**THEN** バリデーション結果（violation の有無・型・メッセージ）が変更前と同一である

---

### TC-025: build 成果物に parser 型の d.ts が含まれる

**Category**: manual  
**Priority**: could  
**Source**: tasks.md T-07

**GIVEN** `bun run build` が完了している  
**WHEN** dist/ 配下の型宣言ファイルを確認する  
**THEN** `parser/types.d.ts` に `ParsedRequest` / `ParsedRequestSections`、`parser/validation/types.d.ts` に `ValidationRule` の型宣言が生成されている

---

## Result

```yaml
result: completed
total: 25
automated: 22
manual: 3
must: 18
should: 6
could: 1
blocked_reasons: []
```
