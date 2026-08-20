# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション検証（ソースリビジョン 44c26134e3d2bc82032bccd08804f6944ec55f68）

| アサーション | 結果 |
|---|---|
| `materializeDraftAndStart` が `src/core/job/start-from-issue.ts` に存在 | ✅ |
| 同関数が `await import("../../cli/run.js")` を動的 import（line 31） | ✅ |
| inbox の `startJob` effect も `materializeDraftAndStart` を動的 import で呼ぶ（`run-inbox.ts:396`） | ✅ |
| `body-template.ts:75` に `Fixes #${jobState.issueNumber}` が存在 | ✅ |
| `pipeline-run.ts:174-175` にインライン branch 名 template が存在 | ✅ |
| `design.ts:151` にインライン branch 名 template が存在 | ✅ |
| `commit-orchestrator.ts:403-404` にインライン branch 名 template が存在 | ✅ |
| `local.ts:478-479` に `baseBranch` / `remoteBaseRef` の定義 | ✅ |
| `adapter/github/github-client.ts` が REST のみで GraphQL 未実装 | ✅ |
| port `getIssue()` が `{ number, title, body }` のみを返す（`nodeId` なし）| ✅ |
| arch test（DSM closure）が `start-from-issue.ts` の動的 import を検出しない | ✅（static `from "..."` のみ対象） |
| positional + `--issue <n>` 経路が `runRun()` 直結で issue-target を経由しない | ✅ |
| `from-issue.test.ts` TC-011 が `../../core/job/start-from-issue.js` を mock | ✅ |
| `start-from-issue.test.ts` TC-001 が `../../../cli/run.js` を mock | ✅ |

### 前回 Finding の再評価

**Finding 1（前回 critical/decision-needed）: 受け入れ基準の内部矛盾**

再読の結果、矛盾は存在しない。

- 「無改変で green」が要求されるのは **inbox のテスト**のみ（effects 注入式のため import path に非依存）。
- `from-issue.test.ts` / `start-from-issue.test.ts` については、request.md が「**変更は mock 対象 / import path の更新のみを許可する**」と明示している。
- injection アプローチ（start primitive を注入）を採用すれば、assert 内容（引数 `{ inboxOrigin: true, issue: N }`・書き込み順序・エラー伝播）はそのまま保存できる。mock target が `vi.mock("../../../cli/run.js")` から注入 function の spy に変わるだけで、これは明示的に許可された変更。
- 矛盾は存在しないと判定。

**Finding 2（前回 high/fixable）: `node_id` が port インターフェースに存在しない**

再読の結果、request.md はこのギャップを正確に認識している。

- 「現状コードの前提」に「`getIssue()` は `{ number, title, body }` のみに型マッピングして `node_id` を落としている。`createLinkedBranch` に渡す issueId を得るには port 拡張が必要」と明記。
- 「要求 3」に「issueId 取得のための port 拡張（前提参照）を本要求に含める」と明記。
- request.md が問題を正しく認識しており、設計ステップへの情報として十分。Finding としてカウント不要。

**Finding 3（前回 medium/fixable）: branch 名構成が 3 箇所**

再読の結果、request.md は 3 箇所すべてを明記している。

- 「現状コードの前提」に `pipeline-run.ts:174-175`、`design.ts:151`、`commit-orchestrator.ts:403-404` の 3 箇所を列挙。
- Finding としてカウント不要。

### 追加検証

- positional + `--issue <n>` の経路: `command-registry.ts:622-623` で `issue` フラグを取得し `runRun()` に渡す。issue-target を経由しない。request.md がこの経路の再配線を要求していることを確認。
- `start-from-issue.test.ts` TC-001 の assert 内容（引数契約・writeDraft 先行・SlugOccupiedError 伝播）が injection アプローチで保存可能であることを確認。
- `tests/unit/architecture/arch-allowlist.ts`: DSM 実違反ゼロ達成、CWD 等の既存 allowlist エントリを確認。injection アプローチで新エントリ追加が不要であることを確認。

## 検証できなかった項目

- GitHub GraphQL `createLinkedBranch` mutation の実際の挙動（request.md 記載の API 制約は信頼）
- `deleteLinkedBranch` の有無（スコープ外のため確認不要）

## Findings 詳細

なし。前回 3 件の findings はいずれも request.md の読み違いに基づくものであり、今回の再検証で解消を確認した。
