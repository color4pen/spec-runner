# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション照合

| アサーション | 確認結果 |
|---|---|
| `copy-artifacts.ts:146-173` — `recopyDraftToChangeFolder` 関数 | ✅ 関数は lines 146-173 に存在。directory 形式 (`draftPath(slug)`) のみを参照し、flat 形式は `fs.access` 失敗で no-op になる挙動も確認 |
| `workspace-materializer.ts:93` — resume-existing recopy | ✅ line 93 = `await recopyDraftToChangeFolder(this.host.cwd, workspace.cwd, slug, this.host.spawnFn)` |
| `workspace-materializer.ts:119` — resume-recreated/without-worktree recopy | ✅ line 119 = 同パターン |
| `workspace-materializer.ts:123-126` — attach-from-checkpoint は recopy しない | ✅ コメントで「branch-borne truth を上書きしない」と明記、recopy 呼び出しなし |
| `local.ts:448` — no-worktree resume recopy | ✅ `if (!isRunPath)` ブランチ、line 448 に該当呼び出し |
| `managed.ts:167` — managed resume recopy | ✅ `if (!branchName)` ブランチ、line 167 に該当呼び出し |
| `archive/orchestrator.ts:261-270` — archive 時 draft 削除（flat/directory 両対応） | ✅ lines 260-279 で flat `.md` と directory `/` の両形式を削除。git tracked は削除せず警告 |
| `workspace-materializer.ts:179-197` — new-run で request.md 実体化 + stage | ✅ lines 179-197 = `fs.cp` → `git add`（失敗時 worktree cleanup） |
| `write-scope.ts:62-70` — `protectedCanonPaths` に `requestMdPath` を含む | ✅ lines 62-72 確認 |
| `resume.ts:273-282` — gate より前に request.md を parse | ✅ lines 273-282 = `resolveRequestPath` → `parseRequestMd` |
| `resolve-request-path.ts:38` — worktree 優先フォールバック | ✅ `/specrunner/drafts/` 含む場合に worktree 側 → cwd 側の順で fallback |
| `design.ts:111` — design がディスクの request.md を再読 | ✅ line 111 = `readFile(resolve(cwd, requestMdPath(slug)), "utf-8")` |
| `cancel/runner.ts:145` — restore 元 = worktree の requestMdPath | ✅ `sourcePath = path.join(worktreePath, requestMdPath(slug))` |
| `cancel/runner.ts:158` — draft 生存時は skipping-restore 警告 | ✅ `fs.access(destPath)` 成功で warning を push して return |
| `run-inbox.ts:397-400` — inbox が `writeDraft` → `start` を行う | ✅ lines 397-400 = `writeDraft(repoRoot, slug, issueBody)` → `runRunCore(draftPath, ...)` |
| `tests/unit/util/copy-artifacts.test.ts` — TC-RECOPY-001〜005 | ✅ lines 219-357 に 5 ケース存在。TC-SYM-* も同ファイルに存在し、削除対象外 |

### 構造・整合性確認

- `draftPath(slug)` は `specrunner/drafts/<slug>/request.md`（directory 形式のみ）を返す。flat 形式 `specrunner/drafts/<slug>.md` は `paths.ts` に別途存在せず archive が直接パスを組む設計。消費ロジックも archive と同様に両形式を個別処理する必要あり — request の要件 1 に明記済み。
- `managed.ts` の run path（`branchName` 有）はコミット後に `git push` が入る（lines 260-270）。要件 1 の「commit 成立後」の hook 点はこの push の前後どちらでも要件を満たせる。request は "消費の hook 点は実装 seam の選定は design に委ねる" と明示しており設計として問題なし。
- `local.ts` の no-worktree run path（lines 391-443）も commit 後の消費対象。request は明示していないが "job start での draft 消費" の趣旨から対象に含まれる — design が 3 つの run path（workspace-materializer/local no-worktree/managed）をすべて処理する必要がある。
- `resolveRequestPath` は start 後に `state.request.path` が `changes/<slug>/request.md` を指せば `/specrunner/drafts/` を含まないため fallback ロジックに入らず as-is を返す（既存のレガシーパス対応とも両立）。

## 検証できなかった項目

None。全アサーションを Read/Grep で直接確認。

## Findings 詳細

None。
