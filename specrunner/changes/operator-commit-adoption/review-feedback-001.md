# Code Review Feedback — iteration 001

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `git diff main...HEAD --stat` で変更範囲を確認（22 files, +3730/-2 行）
- 実装ファイル: `src/core/resume/adopt-commits.ts`, `src/core/command/resume.ts`, `src/errors.ts`, `src/cli/resume.ts`, `src/cli/command-registry.ts`
- テストファイル: `adopt-commits.test.ts`, `resume-adopt-commits.test.ts`, `command-registry-adopt-commits.test.ts`, `egress-resolution-options.test.ts`
- 仕様: `spec.md`, `tasks.md`, `test-cases.md`, `design.md`
- 検証結果: `verification-result.md`（build/typecheck/test/lint/changed-line-coverage 全 passed）
- 受け入れ基準 7 項目を実装・テストと突き合わせ
- design.md の設計判断 D1–D7 を実装で追跡
- TC-001〜TC-016 の must シナリオをテストコードで確認

## 検証できなかった項目

None — 全受け入れ基準が実装とテストで確認可能だった。

## Findings 詳細

### F-001: TC-005 test 2 が意図と異なる失敗経路を踏む

TC-005 の 2 番目のテストは `mockRejectedValue` で全 persist 呼び出しを失敗させる。  
実際には最初の persist 呼び出し（"running" 遷移時の `runStore.persist(transitioned)`、resume.ts ~248 行目）が失敗して PrepareError(1) を投げるため、"adopt persist の失敗" ではなく "state 遷移 persist の失敗" を踏んでいる。  
`threw === true` の assertion はパスするが、採択 persist の fail-closed は 1 番目のテスト（`persistCallCount >= 2`）が担っている。

修正案: 2 番目のテストの `mockImplementation` を 1〜2 回目はパスさせ 3 回目で reject するよう変更するか、冗長な coverage として削除する。

### F-002: 採択時の escalation message が `logError` を経由しない

T-04 仕様: `logError(msg)` または サマリを `logError` + 詳細を `stderrWrite(msg)`  
実装: `stderrWrite(msg)` のみ（logError なし）

現時点では機能上問題なく、テストも `logError` と `stderrWrite` 両方を検査しているため pass する。  
ただし apply-canon gate（resume.ts ~343 行目）が `logError(...)` を呼んだ後に `stderrWrite(hint)` を使うパターンに合わせていない。将来的にログレベルフィルタが `stderrWrite` にも適用された場合、escalation が抑制されるリスクがある。

修正案: `stderrWrite(msg)` の前に `logError("Unknown commits found in publish range")` を追加し、apply-canon gate と一貫したパターンにする。

## 受け入れ基準 × テスト対応表

| 受け入れ基準 | テスト | 結果 |
|---|---|---|
| unknown commit + no flag → step 実行なし | TC-001 (prepare() throws before pipeline) | ✅ |
| escalation に short SHA + 3 解決手段 | TC-003, TC-007, TC-015 | ✅ |
| --adopt-commits → OID が synthesizedCommits に追加・persist | TC-004 | ✅ |
| --adopt-commits + persist 失敗 → 起動しない | TC-005 test 1 (`persistCallCount >= 2`) | ✅ |
| --apply-canon のみ → commit 済み OID 採択しない | TC-006 | ✅ |
| 空 range → 既存挙動変化なし | TC-002 + 726 test files green | ✅ |
| typecheck && test green | verification-result.md | ✅ |
