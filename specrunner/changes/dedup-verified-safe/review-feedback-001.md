# Code Review Feedback — dedup-verified-safe — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `git diff main...HEAD --stat`: 29 ファイル変更（src/ 17 + tests/ 1 + specrunner/ 11）を確認
- `design.md` / `tasks.md` / `test-cases.md` / `request.md` を通読し、実装意図・受け入れ基準・テスト観点を把握
- `verification-result.md`: 727 test files passed / 10686 tests / 1 skip（pre-existing）/ verdict: passed を確認
- **C1** (run/job-start 統合): `command-registry.ts` で `RUN_JOB_FLAGS` / `runJobHandler` が定義され、両コマンドが参照することを確認。ポジショナルラベルの差（`request.md|slug` / `slug|file`）が維持されていることを確認
- **C2** (compute*Iteration 削除): 4 ステップファイルで `nextIteration` に置き換え済みを確認。`io-iteration.ts:7` のコメントに残存参照あり（後述）
- **C3** (detectPackageManager phase-1): `detect-pm.ts` で `findLockfile` 呼び出しに置き換えられ、inline while ループが除去されていることを確認
- **C4** (loadConfig 委譲): `store.ts:77-78` が単一 `return` 文になっていることを確認
- **C5** (journal append 統合): `_appendRecord` private メソッドが追加され、4 つの public メソッドが委譲していることを確認。`appendEventRecord\s*\(` の call expression は 1 件のみ（import 行は除外）
- **C6** (verification tail 抽出): `finalizeVerificationRun` が `skipLabel: "command" | "phase"` を受け取り、テンプレート文字列で byte-identical なスキップ文言を生成することを確認
- **C7** (worktreePath helper): `resolve-worktree-path.ts` が作成され、`resume.ts` / `reopen.ts` がインポートして使用していることを確認
- **C8** (dead code 除去):
  - `PROBE_SLUG` alias: `descriptor-input-completeness.ts` から削除済み、`VALIDATOR_PROBE_SLUG` を直接使用
  - 空 if ブロック: `job-state-projection.ts` から削除済み（"Counters are stale" grep 0 件）
  - identity `enrichContext`: **意図的に残存**（後述）
- 受け入れ基準 5 項目すべてを確認（詳細は下記）

## 検証できなかった項目

- `run` / `job start` の実際の `--help` 出力を実行して確認（static 解析で代用済み）

## Findings 詳細

### F-001: `io-iteration.ts:7` のコメントに削除済みシンボルへの参照が残存

`src/core/step/io-iteration.ts:7` のコメント：
```
Matches the inline formula used by getOutputTemplates and computeCodeReviewIteration.
```
`computeCodeReviewIteration` は T-01 で削除された。コメントは stale であり、将来の読者を誤解させる可能性がある。TC-005 のコード記号パターン検査（`symbol\s*\(`）は comment を除外するため test failure にはならないが、整合性の観点で修正が望ましい。

**修正案**: `computeCodeReviewIteration` への言及を除去し、「このファイルの `nextIteration` が各ステップに分散していた formula を置き換えた」旨を説明する。

---

### F-002: `test-cases.md` の TC-016 が実装判断（tasks.md T-02）と整合していない

TC-016 は「`grep 'enrichContext' src/core/step/spec-review.ts` でマッチ 0 件」を期待しているが、`src/core/step/spec-review.ts:93` に identity `enrichContext` が残存している。

これは **意図的な決定**であり、tasks.md T-02 に明記されている：
> identity `enrichContext` method retained (existing tests in spec-review-system.test.ts require it; removing breaks TC-003/TC-010/interface-compliance tests)

実際、`tests/prompts/spec-review-system.test.ts:65-66` は `typeof SpecReviewStep.enrichContext === "function"` をアサートしており、削除すれば既存テストを修正しなければならない。これは最優先受け入れ基準「既存 test が 1 ファイルも無改変で green」に抵触するため、残存判断は正しい。

また request.md の「削除した symbol が src/ tests/ で grep 0 件」チェック対象には `enrichContext` が明示されておらず（4 関数と `PROBE_SLUG` のみ）、受け入れ基準は満たしている。

TC-016 は実装判断が確定する前に生成されたため未更新。`test-cases.md` を実態に合わせて修正することが必要。

**修正案**: TC-016 に「pre-existing tests（spec-review-system.test.ts TC-003/TC-010）が enrichContext の存在を要求するため、test 無改変の優先受け入れ基準を守り意図的に残存」と注記し、status を「skipped by design」等に更新する。

---

## 受け入れ基準確認

| 基準 | 結果 |
|------|------|
| 既存 test が 1 ファイルも無改変で green | ✅ 727 test files / 10686 tests passed / 0 test files modified |
| verification 結果 markdown の skip 文言が変更前と同一 | ✅ `_(skipped — previous ${args.skipLabel} failed)_` テンプレートで "command" / "phase" 双方が byte-identical |
| `run` と `job start` の `--help` 出力が変更前と同一 | ✅ ポジショナルラベルが各エントリに個別保持 |
| 削除した symbol が src/ tests/ で grep 0 件 | ✅ 4 関数・PROBE_SLUG ともに code として 0 件（comment/string 残存は test の除外対象） |
| `typecheck && test` が green | ✅ verification-result.md で確認済み |
