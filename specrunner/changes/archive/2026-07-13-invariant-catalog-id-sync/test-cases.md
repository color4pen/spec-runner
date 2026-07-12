# Test Cases: 不変条件カタログ（doc）と歯（test / allowlist）の B-x ID 集合の一致固定

## Summary

- **Total**: 17 cases
- **Automated** (unit/integration): 15
- **Manual**: 2
- **Priority**: must: 10, should: 5, could: 2

---

### TC-001: catalog と歯が同じ B-x ID 集合を参照する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: doc カタログと歯の B-x ID 集合の双方向一致を test で固定する > Scenario: catalog and teeth reference the same B-x ID set

---

### TC-002: describe ブロックにあり catalog に無い ID が parity で red になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: doc カタログと歯の B-x ID 集合の双方向一致を test で固定する > Scenario: an invariant enforced by a describe block but missing from the catalog fails

---

### TC-003: catalog にあり歯に無い ID が parity で red になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: doc カタログと歯の B-x ID 集合の双方向一致を test で固定する > Scenario: an invariant documented in the catalog but missing from the teeth fails

---

### TC-004: model.md §4 表と conformance.md (A) 表の ID 集合が一致する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: doc カタログと歯の B-x ID 集合の双方向一致を test で固定する > Scenario: the two catalog tables must agree

---

### TC-005: allowlist は部分集合でよいが存在しない describe ID を参照すると red になる

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: doc カタログと歯の B-x ID 集合の双方向一致を test で固定する > Scenario: allowlist may be a subset but must not reference a non-existent invariant

---

### TC-006: §4 表の散文中の B-x 言及はカタログ ID として抽出されない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: catalog 抽出は §4 表と (A) 検査表のセル行に限定する > Scenario: prose B-x mentions are not extracted as catalog IDs

---

### TC-007: カタログ対象セクション外の表行はカタログ ID に寄与しない

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: catalog 抽出は §4 表と (A) 検査表のセル行に限定する > Scenario: non-catalog tables do not contribute IDs

---

### TC-008: catalog から B-12 を除いた摂動テキストで parity が red になる（検出テスト）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: B-12 が doc カタログから欠落した状態を検出テストで固定する > Scenario: removing B-12 from the catalog text makes the parity check red

---

### TC-009: model / conformance / describe の各抽出 ID 集合が空でない（liveness）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: liveness — 抽出した ID 集合が空でない > Scenario: non-empty extracted sets

---

### TC-010: allowlist が空でも liveness は失敗しない

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: liveness — 抽出した ID 集合が空でない > Scenario: an empty allowlist does not fail liveness

---

### TC-011: arch-allowlist.ts の docstring 範囲が "B-1 through B-12" に現行化されている

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: 陳腐化した散文範囲表記を現行範囲に更新する > Scenario: allowlist docstring range is current

---

### TC-012: core-invariants.test.ts の docstring 範囲が "B-1 through B-12" に現行化されている

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: 陳腐化した散文範囲表記を現行範囲に更新する > Scenario: core-invariants docstring range is current

---

### TC-013: 既存の B-1〜B-12 各検査と DSM 検査が無変更で green

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 既存の B-1〜B-12 各検査は無変更で green > Scenario: existing architecture suite stays green with no assertion change

---

### TC-014: sliceSection はセクション見出しが見つからないとき throw する

**Category**: unit
**Priority**: should
**Source**: design.md D2 / tasks.md T-01

**GIVEN** `sliceSection` が受け取るテキストに `startRe` にマッチする行が存在しない  
**WHEN** `sliceSection(text, startRe, endRe)` を呼ぶ  
**THEN** 空文字列やタイプエラーでなく、見出し不在を示すメッセージ付きの例外を throw する

---

### TC-015: allowlist の "DSM" エントリが B-x ID 集合に混入しない

**Category**: unit
**Priority**: could
**Source**: design.md D2 / tasks.md T-01

**GIVEN** `arch-allowlist.ts` に `invariant: "DSM"` エントリと `invariant: "B-N"` エントリが共存している  
**WHEN** `extractAllowlistIds` がファイルテキストをパースする  
**THEN** 返される集合は `B-<n>` 形式の ID のみを含み、`"DSM"` は含まない

---

### TC-016: T-05 の docstring 編集が抽出器の出力に影響しない

**Category**: unit
**Priority**: could
**Source**: design.md D6 / tasks.md T-05

**GIVEN** `arch-allowlist.ts` と `core-invariants.test.ts` に T-05 の "B-1 through B-12" docstring 編集が適用されている  
**WHEN** `extractAllowlistIds` / `extractDescribeIds` が各ファイルのテキストをパースする  
**THEN** 抽出される B-x ID 集合は編集前と同一である（`invariant: "B-` / `describe("B-` パターンが docstring コメントにマッチしない）

---

### TC-017: 新テストファイルが vitest に自動検出され TC-ICS-* が実行される

**Category**: integration
**Priority**: should
**Source**: tasks.md T-06

**GIVEN** `invariant-catalog-parity.test.ts` が `tests/unit/architecture/` に配置されている  
**WHEN** `bun run test` を実行する（vitest `include: tests/**/*.test.ts`）  
**THEN** TC-ICS-01〜TC-ICS-05 の 5 件が実行されてテスト出力に現れ、すべて pass する

---

## Result

```yaml
result: completed
total: 17
automated: 15
manual: 2
must: 10
should: 5
could: 2
blocked_reasons: []
```
