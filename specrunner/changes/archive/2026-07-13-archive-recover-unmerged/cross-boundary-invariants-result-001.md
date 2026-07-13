# Cross-Boundary-Invariants Review — archive-recover-unmerged

- **reviewer**: cross-boundary-invariants
- **iteration**: 1
- **verdict**: approved

---

## Scope

変更した実装ファイル（`merge-then-archive.ts`, `orchestrator.ts`, `job-state-store.ts`）が、変更していないコード（`orphan.ts`, `exit-guard.ts`, `cancel/`, `inbox/`, `resume/`, `archive.ts` CLI 等）の暗黙の前提を黙って破っていないかを検証する。

---

## 検証した不変条件と結果

### INV-1: `orchestrator.ts` Phase 0 の terminal-status 短絡

**前提**: `TERMINAL_STATUSES.has(state.status)` が true → no-op return → idempotent 再記帳が走らない。

**検証**: D1（`deferArchivedTransition: true`）により記帳フェーズで `markJobArchived` を skip し、status は `awaiting-archive`（非 terminal）のまま保持される。再実行時に `list(cwd, { includeArchived: true })` は D4（section 2b）経由で worktree archive 内の `awaiting-archive` state を発見し、`TERMINAL_STATUSES.has("awaiting-archive")` = false なので短絡は発生しない。

**結果**: ✓ 不変

---

### INV-2: `assertJobFinishable` ゲートとの整合

**前提**: `canTransition(state.status, "archived")` が false → `JOB_NOT_FINISHABLE` escalation。

**検証**: status が `awaiting-archive` のとき `canTransition("awaiting-archive", "archived")` は true。再実行時も同じ status のため gates を通過する。

**結果**: ✓ 不変

---

### INV-3: Step 2 の「crash-resume vs 順序エラー」区別

**前提（旧）**: `jobStatus === "archived"` を crash-resume のシグナルとして使用。
**新**: `path.basename(path.dirname(sourceChangeDir)) === "archive"` に置換。

**検証**:

| 状況 | 旧シグナル | 新シグナル | 判定 |
|------|-----------|-----------|------|
| 記帳済み（archive/ 配下）+ PR MERGED | `archived` = true | dirname basename = `"archive"` = true | crash-resume ✓ |
| 未記帳（active changes/ 配下）+ PR MERGED | `archived` = false | dirname basename = `"changes"` = false | 順序エラー escalation ✓ |

D1 で status 遷移を遅延させると旧シグナル（`archived`）が機能しなくなるが、新シグナル（folder 位置）は D1 と独立して記帳の副作用（folder 移動）そのものを観測するため、両者の意味論は保たれる。

`ACTIVE_SOURCE_CHANGE_DIR` / `ARCHIVE_SOURCE_CHANGE_DIR` を用いた TC-004 / TC-005 でテスト固定済み。

**結果**: ✓ 不変（意味論を保ちながら実装を置換）

---

### INV-4: post-merge `archived` 遷移の全経路カバレッジ

**前提**: merge 成功後の全経路（crash-resume / merge-during-wait / fresh merge）で cleanup 直前に `awaiting-archive → archived` を遷移させる。

**検証**: `performPostMergeTransition` が 3 箇所すべてに配置されていることをコード確認:
1. Step 2: MERGED + archiveRecorded → cleanup 直前 (L220-224)
2. Step 4 wait loop: MERGED during wait → cleanup 直前 (L354-358)
3. Step 6: fresh merge 成功後 → cleanup 直前 (L614)

TC-006 / TC-014 / T-01 でテスト固定済み。失敗は best-effort（警告出力 + cleanup 継続）で、merge 済 job を escalation で隠さない設計。

**結果**: ✓ 不変

---

### INV-5: `listWithSourceDirs` の `includeArchived` ゲートと既存 caller への影響

**前提**: `cancel`, `inbox`, `exit-guard` 等は `list(repoRoot)`（includeArchived なし）を使用する前提で設計されている。section 2b の追加がこれらに影響を与えてはならない。

**検証**: section 2b は `opts?.includeArchived === true` を条件とするため、`includeArchived` なし caller には一切影響しない。

影響範囲が変わる `includeArchived: true` caller を個別確認:

| caller | 影響 |
|--------|------|
| `orchestrator.ts` Phase 0 | 意図通り: worktree-archive の `awaiting-archive` state を発見できるようになる |
| `merge-then-archive.ts` Step 1 | 意図通り: 同上（recovery の主目的） |
| `worktree/orphan.ts` | **正の副作用**: worktree-archive job が `NON_TERMINAL_STATUSES`（`awaiting-archive`）に含まれ、worktree が orphan 判定から保護される（旧コードでは状態が見つからず orphan 扱いになり得た） |
| `resume/resolve-job.ts` | worktree-archive job が `awaiting-archive` として見つかるが、`awaiting-archive` は pipeline 完了後ステータスのため resume は実質 no-op または適切なエラーを返す。影響は許容範囲 |
| `cli/ps.ts` (--all) / `cli/job-show.ts` | mid-`--with-merge` job が `awaiting-archive` で表示される。cosmetic のみ |
| `finish/resolve-target.ts` | `includeArchived: true` で呼ばれるが、plain `job archive` の CLI 側は `list(repoRoot)` を使うため影響なし |

**結果**: ✓ 既存 caller の不変条件を破らない

---

### INV-6: plain `job archive`（`--with-merge` なし）の挙動不変

**前提**: plain 経路は記帳時点で `archived` を確定させ、cleanup を呼ばない。

**検証**:
- `archive.ts` CLI は変更なし（D6）。`list(repoRoot)`（includeArchived なし）でジョブを解決。
- `runArchiveOrchestrator` は `deferArchivedTransition` 未指定（default `false`）のとき従来通り `markJobArchived` を呼ぶ。
- D4 は `includeArchived: true` 専用のため plain 経路の list() 動作は不変。
- TC-CA-001 / TC-CF-001 / orchestrator.test.ts の既存テストが plain 経路を固定。

**結果**: ✓ 不変

---

### INV-7: status 集合と遷移表の不変

**前提**: `src/state/lifecycle.ts` の `VALID_TRANSITIONS` と status enum は変更しない（D5）。

**検証**: `lifecycle.ts` は変更差分に含まれない。`awaiting-archive → archived` の既存遷移を timing 変更のみで使用。

**結果**: ✓ 不変

---

## 所見（非ブロッキング）

### C1（LOW）: section 2b の `request.path` injection が archive 位置を指さない

worktree archive scan（section 2b）で `composeSplitLayout` に渡す `{ slug, stateRoot: worktreePath }` の `stateRoot` は worktree root であり、注入される `request.path` が `changeFolderPath(slug)` = `specrunner/changes/<slug>/request.md`（active 位置）を指す。実際のファイルは `specrunner/changes/archive/<dated-slug>/request.md` に移動済みのため、このパスは存在しない。

影響範囲:
- `getJobSlug` の第一優先は `state.request.slug`（`if (!reqObj["slug"])` で正しく inject される）なのでスラッグ解決に影響なし。
- `merge-then-archive.ts` の recovery フローで `request.path` は参照されない。
- `resume` での利用（`resolveRequestPath`）は `awaiting-archive` 状態では実質到達しない。

**結論**: `--with-merge` 回復フローの機能に影響なし。将来 section 2b の sourceChangeDir を stateRoot 注入に使う場合は修正が必要。

### C2（INFO）: 成功 merge 後の main checkout に `awaiting-archive` が残存する

squash merge 後、archive commit に乗った state.json は status `awaiting-archive`（D1 で遅延）。D3 の post-merge 遷移は worktree の archive dir に書き込み（cleanup で削除）、main checkout へは到達しない。

結果として `git log --all` やクローンで参照できる merged main の archive folder に `awaiting-archive` が残る。design に明記された既知 trade-off（Open Questions 参照）であり、`ps`（非 `--all`）は archive を走査しないため通常運用への影響なし。`ps --all` での cosmetic な不一致のみ。

---

## 結論

- 3 つのコア不変条件（terminal-status 短絡 / crash-resume-vs-order-error 区別 / post-merge 遷移の全経路）はいずれも保たれている。
- `includeArchived` ゲートが既存 caller の境界を守っている。
- orphan 検出との相互作用は旧コードより安全（D4 の正の副作用）。
- C1（request.path 注入ズレ）と C2（merged main のステータス残存）は設計上の既知 trade-off または機能上無影響な cosmetic 問題。
