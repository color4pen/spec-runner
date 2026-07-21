# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 前回 escalation (attempt 1) の decision-needed 解消確認

| Finding | 前回判定 | 人間決定 | 今回対応 |
|---------|---------|---------|---------|
| F-01: CLOSED PR の扱い | decision-needed | Option A採用（CLOSED PR 拒否を正規設計として確定） | spec.md に by-design シナリオ追記が必要 → fixable に降格 |

### 現行 spec ファイルの確認

| 確認項目 | 結果 |
|---------|------|
| spec.md に CLOSED PR 拒否シナリオが存在するか | ✗ 存在しない。Requirement「reopen rejects ineligible jobs」はmerged/archived/canceledの3シナリオのみ。CLOSED PRは要件本文にも記載なし |
| tasks.md T-06 に managed runtime の captureHeadSha null 経路が明示されているか | ✗ 記載なし（前回 F-02 のまま） |
| tasks.md T-03 に appendOperatorEvent の throw 時エラーハンドリングが記述されているか | ✗ 記載なし（前回 F-03 のまま） |
| tasks.md T-03 の options 型定義に githubClient が含まれているか | ✗ options 定義は `{ from, reason, logLevel?, cwd?, json?, noWorktree?, repoRoot? }` のみ（前回 F-04 のまま） |
| design.md D3 で CLOSED PR 拒否の根拠は明示されているか | ✓ 明示済み（「CLOSED (unmerged) is also rejected because reopen re-runs through pr-create, whose contract only reuses an OPEN PR」） |
| tasks.md T-03 で githubClient が PR gate ロジック内で参照されているか | ✓ L73 で `githubClient.getPullRequest(...)` が使用されている（型定義のみ抜け） |
| spec.md の他の要件（FSM edge / evidence 保存 / operator event / branch 保持 / revision binding）が request.md の受け入れ基準と整合しているか | ✓ 全シナリオが対応する要件に紐づき、request.md の AC を網羅 |
| design.md の D1〜D8 が request.md の設計判断（採用/却下）と矛盾しないか | ✓ 矛盾なし |
| tasks.md T-01〜T-11 が spec.md・design.md の要件・決定を具体的なタスクへ落としているか | ✓ 概ね対応。F-02〜F-04 の不足を除き実装上の漏れなし |

### セキュリティ観点

- `--reason` 入力: JSON.stringify でエスケープ。agent prompt への injection 経路なし（変化なし）
- `--from` 入力: `buildAllowedStepSet` + `resolveResumeStep` でホワイトリスト検証（変化なし）
- PR state gate: token 不在・API エラーともに fail-closed（D3 確認済み）
- CLOSED PR gate: D3 / tasks.md T-03 の実装仕様でオープン以外は全拒否（OWASP A04 security misconfiguration のリスクなし）

## 検証できなかった項目

- managed runtime における `captureHeadSha` の実際の実装（null 返却の有無）: ランタイム adapter コード読み込みは今回スコープ外
- `bun run typecheck && bun test` の実行: ランタイム環境での検証はスコープ外

## Findings 詳細

### F-01: CLOSED PR 拒否シナリオが spec.md に存在しない（決定反映漏れ）

**severity**: medium  
**resolution**: fixable  
**対象**: `spec.md` — Requirement: reopen rejects ineligible jobs

人間確定決定「Option A: CLOSED PR への reopen は拒否を正規設計として確定し、spec.md に by-design シナリオとして明記する」が spec.md に未反映。

現在の spec.md は MERGED / archived / canceled の3シナリオのみを定義しており、CLOSED（unmerged）PR の拒否はシナリオとして記載されていない。要件本文にも記述がない。design.md D3 と tasks.md T-03 では実装仕様として CLOSED 拒否が記述されているが、spec.md の要件・シナリオに昇格していなければ、テスト作成者は CLOSED PR のリジェクションケースを見落とすリスクがある（T-08 の対象リストに含まれていない）。

**修正案**:

1. spec.md の「Requirement: reopen rejects ineligible jobs」の要件本文に CLOSED (unmerged) PR も拒否対象として明記する。
2. 同 Requirement に以下のシナリオを追加する:

```
#### Scenario: reopen of a job with a CLOSED (unmerged) PR is rejected (by design)

**Given** a job with status `awaiting-archive` whose PR state is `CLOSED`
**When** the operator runs `job reopen <slug> --from implementer --reason "x"`
**Then** the command exits with a non-zero status and reports the PR is closed
**And** the job status is unchanged
**Note**: CLOSED-but-unmerged PRs are rejected by design; re-open the PR on GitHub first if needed.
```

3. tasks.md T-08 の rejection case リストに「PR state `CLOSED`」を追加する。

---

### F-02: T-06 に managed runtime の captureHeadSha null 経路が明示されていない

**severity**: low  
**resolution**: fixable  
**対象**: `tasks.md` T-06（L151付近）

T-06 の調査スコープに最も疑わしい経路が名指しされていない。`parallel-review-round.ts:110-114` において managed runtime が `captureHeadSha` から `null` を返すと `selectPendingMembers(statuses, members, null)` は revision check を無効化し、approved メンバーを commitOid 照合なしで skip する。既存の Non-Goal 注記との整合確認が必要。

**修正案**: T-06 の調査リストに以下を追記する:
> 「managed runtime で `captureHeadSha` が `null` を返すケース（`selectPendingMembers` の revision check 無効化）が既存の Non-Goal 扱いと整合していることを確認し、written note に結果を記録する。」

---

### F-03: T-03 に `appendOperatorEvent` 失敗時のエラーハンドリングが記述されていない

**severity**: low  
**resolution**: fixable  
**対象**: `tasks.md` T-03（L87付近）

T-03 は「operator event を persisting より前に append せよ」と指定しているが、`fs.appendFile` が throw した場合の挙動を規定していない。`ResumeCommand.prepare()` は catch で `PrepareError(1, ...)` に変換しており（`resume.ts:201-221`）、同等の明示が必要。

**修正案**: T-03 に「`appendOperatorEvent` が throw した場合は `logError` + `throw new PrepareError(1, ...)` で中断する（遷移は実行しない）」を追記する。

---

### F-04: T-03 の options 型定義に `githubClient` が含まれていない

**severity**: low  
**resolution**: fixable  
**対象**: `tasks.md` T-03（L57付近）

T-03 の options 定義は `{ from: string; reason: string; logLevel?; cwd?; json?; noWorktree?; repoRoot? }` のみで、`githubClient` が省略されている。T-04 は「`GitHubClient` を pass into `ReopenCommand` (via options or constructor)」と指定しているが、T-03 の型定義と乖離があり、実装者が型定義から client フィールドを漏らすリスクがある。

**修正案**: T-03 の options 型に `githubClient?: GitHubClient | null` を追記する（T-04 との整合）。
