# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション（現状コードの前提）

以下のすべてのアサーションを対象ファイルの実際のコードで確認した。

| アサーション | ファイル:行 | 確認内容 |
|---|---|---|
| guarded mode の staging は裸の `git add -A` | `commit-push.ts:498` | `["add", "-A"]`（パス指定なし）を確認 |
| `commitFinalState` の staging も裸の `git add -A` | `commit-push.ts:561` | `["add", "-A"]` を確認。コメントに "Stage all changes." と明記 |
| push-as-is 経路（agent 自己 commit 後、staged 変更なしの場合） | `commit-push.ts:242` | `pushOnly` 呼び出しを確認。コメントに "pushing as-is" と明記 |
| push after pipeline commit | `commit-push.ts:267` | `pushOnly` 呼び出しを確認（section 3: staged changes path） |
| fan-out 前後の HEAD 差分検査が存在しない | `parallel-review-round.ts` | `roundOwnsGitEffects=true` でメンバーは commit しない前提だが、fan-out 前後に HEAD SHA を比較するコードが存在しないことを確認。`listWorktreeChanges`（worktree only）は使用されているが HEAD 前進の検出はない |
| 並列 round の commit は `commitRound` に集約 | `commit-orchestrator.ts:464` | `async commitRound(params: {...})` の定義を確認 |
| `biteEvidenceResultPath` が存在する | `util/paths.ts:75` | `export function biteEvidenceResultPath(slug: string): string` を確認 |

### scoped residual git status 失敗の黙殺

`commit-push.ts` 行 421-425 に以下のコードを確認:
```typescript
// Asymmetry note: postStatus.ok===false → skip silently (best-effort).
const postStatus = await getWorktreeChangedPaths(infra.spawnFn, cwd);
if (postStatus.ok && postStatus.paths.length > 0) {
```
`postStatus.ok === false` の場合、silently skip される。

### git clean / git checkout 失敗の黙殺

`commit-push.ts` 行 440-441（scoped residual の restore 処理）および行 492-493（guarded mode の restore 処理）で、`gitExecResult` の戻り値を確認せずに続行していることを確認。コメントに "best-effort" と明記。

### #888 の残留回帰メカニズム

`pipelineManagedPaths`（`round-git-scope.ts:99`）が現状 `[state.json, events.jsonl, usage.json]` のみを返し、`bite-evidence-result.md` を含まないことを確認。parallel round の `partitionRoundChanges` がこの集合を基準に offending を判定するため、bite-evidence CLI step が書いた `bite-evidence-result.md` が worktree に残ると round guard 誤発火する構造を確認。

### R4 egress 照合の前提（state 記録された commitOid）

`commit-orchestrator.ts:69` に `commitOid` フィールドが `StepRun` に記録される設計を確認。egress 照合で "state の commitOid 集合" を正として使う前提が成立している。

## 検証できなかった項目

None（全アサーションを実コードで確認）

## Findings 詳細

### [observation] commit-push.ts:267 は "push-as-is" ではなく "push after pipeline commit"

request の「現状コードの前提」で `src/core/step/commit-push.ts:242,267` を "agent 自己 commit の push-as-is 経路" として列挙しているが、line 267 は staged changes が存在する場合の pipeline commit 後の push であり、push-as-is ではない。push-as-is 経路は line 242 のみ。

line 267 は合成モデルへの移行後も「pipeline commit 後の push」として残る経路であるため、廃止対象は line 242 の push-as-is 分岐のみ。実装者が混乱しないよう design step で明確化することを推奨する（blocking ではない）。
