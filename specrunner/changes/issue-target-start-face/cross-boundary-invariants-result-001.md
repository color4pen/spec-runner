# Cross-Boundary Invariants Review — issue-target-start-face
## Iteration 1

**Reviewer**: cross-boundary-invariants  
**Purpose**: 変更が触れていないコードの暗黙の前提（不変条件）を新しい挙動が黙って破っていないかを検出する。

---

## 検証対象ファイル

| ファイル | 観点 |
|---|---|
| `src/core/issue-target/start.ts` | cli/ 非依存の構造的実現 |
| `src/core/runtime/workspace-materializer.ts` | callback 配線・順序契約 |
| `src/core/runtime/local.ts` | base OID 解決・no-worktree 経路 |
| `src/core/command/pipeline-run.ts` | onFeatureBranchCreated の透過 |
| `src/cli/run.ts` | options 透過 |
| `src/cli/from-issue.ts` | --from-issue 経路の配線 |
| `src/cli/command-registry.ts` | positional+--issue 経路の配線 |
| `src/core/inbox/run-inbox.ts` | inbox 経路の cli/run 動的 import 保持 |
| `src/adapter/github/github-client.ts` | createLinkedBranch / getIssue 実装 |
| `src/kernel/github-client.ts` | port 型拡張 |
| `src/config/type-config.ts` | buildFeatureBranchName 単一化 |
| `tests/unit/core/runtime/workspace-materializer-link.test.ts` | ordering pin |
| `tests/unit/no-worktree-mode.test.ts` | no-worktree callback pin |
| `tests/unit/inbox/run-inbox-inbox-origin.test.ts` | inbox 配線 pin |
| `tests/unit/architecture/module-boundary.test.ts` | TC-001 構造検査 |
| `tests/unit/architecture/arch-allowlist.ts` | allowlist 無変更確認 |

---

## 検証結果

### 正常確認（不変条件が保たれている）

1. **issue-target → cli/ 非依存**: `src/core/issue-target/start.ts` は `cli/` を一切 import しない（静的・動的とも）。`module-boundary.test.ts` TC-001 が grep で pin している。
2. **base OID の 1 回解決**: `local.ts setupWorkspace` new-run arm で `git rev-parse origin/<base>` を 1 回だけ実行し、`plan.baseOid` に格納。`manager.create` と `onFeatureBranchCreated` の双方に同一の値を渡す。`workspace-materializer-link.test.ts` TC-008 が pin。
3. **worktree 作成失敗時に callback を呼ばない**: `manager.create` が throw すれば callback コードに到達しない（try/catch なし、throw が直上に伝播）。TC-009 が pin。
4. **callback 失敗は警告のみで start 継続**: materializer と no-worktree path の双方で `.catch()` によって吸収。TC-010 / TC-NW-012（no-worktree-mode.test.ts） が pin。
5. **createLinkedBranch の push 順序**: callback（= `createLinkedBranch`）は bootstrap commit の前に呼ばれ、GitHub 側に `baseOid` で branch を作った後に local が `baseOid+1` を push → fast-forward 成立。
6. **3 経路すべてで issue-target を経由**: `from-issue.ts` が `materializeDraftAndStart` を直接呼ぶ。inbox の `startJob` effect が `materializeDraftAndStart` を動的 import で呼ぶ。`command-registry.ts` の positional+`--issue` が `startWithIssueLink` を動的 import で呼ぶ。各経路のテストが pin している。
7. **inbox 配線テスト TC-018 の無改変 green**: `run-inbox-inbox-origin.test.ts` は `vi.mock("src/cli/run.js")` で inbox 既定 `startJob` → `runRunCore` の配線を pin。inbox effect 内で `cli/run.js` を動的 import する設計（D2）により、issue-target 層を cli-free にしつつ既存テストが無改変 green に保たれている。
8. **buildFeatureBranchName の単一化**: `pipeline-run.ts` / `design.ts` / `commit-orchestrator.ts` の 3 箇所がすべて `buildFeatureBranchName` を参照。インライン `${getBranchPrefix(...)}...slice(0,8)` 構成は消えている。
9. **arch-allowlist.ts 無変更**: 新規 allowlist エントリ追加なし。

---

## Findings

### F-001 — TC-011 ordering test が requestFilePath なしで vacuously true

**Severity**: medium  
**File**: `tests/unit/core/runtime/workspace-materializer-link.test.ts`  
**Line**: 183–188

**内容**:  
TC-011（「registration precedes bootstrap commit」）の ordering assertion は次のパターンになっている。

```typescript
if (addIdx !== -1) expect(callbackIdx).toBeLessThan(addIdx);
if (commitIdx !== -1) expect(callbackIdx).toBeLessThan(commitIdx);
```

