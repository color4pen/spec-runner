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
- Approval is blocked when CRITICAL ≥ 1 OR HIGH ≥ 1.
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | Documentation | `src/core/port/runtime-strategy.ts` | `WorkspaceOptions.bootstrapState` の JSDoc に "managed runtime ignores this field" と書かれているが、D3 適用後は managed の `setupWorkspace` run 経路がこのフィールドを使って local/slug に seed する。T-07 のスコープにこのフィールドのコメント更新が含まれていない。 | T-07 の更新対象に `WorkspaceOptions.bootstrapState` の JSDoc を追加し、"managed runtime uses this to seed local/slug store in run path" と訂正する。 |
| 2 | LOW | Testability | `tests/unit/core/runtime/managed.test.ts` | T-08 の `makeJobStateForManaged` 更新が "local/slug seed に合わせる" と記述されているが、`JobStateStore.create()` を何に置き換えるかの具体的な方針が示されていない。`buildInitialJobState` + `managedLocalStore(...).persist()` か、`setupWorkspace` 経由か、実装者の判断に委ねられている。 | T-08 に "makeJobStateForManaged を `buildInitialJobState` + `managedLocalStore(jobId, slug).persist()` で置き換える" と補足する（または setupWorkspace run 経路を呼ぶ方針を明記する）。いずれも実装可能なので承認は妨げない。 |
| 3 | LOW | Known Debt | `src/core/cancel/runner.ts` | `cancelAllTerminated` は `list()` の結果を対象にするが、terminal managed job は marker が clear 済みで `list()` に出ない（D5 Note の既知 debt）。そのため `cancelAllTerminated --purge` 相当の一括削除が local/slug の孤立ディレクトリを残す。本変更のスコープ外だが、後続 request (`retire-jobs-dir`) での対処を推奨。 | `cancelAllTerminated` のスコープを本変更に含めない（現設計のまま許容）。`retire-jobs-dir` または terminal managed 可視化 request で対処する。 |

## Review Notes

設計の完成度は高い。主要な判断（D1–D6）はそれぞれ rationale と alternatives considered を持ち、機能的な不整合は見当たらない。

**検証済みの点:**

- `atomicWriteJson` と `appendEventRecord` がいずれも `fs.mkdir({ recursive: true })` を内包するため、`managedLocalStore` が初回 fresh write で `.specrunner/local/<slug>/` を自動作成できる。ディレクトリ事前作成の問題なし。
- `WorkspaceOptions.bootstrapState` は `PipelineRunCommand.prepare()` が既に `bootstrapState: jobState` を渡しており、D3 の seam が機能する前提が成立している。
- `changeDir` 単独構成で `isSlugMode()` = false となり `stateToStateJson(state, { slugMode: false })` が full state（machine-local フィールドを strip しない）を保存する。managed state の性質保持に一致。
- `cancelSingleJob` の `--purge` パスは idempotent canceled 分岐でも purge ブロックが末尾で実行されるため、T-06 の `fs.rm(localSidecarDir(slug))` 追加で managed purge が正しく機能する。
- セキュリティ面：slug をパス結合に使う既存パターンの延長であり、slug は request 解析時にバリデーション済み。本変更で新たな OWASP 上の懸念は生じない。
