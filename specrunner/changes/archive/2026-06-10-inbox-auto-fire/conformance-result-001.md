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
| tasks.md | ✓ | 必須項目は全て `[x]`。未チェックは T-07 の `（任意・スコープ内）` issue form テンプレート 1 件のみ |
| design.md | ✓ | D1〜D7 全決定が実装に反映。`StartAction` 型形状は設計スケッチより `IssueRef` に統合されているが振る舞い同等 |
| spec.md | ✓ | 全 Requirement の SHALL/MUST が実装で充足。全 Scenario に対応するテストが存在し green |
| request.md | ✓ | 全受け入れ基準を満たす。`typecheck && test` が green（3884 tests passed） |

## Details

### tasks.md

全 8 タスク中 7 タスク完了（`[x]`）。残 1 件は T-07 の `（任意・スコープ内）issue form テンプレート例` であり必須ではない。

### design.md

| 決定 | 適合 |
|------|------|
| D1: planner / orchestrator 分離（純関数 + effect dispatch） | `planner.ts` と `run-inbox.ts` で完全分離 |
| D2: start を inline await（persist を next 候補より前に） | `for...await` 逐次実行 |
| D3: start = ラベル状態、resume = コンテンツイベント非対称 | 実装そのまま |
| D4: 冪等性を job state だけで閉じる（消費位置管理なし） | cutoff = escalation マーカー最大 createdAt のみ |
| D5: 権限（OWNER/MEMBER/COLLABORATOR）+ 通知マーカーで bot 除外 | `ALLOWED_AUTHOR_ASSOCIATIONS` + `isNotificationComment` |
| D6: inbox config セクション（approveLabel / maxStartsPerRun） | `InboxConfig` / `resolveInboxConfig` / zod schema 追加 |
| D7: inbox 親コマンド + run + worktree guard | `guardedSubcommands: new Set(["run"])` |

### spec.md

全 Requirement の MUST/SHALL が実装で充足。主要確認点:

- **cutoff 等値除外**: `comment.createdAt <= cutoff` で等値も除外し spec の「strictly greater」に一致
- **PR 除外**: `pull_request` フィールド存在で除外（adapter 実装 + テスト確認）
- **再 escalation 後の古い /resume 非発火**: 既存 `notifyJobTerminal` が新マーカーを追記し、時刻比較で自然に排除
- **ページネーション**: Link ヘッダを `parseNextLink` で走査し全ページ取得

### request.md（受け入れ基準）

| 基準 | 結果 |
|------|------|
| 承認ラベル付き・未紐付け issue から起動、2 回目 no-op | ✓ orchestrator.test.ts |
| 不正 issue 本文 → エラーコメント、job 未作成 | ✓ planner + orchestrator テスト |
| awaiting-resume → /resume で再開、resumePrompt 渡し | ✓ planner + orchestrator テスト |
| 古いコメント / 権限なし / bot コメントで再開しない | ✓ planner + orchestrator テスト |
| 起動上限 config が効く | ✓ planner + orchestrator テスト |
| issue 紐付けなし job に影響しない | ✓ orchestrator テスト |
| typecheck && test が green | ✓ typecheck 0 error、3884 tests passed |
