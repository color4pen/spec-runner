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
| 1 | LOW | Design | design.md / tasks.md (T-03) | `listChangedFiles` のシグネチャは `baseBranch: string` だが、D3 は `headBeforeStep`（コミット SHA）を渡す提案をしている。git はこの位置で SHA を受け入れるため動作するが、型注釈と呼び出し意図が乖離している。ManagedRuntime は `captureHeadSha` が `null` を返すため guard は機能する（確認済み）。将来の実装者の混乱リスクにとどまる。 | 実装者は `// NOTE: listChangedFiles accepts a commit SHA here — git accepts SHAs in the baseBranch position` というコメントを追加するだけで十分。インターフェース変更は不要。 |
| 2 | LOW | Implementation ambiguity | tasks.md (T-03) | no-op 検出の verdict override の実装方法として「局所変数でフラグを立てて finalizeStep 内で差し替える」と「`overrideVerdict?` フィールドを runResult に追加する」の 2 案が併記されており、実装者任せになっている。どちらでも機能するが、spec.md 側の要件（stderr 出力・verdict 確定）は明確なため問題は軽微。 | T-03 の注記通り「実装者はシンプルな方を選ぶ」で問題なし。specrunner run で動作確認できれば OK。 |

## Review Notes

### RCA コード検証（実コードとの照合）

全 5 症状の根本原因を実コードで確認した。

**症状 1（regression-gate が console `approved`）**: `executor.ts:finalizeStep` の isJudgeStep 分岐は `deriveJudgeVerdict` を無条件使用。同関数は `critical|high` がないと `approved` を返す（`judge-verdict.ts:32-40`）。regression-gate の `buildMessage` は `severity=high / resolution=fixable` を指示しているが、実運用でエージェントが medium/low で報告したため `approved` が出た。D1 の `deriveRegressionGateVerdict`（fixable → needs-fix 無条件）は正しい修正。

**症状 2（request-review が escalation）**: `parseRequestReviewReportInput`（`report-result.ts:391`）は `ok=true` かつ findings フィールド不在のとき `parseFindings(undefined, true)` を呼ぶ。`parseFindings` は `!Array.isArray(undefined)` → `{ ok: false }` を返すため parse 失敗 → リトライ → `toolResult=null` → `"needs-discussion"` フォールバック（`executor.ts:799`）。D2 の findings 省略許容は正しい。

**症状 3（code-fixer no-op）**: `code-fixer.ts:115` に `completionVerdict: "approved"` が無条件設定されており、`executor.ts:751-761` の producer 分岐は変更有無を一切確認しない。D3 の `noOpDetect` フラグは正しい設計。`captureHeadSha` は managed runtime で `null` を返す（`managed.ts:319`）ため、guard 条件 `headBeforeStep !== null` で managed runtime の誤発動を防げる。

**症状 4（iter 3/2）**: `pipeline.ts:286` で `maxIterations: this.maxIterations`（グローバル値）を渡している。`resolveMaxIterations(currentStep)` は同クラスに既存（line 185）。D4 は 1 行修正。

**症状 5（drafts warning）**: `orchestrator.ts:272` で存在確認なく `git add draftsDir()` を実行。D5 の `fs.exists` 分岐は正しい。

### セキュリティレビュー

本変更は全て内部パイプラインロジック（verdict 導出関数・parser・git 操作）の修正であり、外部からの新規入力パスは追加されない。

- **Injection（OWASP A3）**: `listChangedFiles` の結果はリポジトリ内相対パスであり、ユーザー提供入力ではない。フィルタ処理はプレフィックス比較のみ（コードインジェクションなし）。
- **D2（findings 省略許容）**: findings 欄が存在するが invalid な場合は従来通り parse 失敗とするため、構造的に不正なデータを通過させない。エージェントが意図的に findings を省略して HIGH 指摘を隠す理論的リスクはあるが、エージェント trust model の範囲内（ツールチェーン自体が攻撃対象となる脅威モデルは本ツールのスコープ外）。
- OWASP Top 10 で追加リスクとなる項目はなし。

### 仕様品質

- 全 5 要件に Given/When/Then シナリオが揃っており、実装の境界条件（noOpDetect absent・runtimeStrategy null・他 judge step 非影響）が網羅されている。
- `judgeVerdictFn` の wire 設計は「step as data」パターンに沿っており、executor へのステップ名ハードコードを回避している。
- spec.md と tasks.md は一貫しており、実装対象ファイル一覧と変更内容の照合が取れている。
- T-06 に build / typecheck / lint / test の結合確認が明示されている。
