# Test Cases: closure の上向き edge（B-3/B-4）を ratchet で歯付けし R1/R3/R4 を凍結する

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual
  **Priority**: must | should | could
  **Source**: reference to design.md or tasks.md section

GIVEN/WHEN/THEN structure (required for each test case):
  **GIVEN** <preconditions>
  **WHEN** <action>
  **THEN** <expected result>

Category determination:
  unit        — pure logic, validation, helper functions (automated)
  integration — DB operations, API endpoints, multi-module interaction (automated)
  manual      — UI/UX confirmation, visual verification, build artifact check (not automated)

Priority determination:
  must   — core functionality; if broken, the feature does not work
  should — important but core still works; edge cases, error handling
  could  — nice to have; performance, UX details

Summary section MUST appear immediately after the title with ALL 4 items:
  ## Summary
  - **Total**: {count} cases
  - **Automated** (unit/integration): {count}
  - **Manual**: {count}
  - **Priority**: must: {count}, should: {count}, could: {count}

Result section MUST appear at the very end as a YAML code block:
  ## Result
  ```yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  ```

  result determination:
    completed — all testable behaviors are documented
    partial   — some cases could not be derived due to design ambiguity
    failed    — required design artifacts (design.md, tasks.md) are missing
-->

## Summary

- **Total**: 40 cases
- **Automated** (unit/integration): 30
- **Manual**: 10
- **Priority**: must: 32, should: 8, could: 0

---

### TC-001: B-3 no-op が解消されていること

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02 AC / request.md AC「B-3/B-4 の `expect(true).toBe(true)` stub が解消されている」

**GIVEN** `tests/unit/architecture/core-invariants.test.ts` の B-3 describe ブロックが存在する  
**WHEN** そのブロック内の test body を確認する  
**THEN** `expect(true).toBe(true)` が一切含まれていない

---

### TC-002: B-4 no-op が解消されていること

**Category**: unit
**Priority**: must
**Source**: tasks.md T-03 AC / request.md AC「B-3/B-4 の `expect(true).toBe(true)` stub が解消されている」

**GIVEN** `tests/unit/architecture/core-invariants.test.ts` の B-4 describe ブロックが存在する  
**WHEN** そのブロック内の test body を確認する  
**THEN** `expect(true).toBe(true)` が一切含まれていない

---

### TC-003: B-3 test が実際に非-core ディレクトリを scan すること

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02 AC / request.md AC「B-3/B-4 の test が no-op でなく実際に非-`core/` ディレクトリを scan する」

**GIVEN** B-3 describe ブロックが実 assert に書き換えられている  
**WHEN** test コードの `grepE()` 呼び出し引数を確認する  
**THEN** `src/parser/`, `src/config/`, `src/state/`, `src/git/`, `src/prompts/`, `src/logger/`, `src/templates/`, `src/store/` が対象に含まれており、`core/` への import pattern で grep が実行されている

---

### TC-004: B-3 test が `src/store/` を scan 対象に含むこと

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02 AC「scan 対象に `src/store/` が含まれている」

**GIVEN** B-3 test が shared-kernel + persistence ディレクトリを scan する実装になっている  
**WHEN** scan 対象ディレクトリのリストを確認する  
**THEN** `src/store/` が明示的に含まれている

---

### TC-005: B-4 test が `src/util/` の外部 import を検出すること

**Category**: unit
**Priority**: must
**Source**: tasks.md T-03 AC「test が実際に `src/util/` を grep し、外部 import を検出している」

**GIVEN** B-4 describe ブロックが実 assert に書き換えられている  
**WHEN** test コードの `grepE()` 呼び出し引数と pattern を確認する  
**THEN** 対象が `src/util/` であり、`from ['"]\.\.` pattern（`../` 相対 import）で grep が実行されている

---

### TC-006: B-3 test が test ファイルを除外すること

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02「`__tests__/` と `.test.ts` を含む match を除外するフィルタを適用する」/ design.md D5

**GIVEN** B-3 test が grep 結果を処理する実装になっている  
**WHEN** `__tests__/` ディレクトリまたは `.test.ts` ファイルのパスが grep 結果に含まれる  
**THEN** それらの match が violations リストに含まれず、`toEqual([])` が pass する

---

### TC-007: B-4 test が test ファイルを除外すること

**Category**: unit
**Priority**: must
**Source**: tasks.md T-03「`__tests__/` と `.test.ts` を含む match を除外するフィルタを適用する」/ design.md D5

