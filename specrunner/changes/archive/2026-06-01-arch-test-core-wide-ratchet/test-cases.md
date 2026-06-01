# Test Cases: arch-test-core-wide-ratchet

## Summary

- **Total**: 28 cases
- **Automated** (unit/integration): 26
- **Manual**: 2
- **Priority**: must: 20, should: 6, could: 2

---

### TC-001: allowlist ファイルが TypeScript としてコンパイル可能であること

**Category**: unit  
**Priority**: must  
**Source**: T-01 / AC「allowlist ファイルが TypeScript としてコンパイル可能」

**GIVEN** `tests/unit/architecture/arch-allowlist.ts` が作成されている  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーなくコンパイルが完了する

---

### TC-002: allowlist の全エントリに file / invariant / tracking が記載されていること

**Category**: unit  
**Priority**: must  
**Source**: T-01 / AC「全エントリに file / invariant / tracking が記載されている」・D2

**GIVEN** `AllowlistEntry` 型が `{ file: string; pattern: string; invariant: string; tracking: string; comment?: string }` で定義されている  
**WHEN** `arch-allowlist.ts` の全エントリを確認する  
**THEN** `file`・`pattern`・`invariant`・`tracking` の 4 フィールドが全エントリで埋まっており、空文字列エントリが存在しない

---

### TC-003: B-2/R2 allowlist エントリが存在すること（runtime SDK 直 import）

**Category**: unit  
**Priority**: must  
**Source**: T-01 / 既知 divergence B-2/R2

**GIVEN** `arch-allowlist.ts` に allowlist エントリが定義されている  
**WHEN** エントリ一覧を確認する  
**THEN** `file: "src/core/runtime/local.ts"`, `invariant: "B-2"`, `tracking: "R2"` のエントリが存在する

---

### TC-004: B-1 allowlist エントリが adapter 直 import 3 件すべてを網羅していること

**Category**: unit  
**Priority**: must  
**Source**: T-01 / 既知 divergence B-1

**GIVEN** `arch-allowlist.ts` に allowlist エントリが定義されている  
**WHEN** エントリ一覧を確認する  
**THEN** 以下の 3 組み合わせそれぞれに `invariant: "B-1"` を持つエントリが存在する:
- `src/core/runtime/local.ts` × `adapter/claude-code/agent-runner`
- `src/core/runtime/local.ts` × `adapter/dispatching/agent-runner`
- `src/core/runtime/managed.ts` × `adapter/managed-agent/agent-runner`

---

### TC-005: B-8 allowlist エントリが config.runtime 分岐を網羅していること

**Category**: unit  
**Priority**: must  
**Source**: T-01 / 既知 divergence B-8

**GIVEN** `arch-allowlist.ts` に allowlist エントリが定義されている  
**WHEN** エントリ一覧を確認する  
**THEN** `src/core/preflight.ts` および `src/core/step/executor.ts` それぞれに `invariant: "B-8"` のエントリが存在し、`executor.ts` の 4 箇所が網羅されている

---

### TC-006: B-6 allowlist エントリが raw process.env 参照 3 件を網羅していること

**Category**: unit  
**Priority**: must  
**Source**: T-01 / 既知 divergence B-6

**GIVEN** `arch-allowlist.ts` に allowlist エントリが定義されている  
**WHEN** エントリ一覧を確認する  
**THEN** `src/core/preflight.ts`・`src/core/lifecycle/diagnostic.ts`・`src/core/verification/commands.ts` それぞれに `invariant: "B-6"` のエントリが存在する

---

### TC-007: B-1 テスト — core が adapter 層を直 import しないこと

**Category**: unit  
**Priority**: must  
**Source**: T-02 / AC「B-1〜B-4 の各不変条件に対応するテストブロックが存在」

**GIVEN** `tests/unit/architecture/core-invariants.test.ts` が存在し allowlist がロードされている  
**WHEN** `src/core/`（`runtime/` 除く）内の全 TypeScript ファイルを対象に `from ['"].*adapter/` パターンで grep する  
**THEN** 検出された行のうち allowlist に登録されていないものがゼロであり、テストが pass する

---

### TC-008: B-2 テスト — core が SDK を直 import しないこと

**Category**: unit  
**Priority**: must  
**Source**: T-02 / AC「allowlist 込みで全テスト green」

**GIVEN** `core-invariants.test.ts` が存在し allowlist がロードされている  
**WHEN** `src/core/` 内の全 TypeScript ファイルを対象に `@anthropic-ai/` パターンで grep する  
**THEN** 検出された行のうち allowlist 外のものがゼロであり、テストが pass する

---

### TC-009: B-3 coverage — closure model による core から shared-kernel への逆流検出

**Category**: unit  
**Priority**: must  
**Source**: T-02 / 「closure テスト: §3 の forbidden edges のうち core が from/to となる edge を網羅的に assert」

