# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション検証（5 箇所）

**1. `src/core/command/resume.ts:268-328` — apply-canon gate**

読了確認。`detectCanonDirtyPaths` が `protectedCanonPaths(slug)` に限定した検査を行い、`dirtyCanonPaths.length > 0` の場合のみ apply-canon または fail-closed で停止する。ブロック後の line 330 以降に非 canon dirty / untracked を検査するコードはなく、step 開始へそのまま進む。アサーション正確。

**2. `src/core/resume/apply-canon.ts:50` — `git status --porcelain -z --no-renames --` スコープ**

line 50 に `["status", "--porcelain", "-z", "--no-renames", "--", ...protectedCanonPaths(slug)]` の引数配列を確認。アサーション正確。

**3. `src/core/step/commit-push.ts:92-96` — pre-staged 除外の仕組み**

line 92-96 は `getWorktreeChangedPaths` の `worktreeOnly` パラメータのコメント。`worktreeOnly=true` で pre-staged-only (`X≠' '`, `Y=' '`) を除外すると明記。一方、untracked ファイル（`X='?'`, `Y='?'`）は `Y !== ' '` のため除外されず `paths` に含まれる。残骸ファイルが untracked の場合（チェックポイントコミット未到達でのクラッシュ）は除外されず `findScopedCommitViolations` でひっかかる。アサーション正確。

**4. `src/core/step/commit-push.ts:53-79` — quarantine 機構**

line 53-79 は `quarantineRoundHeadAdvanceEvidence` 関数。`localSidecarDir(slug)`（`.specrunner/local/<slug>/`）に証拠ファイルを書き出す。ただしこれは round HEAD advance の証拠退避であり、write-scope violation の証拠退避は line 238-282 の `quarantineViolationEvidence` が担う。アサーションは「quarantine の仕組みが `.specrunner/local/<slug>/` に存在する」という点で正確だが、引用関数は violation content の退避ではなく HEAD advance の退避であることに留意（実装者向け補足）。

**5. `src/core/pipeline/round-git-scope.ts:109` — `pipelineManagedPaths(slug)`**

line 109 に関数定義を確認。返却は `[slugStateJsonPath, slugEventsPath, usageJsonPath, biteEvidenceResultPath, prCreateResultPath]` の 5 パス（change folder 配下のパイプラインメタファイル）。spec-review-result-NNN.md 等の step result ファイルはこの集合に含まれない（各 step の `writes()` で宣言される）。アサーションは「定義が存在する」点で正確だが、change folder の全 step 成果物を網羅する集合ではない（実装者向け補足）。

### 障害経路の確認

`findScopedCommitViolations`（write-scope.ts:165-173）のロジックを読了。
`changedPaths − (declaredWritePaths ∪ managedPaths)` が 1 件でも残ればバイオレーション。
`git status --porcelain -z` で `?? specrunner/changes/<slug>/spec-review-result-002.md` がある worktree で spec-review（iteration 003 を宣言）を実行すると、`postStatus.paths`（worktreeOnly=true でも untracked は残る）に 002 が含まれ、003 でも managedPaths でもないため halt が再生成される。背景で述べた実例経路を机上で辿り、問題の確証を得た。

### 要件・受け入れ基準・スコープ整合

- 3 クラス分類（protected canon / pipeline 管理成果物 / 非管理パス）は明確で重複・漏れなし
- `isJudgeArtifact`（write-scope.ts:85-91）が `*-result-*.md` と `review-feedback-*.md` を判定できる。これをベースに、または "change folder 配下で protected canon 外のすべて" という基準で reconcile 対象を定義可能
- 受け入れ基準 5 項目（テスト 3 本 + canon テスト維持 + docs）は検証可能
- スコープ外（非管理パス不変、write-set 検査側変更なし、halt 側 cleanup 追加なし）が明文化されており、実装者の裁量を絞っている
- 全経路対応（既定 / `--from` / `--apply-canon` 併用）は `prepare()` 内への単一挿入点で充足できる

### docs ディレクトリ確認

`docs/` 配下に `guarantees.md`, `operations.md` 等が存在。requirement 6 の "docs に 1 ページ" は新規 docs ファイルとして実現可能と確認。

## 検証できなかった項目

None — コードアサーション 5 点すべて読了確認済み、障害経路も机上検証済み。

## Findings 詳細

### F-01: commit-push.ts:53-79 引用の説明精度（観察、非ブロッキング）

引用行が指す `quarantineRoundHeadAdvanceEvidence` は round HEAD advance の証拠退避であり、「違反内容を退避する quarantine」の代表例としては write-scope violation 版（238-282 の `quarantineViolationEvidence`）がより直接的。実装上は両者とも `localSidecarDir(slug)` への退避パターンを共有しており、再利用候補は明確。ブロッキング問題なし。

### F-02: `pipelineManagedPaths` の説明精度（観察、非ブロッキング）

同関数は 5 パス（state.json, events.jsonl, usage.json, bite-evidence-result.md, pr-create-result.md）のみ返却し、step result ファイルを含まない。reconcile 対象の "pipeline 管理成果物" の判定は、`isJudgeArtifact`（`*-result-*.md` / `review-feedback-*.md`）ないし「change folder 配下で protected canon 外」という基準で実装する必要がある点を実装者は認識すべき。ブロッキング問題なし。
