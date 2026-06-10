# Conformance Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | yes | T-01〜T-12 全チェックボックス完了。typecheck && test green |
| design.md | yes | D1〜D7 全設計判断が実装に忠実に反映されている |
| spec.md | yes | 全 Requirement (SHALL/MUST) と全 Scenario がテストで検証済み |
| request.md | yes | 全受け入れ基準を満たす |

## Detail

### tasks.md

T-01 から T-12 の全チェックボックスが `[x]` 完了。

- T-01: `JobState.issueNumber?: number | null` 追加、`validateJobState` で正整数検証（present 時）
- T-02: `GitHubClient` port に `createIssueComment` 宣言
- T-03: adapter に `POST /repos/{owner}/{repo}/issues/{issueNumber}/comments`（201→`{id,url}`、非 201→`githubApiError`）実装
- T-04: `run` と `job start` 双方に `--issue <number>` フラグ配線。`Number()` + `isInteger && > 0` 検証、失敗時 `EXIT_CODE.ARG_ERROR`
- T-05: `src/core/notify/issue-notifier.ts` 新規作成。`buildMarker` / `buildEscalationComment` / `buildCompletionComment`（純粋）+ `notifyJobTerminal`（best-effort）
- T-06: `pipeline.ts` の `while` ループ末尾・`return state` 直前に `await notifyJobTerminal(state, deps)` 1 箇所のみ配置
- T-07: 全テストダブルに `createIssueComment` モックを追加
- T-08: `tests/unit/core/notify/issue-notifier.test.ts` — 15 tests passed
- T-09: `tests/unit/adapter/github/github-client-issue-comment.test.ts` — 201/非 201/POST URL/body 検証
- T-10: `tests/unit/core/pipeline/pipeline.notification.test.ts` — 4 cases all passed
- T-11: `tests/unit/cli/issue-flag.test.ts` — parse / 検証 / round-trip 検証
- T-12: typecheck exit:0 / 303 test files 3732 tests passed / architecture invariants 27 tests passed

### design.md

| 判断 | 実装での対応 |
|---|---|
| D1: 収束点 1 箇所 | `pipeline.ts:388` の `await notifyJobTerminal(state, deps)` のみ。遷移サイト 3 経路すべてが通過する |
| D2: port 拡張（required） | `src/kernel/github-client.ts` に forge 中立シグネチャ。adapter は `createPullRequest` と同パターン |
| D3: optional backward compat | `issueNumber?: number | null`、欠落は pass-through、present 時のみ正整数検証 |
| D4: CLI 配線 | `run` / `job start` 双方に配線、`Number()` で trailing garbage 拒否、silent ignore なし |
| D5: 純粋 builder + 薄い orchestrator | `src/core/notify/` は adapter を import せず DSM 適合 |
| D6: マーカー SSOT | `buildMarker` 関数が唯一の定義、`-->` guard あり |
| D7: best-effort 隔離 | `try-catch` で全例外を握り `logWarn` のみ、`status` 変更なし |

### spec.md

全 Requirement（SHALL/MUST）と全 Scenario を網羅:

- `--issue` 永続化・復元: TC-IF-006 で round-trip 検証
- `--issue` なし job: TC-N-009 / TC-PN-003 で API 非呼び出し確認
- 不正値で引数エラー: TC-IF-004/005
- `createIssueComment` port シグネチャ: TC-IC-001〜004
- escalation コメント（停止 step・reason・再開手順含む）: TC-N-007 / TC-PN-002
- 完走コメント（PR URL 含む）: TC-N-008 / TC-PN-001
- 機械可読マーカー（escalation / completed 双方）: TC-N-001/003/005
- best-effort 失敗隔離（状態・exit code 不変）: TC-N-010 / TC-PN-004
- CLI プロセスから両 runtime で通知: pipeline.ts の収束点配置が local/managed 両 runtime で通ることを構造的に保証

### request.md

受け入れ基準 7 項目すべて充足:

1. `--issue` 付き escalation → issue にコメント（mock テスト）: TC-N-007 / TC-PN-002
2. 完走時 PR URL 含むコメント: TC-N-008 / TC-PN-001
3. コメントに種別・jobId マーカー: TC-N-001/003/005
4. `--issue` なしで issue API 一切不呼び出し: TC-N-009 / TC-PN-003
5. コメント失敗でも最終状態・exit code 不変: TC-N-010 / TC-PN-004
6. JobState issue フィールドが永続化・復元で保持: TC-IF-006/007/008
7. `typecheck && test` green: exit:0 / 3732 tests passed
