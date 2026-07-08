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
| 1 | MEDIUM | Design | design.md / tasks.md T-01 | `minChangedLineCoverage: 0` が gate を無効化するフットガン。設定値 0 は `executed/changedDa >= 0` = 常に true になり、未設定時の既定（`executed >= 1`）より弱い閾値になる。「強化閾値」として設計されているフィールドが逆方向に機能する。 | zod validation で `minChangedLineCoverage` の最小を `gt(0)` に変更するか、スキーマコメントに「0 を指定すると閾値チェックが無効化される」旨を明記し、意図しない利用を防ぐ。 |
| 2 | LOW | Completeness | spec.md | `minChangedLineCoverage` 指定時（> 0 の数値）の合否シナリオが spec.md にない。要件本文に記述はあるが、「指定時・閾値未達 → fail」「指定時・閾値達成 → pass」のシナリオが欠けており、実装後に regression 固定ができない。 | spec.md の「既定閾値は実行された変更行 > 0、config で強化可能」要件に Scenario を 2 件追加する（例: `minChangedLineCoverage: 1.0` で変更 DA 行の一部未実行 → fail / 全実行 → pass）。 |
| 3 | LOW | Interface | tasks.md T-06 | `verification.coverage` 未宣言時に verification-result.md へ skip note を出す機構が未規定。現在の `writeVerificationResult(result, outputPath, cwd)` は `VerificationResult` のみを受け取り、coverage 設定の有無を知らない。「どこが note の存在を判断し、どの引数で渡すか」が tasks / spec いずれにも書かれていない。 | T-06 に「`writeVerificationResult` に `coverageConfig?: CoverageConfig` を追加するか、`VerificationResult` に `coverageGateSkipped?: boolean` を持たせる」等、インターフェース変更の方針を明記する。 |
| 4 | LOW | Robustness | design.md D7 | coverage ツールが SF パスをシンボリックリンク経由の絶対パスで出力する場合（macOS: `/var/` → `/private/var/`）、cwd プレフィクス除去が失敗し、同ファイルが「lcov 不在」として誤 fail になる可能性がある。 | T-02 の受け入れ基準に「SF が symlink 経由の絶対パスで cwd と一致しない場合は `exclude` で回避するか、normalize 時に `realpath` を試みてフォールバックする」旨をリスクとして注記する（実装判断は実装者に委ねてよいが、リスクとして可視化する）。 |
| 5 | LOW | Completeness | design.md D9 / spec.md | TC-ID 境界の定義が「後が数字 or `-数字` でない」に限定されており、文字 suffix（`TC-1A`）や下線 suffix（`TC-1_foo`）の扱いが未定義。正規表現実装者が独自に判断することになる。 | D9 に「後続が英数字・ハイフン・アンダースコア以外でのみマッチ」等、境界文字セットを具体的に定義するか、許容する TC-ID 形式を `TC-\d+` に限定する旨を明記する。 |

## 評価サマリ

設計の骨格（git diff × lcov × exit code の継ぎ目限定、include 必須 + fail-closed、TC-ID 照合の残置・厳密化、純関数 evaluator と orchestration の分離）は明快で一貫している。D1〜D11 は相互依存を整理しており、既存 runner テストとの互換性（D4 の「未宣言時は phase 追加なし」）も正しく設計されている。セキュリティ上の懸念については、`coverage.command` は既存 `verification.commands` と同一の `sh -c` 実行モデルを踏襲しており、新たな攻撃面は生じない。lcov パースは `SF:`/`DA:` 行のみの純テキスト処理でコード実行を伴わない。SF パスが git diff 出力（リポジトリ相対）と突合されるため、lcov 内のパス操作がシステム外のファイルに影響することはない。HIGH/CRITICAL 指摘なし。MEDIUM 1 件（`minChangedLineCoverage: 0` フットガン）は T-01 の zod バリデーション修正で対処可能であり、実装前に仕様を変更する必要はなく実装タスクの受け入れ基準として対処すれば十分と判断した。承認。
