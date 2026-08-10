# Code Review Feedback — resume-operator-guidance — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `git diff main...HEAD --stat`: 7 ソースファイル変更 (3056 行追加、13 行削除) + change folder artifacts
- `src/core/resume/adopt-commits.ts`: `buildAdoptionHaltMessage` の 3 分岐実装、`buildAdoptEscalationMessage` 不変を確認
- `src/core/command/resume.ts`: `haltWithCanonPreflight` 関数、Gate 1 fail-closed halt の 2 経路から呼ばれることを確認。`resolvedSlug`（`getJobSlug(state)` 結果）を渡していること（`this.slug` でないこと）を確認
- `src/cli/command-registry.ts` diff: `JOB_RESUME_USAGE` 定数（11 flag、相互排他 2 組、`--from` 有効値、`bite-evidence` 注記、複合 step 対象外注記）と `usage: JOB_RESUME_USAGE` 配線を確認
- `src/core/command/__tests__/resume-operator-guidance.test.ts`: TC-001 〜 TC-008 を確認（TC-003 は Gate 2 回帰 pin、TC-005 は副作用なし検証）
- `src/core/resume/__tests__/adoption-halt.test.ts`: TC-009 の 3 分岐 unit test を確認
- `tests/unit/cli/resume-help.test.ts`: TC-007 の help 出力確認 test を確認
- `tests/unit/cli/help-flag-dispatch.test.ts` diff: TC-HELP-DISPATCH-03 の "No detailed help available" assertion が `--from`/`--apply-canon` 確認に更新されていること、exit-0 と runResume 非呼び出し assertion が保持されていることを確認
- `src/core/resume/__tests__/adopt-commits.test.ts`: diff なし（TC-U5 / `buildAdoptEscalationMessage` 不変を確認）
- `tests/resolve-job-id.test.ts`: diff なし（`resolveId` メッセージ不変を確認）
- `tests/unit/cli/resume.test.ts` の TC-RESUME-010: "Job not found" 含有 assertion が新メッセージ（"Job not found: no active job with slug or job ID prefix '…'"）で保持されることを確認
- `verification-result.md`: build/typecheck/test/lint/changed-line-coverage すべて passed、743 test files、11141 tests 全 green を確認

## 検証できなかった項目

- E2E テスト（`tests/operator-canon-apply-on-resume-e2e.test.ts`, `tests/resume-partial-canon-quarantine-e2e.test.ts`）: diff なしを確認したが、実際のテスト実行は verification 結果の 743 passed に含まれることで確認済み。個別ファイルの実行は未確認
- TC-010（should 優先度）: exit 128 preflight 空扱いの特定テストなし（ロジックは正しいが未テスト）

## Findings 詳細

### F-01: TC-010（should）exit 128 preflight → 空扱い の専用テストなし

`haltWithCanonPreflight` の exit-128 carve-out ロジックは正しい（Gate 2 と同一パターン）。
ただし `mockDetectUnadoptedCommits` が "exit 128" メッセージで reject した場合に `commitDetectionFailed: false` で builder が呼ばれる（検出失敗扱いにならない）ことを確認するテストがない。
"should" 優先度のため merge ブロックではない。

Fix候補: `resume-operator-guidance.test.ts` に以下を追加:
```ts
mockDetectUnadoptedCommits.mockRejectedValue(
  new Error("git rev-list failed (exit 128): not a git repository"),
);
// buildAdoptionHaltMessage called with commitDetectionFailed: false
// output contains --apply-canon only (no detection-failure note)
```

### F-02: TC-016（should）相互排他対と --from 有効値の help テストなし

`JOB_RESUME_USAGE` に "Mutually exclusive pairs:" セクションは存在する。
`resume-help.test.ts` は個別 flag の有無を確認するが、相互排他記述や `--from` 有効値列挙への assert がない。
"should" 優先度のため merge ブロックではない。

Fix候補: `resume-help.test.ts` に以下を追加:
```ts
expect(getStdoutOutput()).toContain("Mutually exclusive");
expect(getStdoutOutput()).toContain("--detach  /  --json");
```

---

両 findings は "should" 優先度（test-cases.md 参照）。ロジック・コンテンツとも正しく実装されており、ブロッカーなし。
