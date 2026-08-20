# Code Review Feedback — job-start-from-issue — iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `git diff main...HEAD --stat` でスコープ確認（27 ファイル変更）
- 実装ファイル全件確認: `src/cli/from-issue.ts`, `src/core/job/start-from-issue.ts`, `src/git/branch.ts`, `src/cli/command-registry.ts`（RUN_JOB_FLAGS / runJobHandler の変更箇所）, `src/errors.ts`（baseBranchMismatchError / BASE_BRANCH_MISMATCH）, `src/core/inbox/run-inbox.ts`（materializeDraftAndStart 委譲）, `src/core/command/guide.ts`（--from-issue 節追加）
- テストファイル全件確認: `src/cli/__tests__/from-issue.test.ts`, `src/git/__tests__/branch.test.ts`, `tests/unit/architecture/arch-allowlist.ts`
- spec.md / design.md / tasks.md / test-cases.md 全件確認
- 受け入れ基準 7 項目をコード・テストに照合
- `verification-result.md` でビルド / typecheck / テスト全 pass 確認（11785 passed）
- `OriginInfo` の型定義（`src/git/remote.ts:5-8`）を確認し mock との相違を発見
- `baseBranchMismatchError` の文言生成を確認（null → detached HEAD 表示）
- inbox `startJob` default effect の委譲実装と既存テストのモック注入パターンを確認

## 検証できなかった項目

None（スコープ内の全変更ファイルを確認済み）

## Findings 詳細

### F-001 [medium] — `materializeDraftAndStart` が `inboxOrigin: true` を渡すことをテストが pin しない

受け入れ基準: "`--from-issue` 起動の job は issue fidelity gate で comparator が実行されない（skip 経路のテストで pin する）"

fidelity gate skip は `inboxOrigin: true` が `runRunCore` に渡されることで成立する。TC-002 は `evaluateIssueFidelityGate` に `inboxOrigin: true` を直接渡してゲートの skip 経路を検証しているが、`runFromIssue → materializeDraftAndStart → runRunCore({ inboxOrigin: true })` の連鎖は一切テストされていない。

`from-issue.test.ts` では `materializeDraftAndStart` がフルモック（`vi.mock("../../core/job/start-from-issue.js", ...)`）されており、`start-from-issue.ts` の実装が `runRunCore` に `inboxOrigin: true` を渡していることを検証するテストは存在しない。もし `start-from-issue.ts` から `inboxOrigin: true` を除去しても、全テストが green のまま pass する。

Fix: `src/core/job/__tests__/start-from-issue.test.ts` を追加し、`writeDraft` と `runRunCore` をモックして `runRunCore` が `{ inboxOrigin: true, issue: issueNumber }` で呼ばれることを assert する。

---

### F-002 [low] — `getOriginInfo` モックのフィールド名誤り

`src/cli/__tests__/from-issue.test.ts` L60:
```ts
getOriginInfo: vi.fn().mockResolvedValue({ owner: "test-owner", repo: "test-repo" }),
```

`OriginInfo` 型は `{ owner: string; name: string }` であり `repo` フィールドは存在しない。`from-issue.ts` は `origin.name` を参照するため、テスト中 `repo` 変数は `undefined` になる。`getIssue` モックが引数を検証しないため全テストが pass するが、テストが production の呼び出しを正確に反映していない。

Fix: `{ owner: "test-owner", name: "test-repo" }` に修正する。

---

### F-003 [low] — TC-013/TC-014 in `from-issue.test.ts` はモック自身をテストしており無効

`src/cli/__tests__/from-issue.test.ts` L431-451 の TC-013/TC-014 は `getCurrentBranch` がモックされているため、モックの設定が機能することを確認しているに過ぎない。実装の正しさは `src/git/__tests__/branch.test.ts` が担保している。

Fix: L431-451 の TC-013/TC-014 ブロックを削除する。

---

### F-004 [low] — test-cases.md の `automated: 14` に対し統合テスト 3 件が未実装

test-cases.md は `automated: 14` と宣言しているが、integration TC（TC-001 must, TC-007 should, TC-010 should）の 3 件が実装されていない。実装済みは unit 11 件 + gate 3 件。TC-001 は F-001 の fix で実体化可能。TC-007・TC-010 は should 優先度。

---

## Observations

- base-branch guard を親プロセスで実施してから `detachSelf` を呼ぶ順序（from-issue.ts L104-120）は設計 D3 の意図通り。detach 後に子が guard 失敗するという UX 破綻を防いでいる。
- inbox `startJob` の委譲形式（run-inbox.ts L396-397）は既存 inbox テストのモック注入パターンと整合しており、既存テストは無改変で green（TC-019 確認）。
- `baseBranchMismatchError` の文言は detached HEAD 時 `(detached HEAD)` を表示し両値を明示する。TC-004 テストの `expect(msg).toMatch(/detached/i)` はこれに対応している。
- arch-allowlist の `CWD-from-issue-reporoot-di-default` エントリが適切に追加されている。