**GIVEN** `core-invariants.test.ts` に closure model チェックが実装されている  
**WHEN** `src/core/` 内のファイルから `parser/`・`config/`・`state/` への import を grep する  
**THEN** allowlist 外の hit がゼロであり、closure が成立している（逆流が検出された場合はテストが fail する）

---

### TC-010: B-4 coverage — closure model による core から leaf 層への不正 import 検出

**Category**: unit  
**Priority**: must  
**Source**: T-02 / 「closure テスト」

**GIVEN** `core-invariants.test.ts` に closure model チェックが実装されている  
**WHEN** `src/core/` 内のファイルから `util/` への import を grep する  
**THEN** 許容された方向の import のみが存在し、allowlist 外の forbidden edge がゼロである

---

### TC-011: B-5 テスト — core の判定系ファイルで生 I/O 直呼びが無いこと

**Category**: unit  
**Priority**: must  
**Source**: T-03 / B-5 テスト

**GIVEN** `core-invariants.test.ts` が存在する  
**WHEN** `src/core/` 内のファイルを対象に `readFile\b|readFileSync\b|readdir\b|existsSync\b|statSync\b` パターンで grep する（`__tests__/` 除外）  
**THEN** 検出された行がゼロであり、テストが pass する（現状違反ゼロのため allowlist エントリ不要）

---

### TC-012: B-6 テスト — core 内の raw process.env 参照が allowlist に収まること

**Category**: unit  
**Priority**: must  
**Source**: T-03 / B-6 テスト

**GIVEN** `core-invariants.test.ts` が存在し allowlist がロードされている  
**WHEN** `src/core/` 内の全 TypeScript ファイルを対象に `process\.env` パターンで grep する  
**THEN** 検出された行のうち allowlist 外のものがゼロであり、テストが pass する

---

### TC-013: B-7 テスト — core 内の raw stdout/stderr write が無いこと

**Category**: unit  
**Priority**: must  
**Source**: T-03 / B-7 テスト

**GIVEN** `core-invariants.test.ts` が存在する（B-7 は現状 allowlist エントリなし）  
**WHEN** `src/core/` 内の全 TypeScript ファイルを対象に `process\.(stdout|stderr)\.write\s*\(` パターンで grep する（`__tests__/` 除外）  
**THEN** 検出された行がゼロであり、テストが pass する

---

### TC-014: B-7 パターン — JSDoc コメント行で false positive が出ないこと

**Category**: unit  
**Priority**: should  
**Source**: T-03 / AC「B-7 パターンは call-site 限定で JSDoc false positive を出さない」

**GIVEN** `src/core/` 内に `process.stdout` を JSDoc コメント（`/** ... */` または `// ...`）で言及するファイルが存在するケースを想定する  
**WHEN** B-7 の grep パターン `process\.(stdout|stderr)\.write\s*\(` で検索する  
**THEN** コメント行のみへの言及はマッチせず、false positive がゼロである

---

### TC-015: B-8 テスト — config.runtime 参照が core/runtime 内のみ許容されること

**Category**: unit  
**Priority**: must  
**Source**: T-03 / B-8 テスト

**GIVEN** `core-invariants.test.ts` が存在し allowlist がロードされている  
**WHEN** `src/core/` 内の全 TypeScript ファイルを対象に `config\.runtime` パターンで grep する  
**THEN** `src/core/runtime/` 外のファイルでの参照は allowlist に全て登録されており、allowlist 外の hit がゼロでテストが pass する

---

### TC-016: core/runtime 除外が解除されていること（enforcement スキャン対象に含まれる）

**Category**: unit  
**Priority**: must  
**Source**: 受け入れ基準「構造 enforcement が `core` 全体（`core/runtime` 除外を解除）を対象に assert する」

**GIVEN** `core-invariants.test.ts` の layer-mapping に `src/core/runtime/` が composition-root 層として定義されている  
**WHEN** テストスイートを実行する  
**THEN** `src/core/runtime/` 内のファイルが enforcement スキャン対象に含まれており、既存の allowlist エントリ（B-1/B-2）が当該ファイルのヒットを正しく吸収し false red が出ない

---

### TC-017: テストの describe/it 命名に不変条件番号が含まれること

**Category**: unit  
**Priority**: should  
**Source**: T-02 / AC「テストの describe/it 名が対応する invariant（B-#）を明記」

**GIVEN** `core-invariants.test.ts` が存在する  
**WHEN** ファイルの describe / it ブロック名を確認する  
**THEN** B-1, B-2, B-5, B-6, B-7, B-8 それぞれに対応するブロック名が存在し、名前に `B-1`〜`B-8` の形式で不変条件番号が含まれている

---

### TC-018: regression guard テスト — allowlist 外の forbidden edge で fail すること

**Category**: unit  
**Priority**: must  
**Source**: T-04 / AC「it("detects new forbidden edge not in allowlist") 相当のテストが存在」・受け入れ基準「allowlist に無い forbidden edge を1件足すと suite が red になる」