**GIVEN** B-4 test が grep 結果を処理する実装になっている  
**WHEN** `src/util/__tests__/` 内のファイルが `../` import を持つ場合  
**THEN** それらの match が violations リストに含まれない

---

### TC-008: allowlist 込みで B-3 suite が green になること

**Category**: integration
**Priority**: must
**Source**: tasks.md T-02 AC「allowlist エントリ込みで test が green」/ request.md AC「allowlist 込みで enforcement suite が green」

**GIVEN** `arch-allowlist.ts` に B-3 の全 violation（R1/R3/B3-state-port/B3-state-helpers/B3-logger）が allowlist エントリとして追加されている  
**WHEN** `bun run test` で core-invariants.test.ts を実行する  
**THEN** B-3 describe ブロックの全 it が PASS する

---

### TC-009: allowlist 込みで B-4 suite が green になること

**Category**: integration
**Priority**: must
**Source**: tasks.md T-03 AC「allowlist エントリ込みで test が green」/ request.md AC「allowlist 込みで enforcement suite が green」

**GIVEN** `arch-allowlist.ts` に B-4 の全 violation（R4 の copy-artifacts.ts・slugify.ts 合計 6 件）が allowlist エントリとして追加されている  
**WHEN** `bun run test` で core-invariants.test.ts を実行する  
**THEN** B-4 describe ブロックの全 it が PASS する

---

### TC-010: B-3 allowlist エントリに必須フィールドが揃っていること

**Category**: unit
**Priority**: must
**Source**: tasks.md T-01 AC「各エントリに `file`, `pattern`, `invariant`, `tracking` が設定されている」

**GIVEN** `arch-allowlist.ts` の `ARCH_ALLOWLIST` 配列に B-3 エントリが追加されている  
**WHEN** 各エントリのプロパティを確認する  
**THEN** `file`, `pattern`, `invariant`（値は `"B-3"`）, `tracking` が全 B-3 エントリに存在する

---

### TC-011: B-4 allowlist エントリに必須フィールドが揃っていること

**Category**: unit
**Priority**: must
**Source**: tasks.md T-01 AC「各エントリに `file`, `pattern`, `invariant`, `tracking` が設定されている」

**GIVEN** `arch-allowlist.ts` の `ARCH_ALLOWLIST` 配列に B-4 エントリが追加されている  
**WHEN** 各エントリのプロパティを確認する  
**THEN** `file`, `pattern`, `invariant`（値は `"B-4"`）, `tracking` が全 B-4 エントリに存在する

---

### TC-012: allowlist が grep 検出全件を網羅していること

**Category**: integration
**Priority**: must
**Source**: tasks.md T-01 AC「grep で検出された B-3/B-4 全件（test ファイル・comment 行除外後）に対応する allowlist エントリが存在する」

**GIVEN** 実装後の codebase が存在する  
**WHEN** 実際の B-3 grep コマンド（`grep -rEn "from ['\"](\.\./)*core/" src/parser/ src/config/ src/state/ src/git/ src/prompts/ src/logger/ src/templates/ src/store/`）および B-4 grep コマンド（`grep -rEn "from ['\"]\.\./" src/util/`）を実行し、test ファイル・comment 行を除外する  
**THEN** 残った全件に対応する allowlist エントリが `ARCH_ALLOWLIST` に存在し、`bun run test` の B-3/B-4 が green になる

---

### TC-013: R1 の allowlist エントリが存在すること

**Category**: unit
**Priority**: must
**Source**: request.md AC「R1（parser→core）が allowlist に file + B-# + tracking 付きで列挙されている」/ design.md 違反表 #1〜#11

**GIVEN** `arch-allowlist.ts` を参照する  
**WHEN** `tracking` が `"R1"` のエントリを確認する  
**THEN** `src/parser/request-md.ts` → `core/request/types`、`src/parser/rules/*.ts` → `core/validation/types`、`src/parser/rules/index.ts` → `core/validation/registry` を含む R1 グループが全件 allowlist されている

---

### TC-014: R3 の allowlist エントリが存在すること

**Category**: unit
**Priority**: must
**Source**: request.md AC「R3（config・state→core/step）が allowlist に file + B-# + tracking 付きで列挙されている」/ design.md 違反表 #12, #16

