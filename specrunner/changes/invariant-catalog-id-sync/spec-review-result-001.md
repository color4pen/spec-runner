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
| 1 | LOW | Spec Precision | tasks.md T-01 | `sliceSection` の `endRe` 探索開始位置が暗黙的。`### (A)` は `/^###\s+/m` にも合致するため、実装者が `i > startIdx`（start 行より後）から探索しなければ (A) セクションが空文字列を返す。"次の行からマッチを探す" が仕様の意図だが tasks.md に明文がない。 | T-01 の `sliceSection` の説明に「`endRe` の探索は start 行の次の行から開始する」を一行追記すると実装ブレが防げる。機能的には `i > startIdx` の条件で自然実装されるため blocking ではない。 |
| 2 | LOW | Test Coverage | tasks.md T-04 | `TC-ICS-05` は `extractModelCatalogIds(dropB12(modelText))` のみを必須とし、`extractConformanceCatalogIds` の確認は "Optionally" 扱い。歴史的 desync は両表が B-11 止まりだったため、conformance 側も同等に検出できることを確認する価値がある。ただし parity 計算は `catalogIds = modelIds`（D3）を使うため、model 側だけで十分に機能することは設計上正しい。 | オプション扱いのままでも問題なし。強化したければ T-04 の optional を "also assert" に格上げするだけ。 |
| 3 | LOW | Clarity | spec.md §Detection | 検出シナリオは「B-12 が **undocumented**（歯にあり doc に無い）」として失敗することを確認するが、反転ケース（「documented-but-unenforced」: doc にあり歯に無い）の検出テストは仕様にない。現在の目標は実 desync の再現固定なので範囲外だが、asymmetric coverage であることを明示すると実装者が混乱しない。 | 説明的な注記のみで十分。実装変更は不要。 |

## Review Notes

**技術的整合性**: 仕様全体の整合性は高い。

- **D1（独立ファイル）**: `core-invariants.test.ts` 内の `describe("B-N")` 文字列が自己抽出で汚染されるリスクを、別ファイルに分離することで構造的に解消している。正しい設計判断。
- **D3（allowlist の部分集合吸収）**: allowlist は現状 {B-1, B-6, B-12} で enforced 集合の部分集合。`teethIds = describeIds ∪ allowlistIds` の union 定式化により、allowlist が完全 burn-down でゼロになっても parity が壊れない。D4 の liveness との組み合わせも一貫している。
- **D2（セクション限定パース）**: `sliceSection` の throw-on-missing 設計と `size > 0` liveness の組み合わせで、壊れた抽出が vacuous pass するすべての経路を塞いでいる。要件 2（散文除外）はセクション限定＋行頭セルパターンの二重防御で満たされている。
- **D5（テキスト摂動）**: 集合を直接いじる合成注入でなく実 doc テキストの行除去を使うことで、パーサの行欠落追随まで end-to-end で検証できる。perturbation guard も適切。
- **セキュリティ**: テストコードがリポジトリ内のローカルファイルを `fs.readFileSync` で読む処理のみ。外部入力・ネットワーク・認証・秘密情報は無関係。CODEOWNERS ゲートは保持される。OWASP 該当なし。
- **正規表現の確認**: `extractAllowlistIds` の `/invariant:\s*"B-(\d+)"/g` は `"DSM"` エントリや JSDoc `e.g. "B-1"` を除外する（`invariant:` キー接頭が必要）。`extractDescribeIds` の `/describe\("B-(\d+)/g` は新ファイルの外枠 `describe("invariant catalog ↔ teeth B-x ID parity"...)` を拾わない（タイトルが `B-` で始まらないため）。いずれも正しい。
- **受け入れ基準との対応**: request.md の 4 要件と 6 受け入れ基準はすべて spec.md のシナリオと tasks.md のタスクに網羅されている。
