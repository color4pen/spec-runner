# Code Review Feedback — iteration 001

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file はその補足の evidence report である。
-->

## 検証した項目

### diff 全体のスコープ確認
- `git diff main...HEAD --stat` で 34 ファイル変更・5711 行追加を確認
- `.github/workflows/**` への変更ゼロ（TC-039 gate 条件を満たす）

### 設計ドキュメント精読
- `design.md`（D1〜D9、D8 の halt reason 必須要素 4 点を含む）
- `tasks.md`（T-01〜T-11、各タスクの acceptance criteria）
- `spec.md`（全 Requirement と Scenario）
- `test-cases.md`（40 TC のうち 28 must / 10 should / 2 could）

### 実装ファイル確認
- `src/git/push-capability.ts`: 能力宣言・パス列挙・マッチング・通知レンダラ
- `src/core/port/output-contract.ts`: `OutputContractKind` に `"unpushable-path"` 追加を確認
- `src/core/port/step-context.ts`: `pushCapability?: PushCapability | null` フィールド追加を確認
- `src/core/step/implementer.ts`: `outputContracts()` で patterns 非空時に `unpushable-path` contract を追加
- `src/core/step/request-review.ts`: `buildMessage` 末尾に `renderPushCapabilityNotice` を連結
- `src/core/step/output-verify.ts`: `buildOutputFollowUpPrompt` に `unpushable-path` セクション追加
- `src/core/step/step-halt.ts`: `makeUnpushablePathHalt` factory 追加（awaiting-resume）
- `src/core/step/step-context-builder.ts`: `unpushable-path` 含む場合 `maxAttempts = 1`
- `src/core/step/commit-push.ts`: Layer 2 backstop（mixed reset 直後に `collectPublishablePaths` + マッチング）
- `src/core/step/executor.ts`: unpushable-path 違反を `makeUnpushablePathHalt` へルーティング
- `src/core/runtime/local.ts`: `validateStepOutputs` に `unpushable-path` 分岐追加
- `src/core/runtime/managed.ts`: `unpushable-path` を明示的にスキップ
- `src/core/command/runner.ts`: `detectPushCapability(process.env, ...)` を per-run 1 回実行
- `src/errors.ts`: `UNPUSHABLE_PATH_BLOCKED` error code + `unpushablePathBlockedError` + `parseUnpushablePathsFromError` 追加
- `tests/unit/architecture/arch-allowlist.ts`: `B6-runner-push-capability-detect` エントリ追加

### テスト確認
- `tests/unit/git/push-capability.test.ts`: TC-001〜004, TC-008〜010, TC-020〜027 を確認
- `tests/unit/step/push-capability-notice.test.ts`: TC-005, TC-006, TC-007, TC-031 を確認
- `tests/unit/step/unpushable-path-contract.test.ts`: TC-011, TC-012, TC-013, TC-030, TC-033, TC-034 を確認
- `tests/unit/step/unpushable-path-escalation.test.ts`: TC-014, TC-015, TC-016, TC-035, TC-036, TC-037 を確認
- `tests/unit/runtime/unpushable-path-validate.test.ts`: TC-017, TC-018, TC-019, TC-032 を確認

### verification 結果
- `verification-result.md`: build / typecheck / test / lint / changed-line-coverage 全 passed を確認

## 検証できなかった項目

- **TC-028**（pushCapability の 1 run 1 回解決）: "should" 優先度。`runner.ts` で構造的に保証されているが、spy で呼び出し回数を確認する専用テストは存在しない。
- `commitFinalState` など `commitAndPush` を共有しない経路への Layer 2 適用（`commitFinalState` はエスカレーション後の checkpoint commit であり intentionally 除外されていることを設計で確認）。

## Findings 詳細

### Finding 1 — `makeUnpushablePathHalt` の hint に「変更は未コミットのまま worktree に残っている」の記述が欠落

`design.md D8` は halt reason の必須要素として "(3) 変更は未コミットのまま worktree に残っていること" を列挙している。`test-cases.md TC-036` の THEN 節も "the halt reason text includes a statement that changes remain uncommitted in the worktree" を要求している。

しかし `src/core/step/step-halt.ts` の `makeUnpushablePathHalt` hint は:
```
"The current environment's token cannot push to the following paths:\n${pathList}\n" +
"Constraint: ${capabilitySource}\n" +
"Remove the changes to these paths or resolve the requirement without modifying them, " +
"then run 'specrunner job resume ${slug}' to continue."
```
「変更は未コミットのまま残っている」への言及がない。`tests/.../unpushable-path-escalation.test.ts` の TC-036 テストも "Constraint"・"resume"・パス名の 3 点のみ検証しており、この THEN 節を assert していない。

spec-test-implementation の三重 gap。TC-036 は "should" 優先度だが、設計文書で明示された要素が欠落しているため fixable として報告する。

### Finding 2 — `buildOutputFollowUpPrompt` の `unpushable-path` セクションが「回避できない場合は作業を止めること」を含まない

`tasks.md T-05` は follow-up 文面の必須要素として「回避できない場合はその旨を明記して作業を止めること」を指定している。実際の文面は "remove or satisfy without modifying" のみであり、「達成不可能なら止める」指示が欠落している。TC-030 テストも当該要素を assert していない。

spec.md Requirement 4 の Scenario 定義には "instruct the agent to either remove the change or satisfy the requirement without changing the declared paths" とだけ書かれており、tasks.md レベルの追加要件だが、エージェントへの指示として実用上の差異がある。

### Finding 3 — `matchUnpushablePaths` の API シグネチャが tasks.md T-01 の仕様と乖離

`tasks.md T-01` は `matchUnpushablePaths(paths: string[], capability: PushCapability | undefined): string[]` と規定しているが、実装は `matchUnpushablePaths(publishablePaths: string[], patterns: string[]): string[]` を採用している。`test-cases.md TC-021/TC-022` も `matchUnpushablePaths(paths, undefined)` 呼び出しを想定した記述だが、実際のテストは `matchUnpushablePaths(paths, [])` を使用している。機能的問題はなく、仕様ドキュメントの記述が実装を追いついていない状態。

### Finding 4 — `detectPushCapability` が "not declared" ケースで `null` を返す（tasks.md T-01 は `{ patterns: [], source: "none" }` を要求）

`tasks.md T-01` は "それ以外は `{ patterns: [], source: "none" }` を返す" と規定しているが、実装は `null` を返す。テストも `expect(result).toBeNull()` で null を期待している。全消費箇所が `null` ガードを適切に処理しており機能的問題なし。仕様ドキュメントの不整合。

### Finding 5 — `collectPublishablePaths` の返り値が tasks.md T-02 の「ソート済み」要件を満たさない

`tasks.md T-02` は "2 つの集合の和を重複なし・ソート済みで返す" と規定しているが、実装は `Array.from(paths)` で返しており（`Set` による重複除去は行われるがソートなし）、テストも順序を検証していない。用途上の機能的影響はない。