**GIVEN** `arch-allowlist.ts` を参照する  
**WHEN** `tracking` が `"R3"` のエントリを確認する  
**THEN** `src/config/migrate.ts` → `core/step/step-names` および `src/state/schema.ts` → `core/step/step-names` のエントリが存在する

---

### TC-015: R4 の allowlist エントリが存在すること

**Category**: unit
**Priority**: must
**Source**: request.md AC「R4（util→core・util→他層）が allowlist に file + B-# + tracking 付きで列挙されている」/ design.md B-4 違反表 #1〜#6

**GIVEN** `arch-allowlist.ts` を参照する  
**WHEN** `tracking` が `"R4"` のエントリを確認する  
**THEN** `src/util/slugify.ts` → `core/request/store` および `src/util/copy-artifacts.ts` → `prompts/rules`, `logger/stdout`, `errors`, `templates/step-output-templates`, `state/schema` の 6 件のエントリが存在する

---

### TC-016: B3-logger の allowlist エントリが存在すること

**Category**: unit
**Priority**: must
**Source**: design.md 違反表 #18「B3-logger: `src/logger/pipeline-logger.ts` → `core/event/event-bus`」

**GIVEN** `arch-allowlist.ts` を参照する  
**WHEN** `tracking` が `"B3-logger"` のエントリを確認する  
**THEN** `src/logger/pipeline-logger.ts` → `core/event/event-bus` のエントリが存在する

---

### TC-017: B3-state-port の allowlist エントリが存在すること

**Category**: unit
**Priority**: must
**Source**: design.md 違反表 #13〜#15「B3-state-port: `state/schema.ts` → `core/port/model-usage`, `core/port/report-result`」

**GIVEN** `arch-allowlist.ts` を参照する  
**WHEN** `tracking` が `"B3-state-port"` のエントリを確認する  
**THEN** `src/state/schema.ts` → `core/port/model-usage` および `core/port/report-result` のエントリが存在する（import type / export type の両方を含む）

---

### TC-018: B3-state-helpers の allowlist エントリが存在すること

**Category**: unit
**Priority**: must
**Source**: design.md 違反表 #17「B3-state-helpers: `src/state/helpers.ts` → `core/port/report-result`」

**GIVEN** `arch-allowlist.ts` を参照する  
**WHEN** `tracking` が `"B3-state-helpers"` のエントリを確認する  
**THEN** `src/state/helpers.ts` → `core/port/report-result` のエントリが存在する

---

### TC-019: B-3 regression guard が allowlist 外の新規 edge を検出すること

**Category**: unit
**Priority**: must
**Source**: tasks.md T-04 AC「B-3 regression guard: allowlist にない新規 `parser/x.ts` → `core/y.ts` が検出される」/ request.md AC「allowlist に無い新規の上向き edge を足すと suite が red になる」

**GIVEN** T-04 の B-3 regression guard test が core-invariants.test.ts に存在する  
**WHEN** `{ file: "src/parser/x.ts", line: 5, content: 'import { Foo } from "../core/y.js";' }` という synthetic `GrepMatch` を B-3 allowlist でフィルタする  
**THEN** violations が 1 件検出され、regression guard の assert が通ることを確認できる

---

### TC-020: B-4 regression guard が allowlist 外の新規 edge を検出すること

**Category**: unit
**Priority**: must
**Source**: tasks.md T-04 AC「B-4 regression guard: allowlist にない新規 `util/x.ts` → `state/baz.ts` が検出される」

**GIVEN** T-04 の B-4 regression guard test が core-invariants.test.ts に存在する  
**WHEN** `{ file: "src/util/x.ts", line: 3, content: 'import { bar } from "../state/baz.js";' }` という synthetic `GrepMatch` を B-4 allowlist でフィルタする  
**THEN** violations が 1 件検出され、regression guard の assert が通ることを確認できる

---

### TC-021: B-3 allowlist suppression が既知エントリを suppress すること

**Category**: unit
**Priority**: must
**Source**: tasks.md T-04 AC「B-3 allowlist suppression: 既知エントリが suppress される」

**GIVEN** T-04 の B-3 allowlist suppression test が core-invariants.test.ts に存在する  
**WHEN** `src/parser/request-md.ts` の `core/request/types` import に対応する synthetic `GrepMatch` を B-3 allowlist でフィルタする  
**THEN** violations が 0 件になり、suppress が正常に機能していることを確認できる

---

