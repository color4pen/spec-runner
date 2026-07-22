# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### 1. 3 つの bootstrap commit サイトの確認

`src/core/runtime/local.ts:406`、`src/core/runtime/managed.ts:236`、`src/core/runtime/workspace-materializer.ts:215` を Read で確認。各サイトともに：
- `["commit", "-m", "add request.md for ${slug}", "--", changeFolderPath(slug)]` を実行
- commit 直後に `git rev-parse HEAD` で OID を捕捉する処理が存在しない
- `appendSynthesizedCommit` や `synthesizedCommits` への書き込みが存在しない
- `jobId` と `updateJobState`（または `this.host.updateJobState`）は commit 直後のスコープで既にアクセス可能（`local.ts:421`、`managed.ts:257`、`workspace-materializer.ts:229` で commit 後に `updateJobState` 呼び出しが存在する）

**結果**: 3 サイトすべてで OID の記録漏れを確認。request の記述と一致。

### 2. `appendSynthesizedCommit` の存在と性質

`src/state/schema/operations.ts:35` を確認：
```ts
export function appendSynthesizedCommit(state: JobState, oid: string): JobState {
  const existing = state.synthesizedCommits ?? [];
  if (existing.includes(oid)) return state;
  return { ...state, synthesizedCommits: [...existing, oid] };
}
```
- pure 関数（state を mutate しない）
- 冪等（既存 OID の場合は同じ state を返す）

**結果**: request の記述と一致。

### 3. egress check の公開範囲計算

`src/core/step/commit-push.ts:352` の `runInlineEgressCheck` を確認：
```ts
const revListArgs = ["rev-list", "HEAD", "--not", "--remotes=origin"];
```
- entry-HEAD による縮小なし（厳密形）
- bootstrap commit が未 push かつ台帳外の場合、`rev-list HEAD --not --remotes=origin` の結果に含まれ `EGRESS_UNKNOWN_COMMIT` で halt する

**結果**: request の記述と一致。

### 4. 既存テストの seed 方法

`tests/unit/step/write-scope-bypass-closure-integration.test.ts:210-214` を確認：
```ts
function revList(cwd: string): string[] {
  const result = spawnSync("git", ["rev-list", "HEAD"], ...);
  ...
}
const state = { ...makeJobState(), synthesizedCommits: revList(gitDir) };
```
`tests/unit/step/test-materialize-boundary.test.ts:913-914` でも同様：
```ts
const baselineOids = spawnSync("git", ["rev-list", "HEAD"], ...)
  .stdout.split("\n").map(...).filter(Boolean);
...synthesizedCommits: baselineOids
```
- いずれも repo 内の全既存 commit を seed しており、bootstrap commit がすでに repo 内に入っていれば台帳に載る形になる
- `tests/pipeline-sole-committer-e2e.test.ts` では `synthesizedCommits` を一切 seed していない（`makeJobState` のデフォルトに `synthesizedCommits` なし）が、そのテストは bootstrap commit 経路を通らない別の commit シナリオ

**結果**: request の「この seed が本欠陥を覆い隠した」という記述を確認。

### 5. 3 経路の性質の差異

- `local.ts`（`--no-worktree` 経路）: bootstrap 後に push なし。最初の step commit + push で halt する。
- `workspace-materializer.ts`（worktree 経路）: bootstrap 後に push なし。同様。
- `managed.ts`: bootstrap 直後に `git push origin <branchName>` を実行（line 244-253）。push 成功時、bootstrap commit は origin に載るため通常の egress チェックでは検出されない。ただし push 失敗 → bootstrap 失敗（throw）であり、resume 経路で台帳外 commit が問題になりうる。ledger の意味論的完全性の修正として valid。

**結果**: 3 経路の修正が必要という request の主張に合理性がある。

### 6. 要件・受け入れ基準の実装可能性

- 要件 1（OID 捕捉 → `appendSynthesizedCommit` → 永続化）: 各サイトで commit 直後に `git rev-parse HEAD` → `updateJobState` を追加するだけ。既存パターン通り。
- 要件 2（fail-closed）: rev-parse 失敗時に throw することで bootstrap を失敗させる。
- 要件 3（実 git テスト）: 手動 seed なしで bootstrap → first scoped commit + push が通ることを確認するテスト。
- 受け入れ基準はすべて具体的かつ機械的に検証可能。

## 検証できなかった項目

None — 確認すべき主要なコードアサーションはすべて Read/Grep で直接確認した。

## Findings 詳細

指摘なし。

request.md の問題設定・コードアサーション・要件・受け入れ基準・設計判断のいずれも正確かつ一貫している。スコープは明確で、実装リスクは低い（既存 `appendSynthesizedCommit` を3サイトに適用するだけ）。
