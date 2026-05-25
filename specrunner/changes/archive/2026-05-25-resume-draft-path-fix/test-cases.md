# Test Cases: resume-draft-path-fix

## TC-01: 新規 state — drafts/ を含まないパスはそのまま返る

- **Category**: Unit / resolveRequestPath
- **Priority**: must
- **Source**: Task 5 (ケース 1) / 受け入れ基準「新規 path 記録」

**GIVEN** `statePath` が `/repo/specrunner/changes/my-slug/request.md`（drafts/ を含まない）  
**WHEN** `resolveRequestPath(statePath, "my-slug", null, "/repo")` を呼ぶ  
**THEN** 戻り値が `statePath` と等しい（ファイル存在チェックは行われない）

---

## TC-02: legacy state + worktreePath あり（local runtime）— worktreePath 配下のパスが返る

- **Category**: Unit / resolveRequestPath
- **Priority**: must
- **Source**: Task 5 (ケース 2) / 要件 2 第 1 候補 / 受け入れ基準「legacy fallback — local runtime」

**GIVEN** `statePath` が `/repo/specrunner/drafts/my-slug/request.md`  
**AND** `worktreePath` が `/repo/.git/specrunner-worktrees/my-slug-abc`  
**AND** `<worktreePath>/specrunner/changes/my-slug/request.md` が存在する  
**WHEN** `resolveRequestPath(statePath, "my-slug", worktreePath, "/repo")` を呼ぶ  
**THEN** 戻り値が `<worktreePath>/specrunner/changes/my-slug/request.md` である

---

## TC-03: legacy state + worktreePath あるが存在しないディレクトリ — cwd 配下にフォールバック

- **Category**: Unit / resolveRequestPath
- **Priority**: must
- **Source**: 要件 2 第 2 候補（worktree 削除済みケース）

**GIVEN** `statePath` が `/repo/specrunner/drafts/my-slug/request.md`  
**AND** `worktreePath` が `/repo/.git/specrunner-worktrees/deleted-worktree`（ディレクトリ不在）  
**AND** `/repo/specrunner/changes/my-slug/request.md` が存在する  
**WHEN** `resolveRequestPath(statePath, "my-slug", worktreePath, "/repo")` を呼ぶ  
**THEN** 戻り値が `/repo/specrunner/changes/my-slug/request.md` である

---

## TC-04: legacy state + worktreePath null（managed runtime）— cwd 配下のパスが返る

- **Category**: Unit / resolveRequestPath
- **Priority**: must
- **Source**: Task 5 (ケース 3) / 要件 2 第 2 候補 / 受け入れ基準「legacy fallback — managed runtime」

**GIVEN** `statePath` が `/repo/specrunner/drafts/my-slug/request.md`  
**AND** `worktreePath` が `null`  
**AND** `/cwd/specrunner/changes/my-slug/request.md` が存在する  
**WHEN** `resolveRequestPath(statePath, "my-slug", null, "/cwd")` を呼ぶ  
**THEN** 戻り値が `/cwd/specrunner/changes/my-slug/request.md` である

---

## TC-05: legacy state + 両候補ともファイル不在 — 元の statePath をそのまま返す（ENOENT は呼び出し側）

- **Category**: Unit / resolveRequestPath
- **Priority**: must
- **Source**: Task 5 (ケース 4) / 受け入れ基準「完全 ENOENT」

**GIVEN** `statePath` が `/repo/specrunner/drafts/my-slug/request.md`  
**AND** worktreePath 配下にも cwd 配下にも `request.md` が存在しない  
**WHEN** `resolveRequestPath(statePath, "my-slug", null, "/cwd")` を呼ぶ  
**THEN** 戻り値が元の `statePath` と等しい（関数は例外を投げない）

---

## TC-06: job start 後に state.request.path が永続パスを指している（local runtime）

- **Category**: Integration / local runtime
- **Priority**: must
- **Source**: Task 2 / 受け入れ基準「job start 完走後、state.request.path が changes/ を指す」

**GIVEN** `specrunner/drafts/<slug>/request.md` が存在し、job が start される  
**WHEN** local runtime の `setupWorkspace` が draft を `changes/<slug>/request.md` にコピーし draft を削除する  
**THEN** job state ファイルの `request.path` が `<worktreePath>/specrunner/changes/<slug>/request.md` を指している  
**AND** `specrunner/drafts/<slug>/request.md` は削除されている（削除挙動は変更しない）

---

## TC-07: job start 後に state.request.path が永続パスを指している（managed runtime）