### TC-022: B-3 regression guard の test name が仕様通りであること

**Category**: unit
**Priority**: should
**Source**: tasks.md T-04「test name: `"detects new upward import into core/ not in allowlist (B-3 regression guard)"`」

**GIVEN** T-04 の describe ブロック内に regression guard test が追加されている  
**WHEN** test name の文字列を確認する  
**THEN** `"detects new upward import into core/ not in allowlist (B-3 regression guard)"` という名前の it が存在する

---

### TC-023: B-4 regression guard の test name が仕様通りであること

**Category**: unit
**Priority**: should
**Source**: tasks.md T-04「test name: `"detects new external import in util/ not in allowlist (B-4 regression guard)"`」

**GIVEN** T-04 の describe ブロック内に B-4 regression guard test が追加されている  
**WHEN** test name の文字列を確認する  
**THEN** `"detects new external import in util/ not in allowlist (B-4 regression guard)"` という名前の it が存在する

---

### TC-024: module-boundary delta spec ファイルが存在すること

**Category**: manual
**Priority**: must
**Source**: tasks.md T-05 AC「delta spec が `specrunner/changes/arch-upward-edge-ratchet/specs/module-boundary/spec.md` に存在する」

**GIVEN** T-05 が完了している  
**WHEN** `specrunner/changes/arch-upward-edge-ratchet/specs/module-boundary/spec.md` のパスを確認する  
**THEN** ファイルが存在する

---

### TC-025: delta spec の Requirement header が baseline と完全一致すること

**Category**: manual
**Priority**: must
**Source**: tasks.md T-05 AC「MODIFIED Requirement の header が baseline と完全一致する」

**GIVEN** delta spec の `## Requirements` セクションが存在する  
**WHEN** MODIFIED として記載されている Requirement の `### Requirement:` header 文字列を baseline spec と比較する  
**THEN** header 文字列が完全に一致している（大文字小文字・スペース含む）

---

### TC-026: delta spec が「Architecture Enforcement Covers Entire Core」の B-3/B-4 拡張を反映すること

**Category**: manual
**Priority**: must
**Source**: tasks.md T-05「B-3/B-4 が src-wide deferred ではなく実 assert で被覆されていることを反映する」

**GIVEN** delta spec が存在する  
**WHEN** 「Architecture Enforcement Covers Entire Core」に対応する MODIFIED Requirement を参照する  
**THEN** B-3 が shared-kernel + persistence ディレクトリを scan すること、B-4 が `util/` を scan することが Scenario に記載されており、「deferred」という文言が削除されている

---

### TC-027: delta spec が「Ratchet Allowlist Documents Known Divergences」の scope 拡張を反映すること

**Category**: manual
**Priority**: must
**Source**: tasks.md T-05「allowlist の scope が `src/core/` 内だけでなく B-3/B-4 の violation も含むことを反映する」

**GIVEN** delta spec が存在する  
**WHEN** 「Ratchet Allowlist Documents Known Divergences」に対応する MODIFIED Requirement を参照する  
**THEN** B-3（shared-kernel/persistence → core）および B-4（util → any）の violation が allowlist の scope に含まれることが記載されている

---

### TC-028: delta spec の各 Requirement に最低 1 つの Scenario があること

**Category**: manual
**Priority**: must
**Source**: tasks.md T-05 AC「各 Requirement に最低 1 つの Scenario がある」

**GIVEN** delta spec が存在する  
**WHEN** MODIFIED として記載されている各 Requirement を参照する  
**THEN** それぞれに `#### Scenario:` ブロックが 1 つ以上含まれている

---

### TC-029: delta spec 本文に SHALL または MUST が含まれること

**Category**: manual
**Priority**: must
**Source**: tasks.md T-05 AC「本文に `SHALL` or `MUST` が含まれる」

**GIVEN** delta spec が存在する  
**WHEN** ファイル全体の本文を確認する  
**THEN** `SHALL` または `MUST` の文字列が 1 箇所以上含まれている

---

### TC-030: allowlist エントリが invariant 順・file 順で配置されていること

**Category**: unit
**Priority**: should
**Source**: tasks.md T-01「エントリは invariant 順（B-3 → B-4）、invariant 内は file 順で配置する」

**GIVEN** `arch-allowlist.ts` の `ARCH_ALLOWLIST` 配列が存在する  
**WHEN** B-3 エントリと B-4 エントリの相対位置を確認する  
**THEN** B-3 の全エントリが B-4 の全エントリより前に配置されており、既存コメントブロック体裁に従って整列されている

