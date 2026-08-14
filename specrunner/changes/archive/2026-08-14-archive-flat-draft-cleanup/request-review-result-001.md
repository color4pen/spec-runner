# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### 1. コードアサーション検証

**`src/core/archive/orchestrator.ts:260-265`**
実コード（line 261-265）を確認。`fs.rm(nodePath.join(recordDir, draftsDir(), slug), { recursive: true, force: true })` — ディレクトリ形式のみ、`recordDir`（worktree）基準。フラット形式なし。記述と一致。

**`src/core/request/store.ts:13-55`**（実体は 13-70 付近）
`resolveWithFallback` (lines 25-31) がディレクトリ形式 `drafts/<slug>/request.md` を先に試み、fallback でフラット形式 `drafts/<slug>.md` を返すことを確認。`list()` も両形式を列挙（lines 52-70）。記述と一致。

**`src/core/cancel/runner.ts:154`**
`const destPath = path.join(deps.repoRoot, draftPath(slug))` — `repoRoot` 基準で write 先を決定。記述と一致。

**`src/core/archive/orchestrator.ts:272-280`**（実体は 272-284）
`git add specrunner/drafts/` を `cwd: recordDir`（worktree）で実行。untracked draft は worktree に存在しないため実質 no-op。記述と一致。

### 2. `cwd` = repo root の確認

`cli/archive.ts:92` で `const repoRoot = opts.cwd` と定義され、`cwd: opts.cwd` として `runArchiveOrchestrator` に渡されることを確認。`ArchiveInput.cwd` の JSDoc も "Main repo root (cwd). Must not be inside a worktree." と明記。

worktree モード時 `recordDir = worktreePath`（line 228）、no-worktree モード時 `recordDir = cwd`（line 201）。フラット形式削除の欠落はいずれのモードにも存在するが、worktree モードではさらに削除先の誤りも重なる。

### 3. 既存テスト T-01 の挙動

`orchestrator.test.ts:131-149` — T-01 は `expectedDraftPath = nodePath.join(FAKE_WORKTREE, draftsDir(), FAKE_SLUG)` への `fs.rm` を期待。これは現行の誤った動作（worktree 削除）を正とするピンテスト。fix 後に更新対象となることを確認。request は「design で更新対象を列挙し根拠を明示する」条件で認めているため問題なし。

### 4. `FinishFs` インターフェース

`src/core/finish/types.ts` — `FinishFs` に git 操作メソッドはない。tracked 判定には `ArchiveInput.spawn`（既存）で `git ls-files --error-unmatch` 等を実行する形が妥当。spawn は既存コードで使われており追加依存なし。

### 5. 受け入れ基準の検証可能性

5つの受け入れ基準はすべて具体的でテスト固定可能。既存テストの更新要否も request 内に明示的に条件が書かれており、設計フェーズへの委任も適切。

## 検証できなかった項目

None

## Findings 詳細

None