テストは `requestFilePath` を opts に渡していない。`requestFilePath` がなければ `spawnFn` に `git add` / `git commit` が到達しないため、`addIdx` / `commitIdx` は常に `-1` となり、両アサーションは vacuously true（前提不成立で通過）になる。テスト本体には「without requestFilePath there's no git-add or commit」とコメントがある。

**クロス境界の問題**:  
実装上は callback が `if (opts?.requestFilePath)` ブロックより前に置かれており、順序は正しい（materializer.ts L195–199 vs L203–）。しかし誰かが callback を `requestFilePath` ブロックの後ろへ移動しても、このテストはパスし続ける。spec が要求する「bootstrap commit より前」の不変条件がテストで pinned されていない。

**Resolution**: fixable  
`requestFilePath` を渡すモックシナリオを TC-011 に追加し、`git add` / `git commit` の前に callback が呼ばれることを実際に assert する。`fs.cp` は `vi.spyOn` or `vi.mock("node:fs/promises")` でスタブ化すれば副作用なく実行可能。

---

### F-002 — no-worktree 経路: git rev-parse HEAD 失敗時に警告なしで callback が黙って skip される

**Severity**: low  
**File**: `src/core/runtime/local.ts`  
**Line**: 367–370

**内容**:  
`setupWorkspaceNoWorktree` の run path では、`git rev-parse HEAD` が非 0 exit を返した場合 `headOidForCallback` が `undefined` のままとなり、その後の条件 `if (headOidForCallback && opts?.onFeatureBranchCreated)` が false になって callback が呼ばれない。この場合、ユーザーへの警告出力は一切ない。

```typescript
// local.ts:366-370
if (opts?.onFeatureBranchCreated) {
  const revResult = await this.spawnFn("git", ["rev-parse", "HEAD"], { cwd: this.cwd });
  if (revResult.exitCode === 0) headOidForCallback = revResult.stdout.trim();
}
// ...
if (headOidForCallback && opts?.onFeatureBranchCreated) {
  await opts.onFeatureBranchCreated(headOidForCallback, branchName).catch(...)
}
```

**クロス境界の問題**:  
spec.md の「no-worktree route fires link registration after branch creation」シナリオでは「if `createLinkedBranch` fails, a warning is emitted」を要求しているが、OID 解決失敗は `createLinkedBranch` 呼び出し前の段階で黙って skip されるため、警告が出ない。運用上この挙動は「Development リンクが登録されなかった理由が分からない」を意味する。

空のリポジトリや git 設定不備の環境など、`git rev-parse HEAD` が失敗する状況は稀だが、no-worktree モードはより多様な CI 環境で使われる可能性がある。

**Resolution**: fixable  
OID 解決失敗時に `stderrWrite(...)` で警告を出力し、callback が skip されることをユーザーに伝える（例: `Warning: cannot resolve HEAD OID for linked branch registration — skipping`）。no-worktree-mode.test.ts に rev-parse 失敗ケースのテストを追加する。

---

## Observations（action 不要）

- **double getIssue call in --from-issue path**: `from-issue.ts` が issue 取得時に `nodeId` も得ているが、この値は捨てられ、callback 内で `buildLinkedBranchRegistrar` が `getIssue` を再度呼んで `nodeId` を取得する。API 往復が 1 回余分になるが、設計上の意図的選択（callback self-contained / `nodeId` を引数に追加するより結合が低い）であり正しく動作する。パフォーマンスは best-effort なリンク登録の遅延として吸収される。
- **symref fallback**: `git rev-parse origin/<base>` が失敗した場合、`plan.baseOid` が `undefined` になり materializer は `plan.remoteBaseRef`（= `"origin/main"` 等のシンボリック ref）を `createLinkedBranch` の `oid` として渡す。GitHub GraphQL はシンボリック ref を `GitObjectID` として受け付けないため失敗する。callback が best-effort でこれを吸収するため start は継続し、設計文書（D5 trade-off）が認識している範囲内。

---

## 証拠サマリー

| 検証項目 | 結果 |
|---|---|
| issue-target → cli/ 非依存（構造検査） | ✓ |
| base OID 1 回解決（TC-008） | ✓ |
| worktree 失敗で callback skip（TC-009） | ✓ |
| callback 失敗で start 継続（TC-010 / TC-NW-012） | ✓ |
| 3 経路すべてで issue-target 経由（各テスト） | ✓ |
| inbox TC-018 無改変 green（設計確認） | ✓ |
| buildFeatureBranchName 単一化（grep 相当確認） | ✓ |
| arch-allowlist.ts 無変更 | ✓ |
| TC-011 ordering pin (requestFilePath なし) | **gap** |
| no-worktree rev-parse 失敗時の警告 | **gap** |

checked: 14, skipped: 0, unverified: 0