---

### TC-031: `bun run build` が成功すること

**Category**: manual
**Priority**: must
**Source**: tasks.md T-06 AC

**GIVEN** 実装変更が完了している  
**WHEN** `bun run build` を実行する  
**THEN** exit code 0 で完了する

---

### TC-032: `bun run typecheck` が成功すること

**Category**: manual
**Priority**: must
**Source**: tasks.md T-06 AC

**GIVEN** 実装変更が完了している  
**WHEN** `bun run typecheck` を実行する  
**THEN** exit code 0 で完了する

---

### TC-033: `bun run lint` が成功すること

**Category**: manual
**Priority**: must
**Source**: tasks.md T-06 AC

**GIVEN** 実装変更が完了している  
**WHEN** `bun run lint` を実行する  
**THEN** exit code 0 で完了する

---

### TC-034: `bun run test` が全 suite green で完了すること

**Category**: integration
**Priority**: must
**Source**: tasks.md T-06 AC / request.md AC「プロジェクト標準 verification が green」

**GIVEN** B-3/B-4 の実 assert と T-04 regression guard が実装されており、allowlist が全件を網羅している  
**WHEN** `bun run test` を実行する  
**THEN** core-invariants.test.ts の B-3/B-4 describe を含む全テストが PASS し、exit code 0 で完了する

---

### TC-035: B-3 describe の docstring に「deferred」が含まれないこと

**Category**: unit
**Priority**: should
**Source**: tasks.md T-02「旧 docstring の「deferred」文言を削除する」

**GIVEN** B-3 describe ブロックが実 assert に書き換えられている  
**WHEN** describe/it の docstring 文字列を確認する  
**THEN** `deferred` という文言が含まれていない

---

### TC-036: B-4 describe の docstring に「deferred」が含まれないこと

**Category**: unit
**Priority**: should
**Source**: tasks.md T-03「旧 docstring の「deferred」文言を削除する」

**GIVEN** B-4 describe ブロックが実 assert に書き換えられている  
**WHEN** describe/it の docstring 文字列を確認する  
**THEN** `deferred` という文言が含まれていない

---

### TC-037: B-3 describe の docstring が scan scope を明記していること

**Category**: unit
**Priority**: should
**Source**: tasks.md T-02「describe/it の docstring を更新し、scan scope（非-core ディレクトリ → core/ への上向き import）を明記する」

**GIVEN** B-3 describe/it ブロックが実装されている  
**WHEN** docstring の内容を確認する  
**THEN** 非-core ディレクトリから `core/` への上向き import を検査することが読み取れる記述が含まれている

---

### TC-038: B-4 describe の docstring が scan scope を明記していること

**Category**: unit
**Priority**: should
**Source**: tasks.md T-03「describe/it の docstring を更新し、scan scope（util/ → any src/ module）を明記する」

**GIVEN** B-4 describe/it ブロックが実装されている  
**WHEN** docstring の内容を確認する  
**THEN** `util/` から外部 `src/` モジュールへの import を検査することが読み取れる記述が含まれている

---

### TC-039: arch-allowlist.ts の TypeScript コンパイルが通ること

**Category**: manual
**Priority**: must
**Source**: tasks.md T-01 AC「TypeScript コンパイルが通る」

**GIVEN** `arch-allowlist.ts` に B-3/B-4 エントリが追加されている  
**WHEN** `bun run typecheck` を実行する  
**THEN** `arch-allowlist.ts` に起因する型エラーが発生しない

---

### TC-040: 既存の B-1/B-2/B-5〜B-8 enforcement が引き続き green であること

**Category**: integration
**Priority**: should
**Source**: request.md「B-1/B-2/B-5/B-6/B-7/B-8（#482 で既に enforce 済み）の再実装はスコープ外」/ design.md Non-Goals

**GIVEN** B-3/B-4 の変更が core-invariants.test.ts に追加されている  
**WHEN** `bun run test` で core-invariants.test.ts の全 describe ブロックを実行する  
**THEN** B-1/B-2/B-5〜B-8 の既存 test が引き続き PASS しており、今回の変更によるリグレッションが発生していない

---

## Result

```yaml
result: completed
total: 40
automated: 30
manual: 10
must: 32
should: 8
could: 0
blocked_reasons: []
```