**GIVEN** `core-invariants.test.ts` に regression guard テストが実装されている  
**WHEN** allowlist に登録されていない forbidden import パス（仮想 violation）を grep 結果に inject する  
**THEN** テストが fail し、エラーメッセージに未登録の violation ファイルパスが含まれる

---

### TC-019: regression guard テスト — allowlist 内の violation は pass すること

**Category**: unit  
**Priority**: should  
**Source**: T-04 / 受け入れ基準「allowlist 込みで enforcement suite が green（false red なし）」

**GIVEN** `core-invariants.test.ts` の regression guard ロジックが実装されている  
**WHEN** allowlist に登録済みの violation パスを grep 結果に含めてテストを実行する  
**THEN** そのエントリはフィルタされてテストが pass する

---

### TC-020: delta spec が正しいパスに存在すること

**Category**: manual  
**Priority**: must  
**Source**: T-05 / 受け入れ基準「`specrunner/changes/arch-test-core-wide-ratchet/specs/module-boundary/spec.md` に存在」

**GIVEN** T-05 のタスクが完了している  
**WHEN** `specrunner/changes/arch-test-core-wide-ratchet/specs/module-boundary/spec.md` のパスを確認する  
**THEN** ファイルが存在する

---

### TC-021: delta spec に「Architecture Enforcement Covers Entire Core」要件が含まれること

**Category**: manual  
**Priority**: must  
**Source**: T-05 / 新規 Requirement 定義

**GIVEN** delta spec が存在する  
**WHEN** spec ファイルの内容を確認する  
**THEN** 「Architecture Enforcement Covers Entire Core」または同等の要件が存在し、`SHALL` または `MUST` キーワードが含まれており、少なくとも 1 つの Scenario が紐づいている

---

### TC-022: delta spec に「Ratchet Allowlist Documents Known Divergences」要件が含まれること

**Category**: manual  
**Priority**: must  
**Source**: T-05 / 新規 Requirement 定義

**GIVEN** delta spec が存在する  
**WHEN** spec ファイルの内容を確認する  
**THEN** 「Ratchet Allowlist Documents Known Divergences」または同等の要件が存在し、file + B-# + tracking の規約および「削除のみを正とする」規約が記載されており、`SHALL` または `MUST` キーワードが含まれている

---

### TC-023: delta spec に「Closure Model Prevents Unknown Edges」要件が含まれること

**Category**: manual  
**Priority**: must  
**Source**: T-05 / 新規 Requirement 定義

**GIVEN** delta spec が存在する  
**WHEN** spec ファイルの内容を確認する  
**THEN** 「Closure Model Prevents Unknown Edges」または同等の要件が存在し、allowlist 外の forbidden edge で red になることが記載されており、`SHALL` または `MUST` キーワードが含まれている

---

### TC-024: 標準 verification — bun run build が成功すること

**Category**: integration  
**Priority**: must  
**Source**: T-06 / 受け入れ基準「プロジェクト標準 verification が green」

**GIVEN** 全タスクの実装が完了している  
**WHEN** `bun run build` を実行する  
**THEN** exit code 0 で完了する

---

### TC-025: 標準 verification — bun run typecheck が成功すること

**Category**: integration  
**Priority**: must  
**Source**: T-06

**GIVEN** 全タスクの実装が完了している  
**WHEN** `bun run typecheck` を実行する  
**THEN** TypeScript 型エラーがなく exit code 0 で完了する

---

### TC-026: 標準 verification — bun run lint が成功すること

**Category**: integration  
**Priority**: must  
**Source**: T-06

**GIVEN** 全タスクの実装が完了している  
**WHEN** `bun run lint` を実行する  
**THEN** lint エラーがなく exit code 0 で完了する

---

### TC-027: 標準 verification — bun run test が全テスト pass すること

**Category**: integration  
**Priority**: must  
**Source**: T-06 / 受け入れ基準「allowlist 込みで enforcement suite が green（false red なし）」

**GIVEN** `arch-allowlist.ts`・`core-invariants.test.ts` が作成されている  
**WHEN** `bun run test` を実行する  
**THEN** 新規テストを含む全テストが pass し exit code 0 で完了する

---

### TC-028: 既存 module-boundary.test.ts が削除されずに残っていること

**Category**: unit  
**Priority**: should  
**Source**: D3「既存テストは core/request の B-1 regression guard として独立した価値がある」

**GIVEN** `core-invariants.test.ts` が新規作成されている  
**WHEN** `tests/unit/architecture/module-boundary.test.ts` の存在を確認する  
**THEN** 既存ファイルが削除されておらず、`bun run test` で引き続き pass している

## Result

```yaml
result: completed
total: 28
automated: 23
manual: 5
must: 20
should: 6
could: 2
blocked_reasons: []
```
