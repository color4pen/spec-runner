# Code Review Feedback — iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### diff の確認

`git diff main...HEAD --stat` で 18 ファイル・2199 行追加を確認。実装対象ファイルは：
- `src/kernel/report-result.ts` — `Finding` 型に `fileMissing?: boolean` 追加
- `src/core/port/report-result.ts` — `parseFindings` に silent-capture 追加
- `src/core/step/report-tool.ts` — 4 tool schema + description 更新
- `src/core/step/step-completion.ts` — split-and-invert ref 検証ロジック
- `src/core/step/__tests__/step-completion-missing-file-finding.test.ts` — 新規テスト 12 TC

### T-01: Finding 型と parseFindings（src/kernel/report-result.ts, src/core/port/report-result.ts）

`Finding` interface に `fileMissing?: boolean` が追加され、doc コメントで「true = file の欠落自体を指摘、absent/false = 従来挙動」が明記されていることを確認した。`origin?: "scope"` と同じ additive discriminator パターンを踏襲。

`parseFindings` の追加ロジック（:234-236）:
```ts
if (f["fileMissing"] === true) {
  finding.fileMissing = true;
}
```
`=== true` による strict capture で、false / 数値 / 文字列等を無視することを確認。TC-011 (should TC) で非 boolean 値が `undefined` になることもテスト済み。

### T-02: 4 tool schema（src/core/step/report-tool.ts）

`findingSchema`（JUDGE / CODE_REVIEW / REQUEST_REVIEW 共有）と `conformanceFindingSchema`（CONFORMANCE 専用）の両方に `fileMissing: optional(boolean())` が追加されていることを確認。

4 tool の description に `fileMissing?: boolean` の用途説明が含まれることを確認。例: JUDGE_REPORT_TOOL の description 抜粋:
> `fileMissing?: boolean — set to true when the finding points to a file that should exist but is absent; in this case file contains the path that is missing (line is not needed).`

TC-009（schema）と TC-010（description）で自動検証済み。

### T-03: step-completion の split-and-invert ロジック（src/core/step/step-completion.ts:248-283）

コメント（:238-242）で設計意図を明示した上で、`affectingFindings` を `missingDecl`（`fileMissing === true`）と `regular`（`fileMissing !== true`）に分割していることを確認。

**regular 群**（非宣言）: `{ file, line }` で ref を構築し `verifyFindingRefs` を呼ぶ。nonExistent が 1 件でもあれば `override = true`（従来挙動、hallucination ガード）。

**missingDecl 群**（欠落宣言）:
- D4 に従い `{ file }` のみで ref を構築（`line` を渡さない）
- `nonExistent` = verifyFindingRefs の返却（存在しない refs）
- `absentFiles = new Set(nonExistent.map(r => r.file))`
- `falseDecl = missingDecl.filter(f => !absentFiles.has(f.file))` — absentFiles に含まれない = 実在している = 虚偽宣言
- `falseDecl.length > 0` ならば `override = true`

**反転検証ロジックの正しさ**:
- file が不在 → verifyFindingRefs が返す → absentFiles に含まれる → falseDecl に含まれない → override なし → routing 保持 ✓
- file が実在 → verifyFindingRefs が返さない → absentFiles に含まれない → falseDecl に含まれる → override → escalation ✓

両群が独立に評価され OR で `override` が確定する。非宣言群で override 確定後も missingDecl 群の seam 呼び出しが走るが、tasks.md に「任意の最適化」と明記されており仕様通り。

### T-04/T-05: テスト網羅確認

**TC-003（#916 再現）**: mock seam が `docs/implementation-notes.md` を nonExistent で返す → `fileMissing:true` + 不在 → `completion.verdict === "needs-fix"` ✓

**TC-004（虚偽宣言）**: mock seam が空を返す（file 実在）→ `fileMissing:true` + 実在 → `completion.verdict === "escalation"` ✓

**TC-005（回帰保護）**: mock seam が非宣言 finding を nonExistent で返す → `completion.verdict === "escalation"` かつ `completion.escalationReason === undefined` の両方を assert ✓

**TC-006（runtime 対称）**: real `LocalRuntime`（fs.stat ベース）と real `ManagedRuntime`（mock githubClient.getRawFile）を実注入。各 4 パターン + 対称確認テストで網羅。LocalRuntime のコンストラクタ引数（`{ cwd, githubClient }`）が実装と一致することを確認。ManagedRuntime のコンストラクタ引数（6 引数）も一致。

**TC-007（line 非通過）**: mock seam で `capturedRefs` を記録し、`refForMissingFile.line === undefined` を直接 assert ✓

**既存テスト変更なし（TC-014）**: `git diff main...HEAD -- managed-verify-finding-refs.test.ts verify-finding-refs.test.ts` が空出力であることを確認。diff stat に既存テストファイルが現れない。

### 検証結果（verification-result.md）

- build: passed, typecheck: passed, test: passed（675 files, 10032 tests）, lint: passed
- changed-line-coverage: passed（3 対象ソースファイルすべて通過）
  - `src/kernel/report-result.ts` は型定義のみで実行コードなし → coverage 対象外（正常）
  - 新規テストファイル自体が coverage 対象外（正常）

## 検証できなかった項目

None。全受け入れ基準を機械的証拠（テスト pass + diff 確認）で検証した。

## Findings 詳細

None。