- **Category**: Integration / managed runtime
- **Priority**: must
- **Source**: Task 3 / 受け入れ基準「job start 完走後、state.request.path が changes/ を指す」

**GIVEN** `specrunner/drafts/<slug>/request.md` が存在し、job が start される  
**WHEN** managed runtime の `setupWorkspace` が draft を `changes/<slug>/request.md` にコピーし draft を削除する  
**THEN** job state ファイルの `request.path` が `<cwd>/specrunner/changes/<slug>/request.md` を指している

---

## TC-08: 新規 job の resume — ENOENT が発生しない

- **Category**: Integration / resume command
- **Priority**: must
- **Source**: 要件 2「新規 job は削除済みファイルを読みに行かない」

**GIVEN** job start 済みで `state.request.path` が `changes/<slug>/request.md` を指している（TC-06/07 の事後状態）  
**WHEN** `specrunner job resume <slug>` を実行する  
**THEN** ENOENT エラーなしに resume フローが進む

---

## TC-09: legacy state + local runtime の resume — フォールバックで動作する

- **Category**: Integration / resume command
- **Priority**: must
- **Source**: 受け入れ基準「削除済 drafts/ 配下 path しか持たない既存 state でも resume が動く」/ Task 4

**GIVEN** `state.request.path` が `specrunner/drafts/<slug>/request.md`（legacy）  
**AND** `state.worktreePath` が存在するディレクトリを指し、その配下に `specrunner/changes/<slug>/request.md` がある  
**WHEN** `specrunner job resume <slug>` を実行する  
**THEN** ENOENT エラーなしに resume フローが進む（worktreePath 配下の永続 request.md が使われる）

---

## TC-10: legacy state + managed runtime の resume — cwd フォールバックで動作する

- **Category**: Integration / resume command
- **Priority**: must
- **Source**: 受け入れ基準「legacy fallback — managed runtime」/ Task 4

**GIVEN** `state.request.path` が `specrunner/drafts/<slug>/request.md`（legacy）  
**AND** `state.worktreePath` が `null`  
**AND** `<process.cwd()>/specrunner/changes/<slug>/request.md` が存在する  
**WHEN** `specrunner job resume <slug>` を実行する  
**THEN** ENOENT エラーなしに resume フローが進む（cwd 配下の永続 request.md が使われる）

---

## TC-11: legacy state + 両候補とも不在の resume — ENOENT エラーを出す

- **Category**: Integration / resume command
- **Priority**: must
- **Source**: 要件 3「フォールバック解決が失敗した場合は現在と同等の ENOENT エラー」

**GIVEN** `state.request.path` が `specrunner/drafts/<slug>/request.md`（legacy）  
**AND** worktreePath 配下にも cwd 配下にも `changes/<slug>/request.md` が存在しない  
**WHEN** `specrunner job resume <slug>` を実行する  
**THEN** ENOENT エラーが発生する（現状と同等のエラーメッセージ）

---

## TC-12: `state.request.path` 更新は draft コピー成功後・削除前に行われる

- **Category**: Unit / local.ts + managed.ts
- **Priority**: should
- **Source**: Task 2/3 「コピー成功後すぐに更新するのが安全」/ design D1

**GIVEN** draft コピーが成功している  
**WHEN** `updateJobState` が呼ばれる  
**THEN** `state.request.path` が永続パスに更新された後に `fs.rm` が draft を削除する（順序の保証）

---

## TC-13: `resolveRequestPath` — slug に特殊文字を含む場合もパスが正しく組み立てられる

- **Category**: Unit / resolveRequestPath
- **Priority**: should
- **Source**: 堅牢性 / `requestMdPath(slug)` 経由の組み立て

**GIVEN** `slug` が `my-feature-fix-123`（ハイフン・数字含む）  
**AND** `statePath` が drafts/ を含む legacy パス  
**AND** cwd 配下に `specrunner/changes/my-feature-fix-123/request.md` が存在する  
**WHEN** `resolveRequestPath(statePath, "my-feature-fix-123", null, "/repo")` を呼ぶ  
**THEN** 戻り値が `/repo/specrunner/changes/my-feature-fix-123/request.md` である

---

## TC-14: typecheck + test が green

- **Category**: CI
- **Priority**: must
- **Source**: 受け入れ基準「bun run typecheck && bun run test が green」

**GIVEN** すべての実装変更が完了している  
**WHEN** `bun run typecheck && bun run test` を実行する  
**THEN** 型エラーなし・テスト全件パスで終了する
