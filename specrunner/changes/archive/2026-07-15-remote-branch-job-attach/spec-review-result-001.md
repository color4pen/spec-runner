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
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | Correctness | tasks.md T-04 | `verifyCheckpoint` が `composeSplitLayoutFromContent(stateJson, eventsJsonl)` を `slugInject` なしで呼ぶと `state.request.slug === null` になるが、`getJobSlug(state)` は fallback chain の 2 番目（`state.branch` → prefix strip + jobId suffix strip）で正しく slug を導出するため動作は正しい。ただし検証者が実コードを確認せずに「null になって (e) が失敗するのでは」と誤解するリスクがある。T-04 の acceptance criteria に「`state.request.slug` は null だが `getJobSlug(state)` は `state.branch` から slug を導出するため (e) が正しく通る」旨を一言注釈すると後の混乱を防げる。 | T-04 に注釈を追加するか、`composeSplitLayoutFromContent` 呼び出し例として `slugInject: { slug, stateRoot: repoRoot }` を明示しておく（どちらでも動作は同じ）。 |
| 2 | LOW | Security | tasks.md T-08 | `--branch <branch>` はユーザー入力であり、CLI entry point での branch 名フォーマット検証が明示されていない。array-based subprocess 呼び出し（`spawnFn("git", [...])` 形式）を使用するため shell injection は無効化されており、実害は低い。既存コードベースの他コマンドも branch 名の明示的バリデーションを行っていないため現状パターンとは一致している。 | 他コマンドと一貫性を維持しつつ許容してよい。必要であれば git 無効文字（null byte、`..`、`@{` 等）を事前拒否する `validateBranchName` ガードを T-08 に追加し、exit 2 で返す。 |
| 3 | LOW | Correctness | design.md D7, tasks.md T-08 | T-08 step 6 で `baseBranch` を `state.request.baseBranch ?? "main"` から取得する記述があるが、`RequestInfo` の `baseBranch` フィールドが spec/tasks のどこにも型レベルで言及されていない。`state.json` に `baseBranch` が格納される保証を tasks.md が明記していない（`request.md` の front-matter `base-branch:` が `RequestInfo.baseBranch` として永続化される前提で書かれている）。 | T-08 に「`state.request.baseBranch` は pipeline 開始時に `request.md` front-matter の `base-branch` から設定されることを前提とする」旨を明記する。既存コードで確認済みであれば注釈で十分。 |

## Review Notes

### 確認した主要設計判断の健全性

**D2 の「検証してから materialize」順序保証**: `verifyCheckpoint` が `setupWorkspace` より前段で throw する制御フロー順序で構造的に保証されている。D3 (capability gate パターン) との一貫性も確認済み。

**`pid=null` sidecar の下流互換性**: コードベース全体で確認した結果、`pid=null` は安全：
- `listLocalSidecars`（`local-job-index.ts`）: `pid` フィールドを読まない
- `checkDuplicateLiveJob`（`duplicate-slug-guard.ts`）: `typeof pid !== "number"` で null を許容（allow パス）
- `isStaleRunning`（`safety.ts`）: `state.status !== "running"` で `awaiting-resume` は即 `false` 返り（pid チェックに到達しない）
- `resume` 時の `patch: { pid: process.pid, ... }`: 適切に上書きされる

**TOCTOU（verify → materialize 間の remote force-push）**: `git fetch` で local tracking ref `origin/<branch>` が固定され、次の fetch まで変化しないため、`git worktree add ... origin/<branch>` は verify 時点のコミットを checkout する。実質的なリスクなし。

**`getJobSlug` の fallback chain**: branch-borne `state.json` は slug-mode で `request.slug` / `request.path` が strip されるが、`validateJobState` が `request.slug` を `null` にデフォルトし、`getJobSlug` が `state.branch`（strip されない）から slug を導出するため `verifyCheckpoint(e)` は正しく機能する。

**attach → resume 経路**: attach が `.git/specrunner-worktrees/<slug>-<jobId8>/specrunner/changes/<slug>/state.json` を worktree checkout で配置すると、`JobStateStore.list` の既存走査が無改変でこれを発見できる。`resolveJobStateBySlug` 変更不要を確認。

**層制約（T-03）**: `src/git/checkpoint-ref.ts` が `src/core/` / `src/adapter/` を import しない制約は `src/git/remote.ts` / `source-revision.ts` の既存パターンに倣っており妥当。

**既存 arm への影響なし（D4）**: `WorktreeMaterializationPlan` union への variant 追加 + `materialize()` への arm 追加は最小侵襲。既存 4 arm のコードに触れないため、既存テストが無改変で green であることが構造的に保証される。

### セキュリティ観点

OWASP Top 10 関連で以下を確認：
- **A01（アクセス制御）**: `state.repository.owner/name === expectedRepo` による identity 検証（D2 (e)）で他リポジトリのチェックポイントを流用不可。
- **A03（インジェクション）**: git subprocess は array args 形式（`spawnFn("git", [...args], opts)`）で shell を経由しないため、branch 名のコマンドインジェクションは無効化されている。
- **A04（安全でない設計）**: verifyCheckpoint の「検査して throw = 状態を作らない」は capability gate パターンと同型で、partial state 汚染を構造的に排除している。
- **A07（認証の失敗）**: `createTransportAuth.wrapSpawn` で private repo への fetch に GitHub token を注入するパスが明示されている（T-08）。
- **A08（ソフトウェアの整合性の失敗）**: `state.status === "awaiting-resume"` 検証 + journal/projection 整合確認で、不整合な remote checkpoint を受け入れない。

全体として、セキュリティ上のブロッカーはなし。
