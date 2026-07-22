# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション検証（全 9 項目）

| アサーション | 確認結果 |
|---|---|
| `changed-line-coverage.ts:85-95` — include/exclude glob フィルタ（内容ベース判定なし） | ✓ 一致。`globMatch` による path フィルタのみ |
| `changed-line-coverage.ts:97-101` — `if (!lcov.has(file))` → `failedFiles.push({ file, reason: "not-loaded" })` | ✓ 一致。l.97 コメント、l.98 `if (!lcov.has(file))`、l.99 push、l.100 continue、l.101 `}` |
| `changed-line-coverage.ts:113-116` — DA レコード無し行の pass（TC-CLG-03 の受け皿） | ✓ 一致。l.113 コメント、l.114 `if (changedDaLines.length === 0)`、l.115 `continue` |
| `changed-line-coverage.ts:148-149` — `not loaded by test suite (absent from lcov)` 文言 | ✓ 一致。l.148 に文言あり |
| `changed-lines.ts:125-173` — `getChangedFilesAndLines`、hunk テキストは行番号抽出後に破棄 | ✓ 概ね一致。関数は l.125〜l.177。l.173 で `parseUnifiedDiffChangedLines(diffText)` を呼び出し以降 diffText は参照されない（破棄）。末尾は l.177 |
| `runner.ts:398,599` — `runChangedLineCoverageGate` 呼び出し箇所 | ✓ 一致 |
| `package.json` — `typescript` は devDependencies のみ | ✓ 一致。`dependencies` には `@anthropic-ai/sdk` のみ |
| `tests/unit/core/verification/changed-line-coverage.test.ts` — TC-CLG-03 / TC-CLG-04 存在 | ✓ 存在確認 |
| `EvaluateResult.skippedFiles: string[]` — 現行型（理由フィールドなし） | ✓ 確認。`skippedFiles: string[]` 定義あり（l.63） |

### 要件の実装可能性検証

**R1 (type-only 判定純粋関数)**: 許可構文の閉集合による字句判定、外部依存なし。実装可能。

**R2 (not-loaded 分岐への組み込み)**:
- 組み込み先の `evaluateChangedLineCoverage` は現在同期の pure 関数。ファイル読み取りが必要になる。
- 対処方針として (a) 評価関数を async に変更して読み取り込み、(b) `fileContents: Map<string, string>` を引数追加して呼び出し側（orchestrator）で読み取り、等が考えられる。request 本文はどちらかを明示していないが、R1 の「pure 関数」定義と分離すれば実装者は選択できる。
- `skippedFiles` への理由付き記録: 現行 `skippedFiles: string[]` に reason が付かない。stdout 出力に `[type-only]` を含める形なら型変更不要。インターフェース変更が必要かは実装判断に委ねられているが、intent（観測可能性）は明確。

**R3 (挙動保存)**: TC-CLG-03/04 が固定されており、既存挙動の意図は明確。

### 受け入れ基準の検証

受け入れ基準は概ね明確かつ機械検証可能。1 件の数値誤りを確認（後述 Findings 参照）。

## 検証できなかった項目

None。全アサーションを実コードで確認済み。

## Findings 詳細

### F-01: 既存テスト件数が 16 件（受け入れ基準・背景に "26 件" と記載）

**背景**:
> 既存テスト: `tests/unit/core/verification/changed-line-coverage.test.ts`(TC-CLG-03 / TC-CLG-04 ほか 26 件)

**受け入れ基準**:
> 既存の changed-line-coverage テスト 26 件が無改変で green

**実測値**: `grep -c "^\s*it(" tests/unit/core/verification/changed-line-coverage.test.ts` → **16 件**

"26" はおそらく `grep "it("` で `emitter.emit(` 等のサブストリングマッチ（10 件）を含めた誤りカウント。

**影響**: 受け入れ基準の文言が実測値と乖離しているため、verification step が "26件が green" を期待値として用いると混乱する。ただし intent は明確（既存テスト全件が無改変で green）であり、実装・検証は可能。
