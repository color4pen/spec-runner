# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### 1. コードアサーション検証

**`src/core/archive/orchestrator.ts`**
- L59–61: `deferArchivedTransition?: boolean` フィールドとコメント "Default: false (plain `job archive` transitions at record time)" を確認
- L242–258: `if (!input.deferArchivedTransition)` → `markJobArchived()` が呼ばれることを確認
- L349–361: `git push origin <branch>` で feature branch に push する実装を確認
- L12–14 (コメント): "Design invariant: does NOT import GitHubClient — no GitHub API calls." を確認

**`src/core/archive/merge-then-archive.ts`**
- L282–285: `runArchiveOrchestrator({ ..., deferArchivedTransition: true })` で archive record を先に積み、`awaiting-archive` を維持することを確認
- L463–701: CI wait loop（check status → pending/success/failure/none 分岐）を確認
- L782–788: merge 成功後に `performPostMergeTransition` + `runPostMergeCleanup` を呼ぶことを確認
- L251–260 (Step 2): `prData.state === "MERGED"` → archiveRecorded フラグで分岐し、すでに merge 済みの場合に cleanup を走らせる経路を確認

**`src/core/finish/job-state-update.ts`**
- `markJobArchived` は `resolveCanonicalStateDir` 経由でアーカイブ済みフォルダを含めた正規 state dir を解決し、`transitionJob(current, "archived", ...)` を呼ぶことを確認
- noop 判定（既に `archived` → return without persist）でべき等性が担保されていることを確認

**`src/core/finish/archive-change-folder.ts`**
- `fs.exists(changeFolderAbsPath)` で `specrunner/changes/<slug>/` 不在時に `skipped: true` を返すことを確認（変更フォルダが既に archive/ に移動済みの場合のべき等性）

**`src/core/finish/commit-archive.ts`**
- `git diff --cached --quiet -- <pathspecs>` で staged changes なし → `skipped: true` を返すことを確認（べき等性）

**`src/cli/archive-from-issue.ts`**
- Step 6: `runAttachVerification({ ..., policy: attachArchivePolicy })` で `awaiting-archive` checkpoint の rebind を行うことを確認
- Step 7: `runArchive({ slug, withMerge: opts.withMerge, ... })` を呼ぶことを確認

**`src/core/attach/checkpoint-policy.ts`**
- `attachArchivePolicy.verify`: `state.status !== "awaiting-archive"` → エラー、`pullRequest.number` 欠如 → エラーを確認
- "job archive --from-issue により remote runner から awaiting-archive checkpoint を取り込める" というアサーションが正しいことを確認

**`src/state/lifecycle.ts`**
- `VALID_TRANSITIONS`: `"awaiting-archive"` → `"archived"` 遷移が定義されていることを確認
- `TERMINAL_STATUSES`: `"archived"` が terminal であることを確認

**`src/core/archive/__tests__/orchestrator.test.ts`**
- TC-010: `deferArchivedTransition` 未指定 → `markJobArchived` が呼ばれることを pin するテストが存在することを確認（本変更後に更新が必要な対象テスト）

### 2. 設計整合性検証

**要件 5（べき等性）**:  
re-run 時、change folder が既に `archive/` にある場合 → `archiveChangeFolder` は `exists()` で active 位置 `specrunner/changes/<slug>/` を検索し、存在しなければ `skipped: true` を返す。`commitArchive` も staged changes なしなら `skipped: true`。べき等性は既存実装で担保される。

**要件 7（post-merge cleanup の再利用）**:  
`runPostMergeCleanup` は `post-merge-cleanup.ts` に独立して存在し、plain archive 経路の CLI 層からも呼び出し可能。既存インターフェース変更なしで再利用できる。

**要件 4（out-of-band merge 検出）**:  
orchestrator の GitHubClient 非依存不変は維持しつつ、CLI 層（`archive.ts`）または git コマンドレベルでの検出が可能。候補案:
- **案A**: CLI 層で GitHub API（token 既取得済み）を使い PR state をチェック
- **案B**: `git fetch origin <baseBranch>` + `git merge-base --is-ancestor <feature-head> origin/<baseBranch>` で API 不要の git ベース検出

どちらの案も orchestrator の設計不変を破らない。具体的な実装選択は design step に委ねる（request は "優先して検討する" と明示しており、適切な委任）。

### 3. 受け入れ基準の検証可能性確認

全 7 項目の受け入れ基準を確認:
- "plain `job archive` 成功後、PR 未mergeなら state は `awaiting-archive`" → 要件 1 実装で担保
- "archive record commit は feature branch に push される" → 既存 orchestrator のコアフロー（要件 3 のアナロジーで維持）
- "archive record push 後に CI が failure でも state は `awaiting-archive`" → 要件 1 実装で自動的に担保（mark が呼ばれない）
- "out-of-band で PR merge 後、正規コマンド再実行により `archived` + cleanup まで完了する" → 要件 4 で対応、具体実装は design step へ
- "--with-merge は既存どおり CI green を待って merge 後に `archived` になる" → 要件 3 で既存経路維持
- "archive record 済み状態からの再実行は冪等" → 上記べき等性検証で確認済み
- "branch/worktree cleanup は merge 前には行われない" → `runPostMergeCleanup` が merge 後のみ呼ばれる設計で担保

## 検証できなかった項目

None

## Findings 詳細

None — 全要件・受け入れ基準ともに技術的に実現可能であることを確認。コードアサーションはすべて正確。
