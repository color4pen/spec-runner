# Conformance Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✅ | 全チェックボックス [x] 完了、各 AC を実装が満たす |
| design.md | ✅ | D1–D9 の全判断が実装と一致（詳細は下記） |
| spec.md | ✅ | 全 Requirements のシナリオをテストが網羅 |
| request.md | ✅ | 全受け入れ基準を実装とテストが満たし、typecheck && test green |

---

## 1. Tasks 完了確認

tasks.md の全チェックボックス（T-01〜T-05）が `[x]` で完了済み。

---

## 2. Design 判断 D1–D9 との照合

| 判断 | 内容 | 実装との一致 |
|------|------|-------------|
| D1 | 処理順反転（退避 → persist → cleanup） | ✅ runner.ts `cancelSingleJob` の実装順: kill → restore-draft → `evacuateChangeFolder` → state build → `cancelStore.persist` → `cleanupJobResources` → marker unlink → purge |
| D2 | move（copy + 元削除） | ✅ `fs.cp(srcDir, canceledDirAbs, { recursive: true })` → `fs.rm(srcDir, { recursive: true, force: true })` |
| D3 | 片付け維持（worktree 撤去 + branch 削除） | ✅ `cleanupJobResources` は persist 後に呼ばれ、worktree remove + local/remote branch 削除を実行 |
| D4 | untracked（git mv / commit なし） | ✅ `fs.mkdir` + `fs.cp` + `fs.rm` のみ。`git add` / `git mv` は使用しない |
| D5 | 一意鍵 `<slug>-<jobId8>` | ✅ `const canceledDirName = \`${slug}-${jobId8}\`` |
| D6 | `changeDir` 直指定の `JobStateStore` で persist | ✅ `new JobStateStore(jobId, deps.repoRoot, { changeDir: canceledDirAbs })` — `resolveStateStoreByJobId` を経由しない |
| D7 | 退避元解決順（worktree → canonical → degraded） | ✅ `evacuateChangeFolder` 内で sidecar 経由の worktreePath 確認後 canonical にフォールバック |
| D8 | `list()` から `canceled/` を除外 | ✅ `job-state-store.ts` セクション1（`:225`）とセクション2（`:278`）の両方に `|| entry.name === "canceled"` を追加 |
| D9 | best-effort（try/catch）、purge でも tombstone を残す | ✅ `evacuateChangeFolder` 全体を try/catch で囲み失敗時 warning + null 返却。旧 `if (!purge) persist` 条件は撤廃済み |

---

## 3. Spec Requirements との照合

### R1: cancel は canceled/<slug>-<jobId8>/ へ退避し worktree 撤去後も記録を残す
- **Scenario: worktree-only の job を cancel すると退避先に USER_CANCELED が残る** — ✅ テスト「worktree-only: cancel persists USER_CANCELED record in canceled/ (regression prevention)」が worktree 内 state.json 消失後も `canceled/` に記録が残ることを assert
- **Scenario: 記録は worktree 撤去の後も残る** — ✅ 同テストで worktree の state.json 消失と `canceled/` の存続を確認

### R2: 退避先ディレクトリ名は jobId で一意化される
- **Scenario: 同名 slug を複数回 cancel しても衝突しない** — ✅ テスト「same-slug multiple cancel: no collision in canceled/」で `<slug>-<jobId8a>/` と `<slug>-<jobId8b>/` が独立して存在することを assert

### R3: cancel は move（copy でなく）で元の change-folder を残さない
- **Scenario: --no-worktree モードで元の canonical が残らない** — ✅ テスト「--no-worktree: original changes/<slug>/ removed, state only in canceled/」で canonical が消え `canceled/` にのみ存在することを assert
- **Scenario: 退避済み job は job ls に active として現れない** — ✅ 同テストで `JobStateStore.list()` に active として現れないことを assert

### R4: active スキャンは canceled/ を除外する
- **Scenario: canceled/ 配下は active 一覧に含まれない** — ✅ `list()` の skip 条件に `canceled` を追加済み。--no-worktree テストで動作確認

### R5: cancel は片付けを維持する
- **Scenario: cancel 後に worktree と branch が削除される** — ✅ テスト「cleanup: worktree remove and branch delete performed after cancel」で `worktreeManager.remove`、`git branch -D`、`git push origin --delete` の呼び出しを assert

### R6: request.md は canceled/ に保全される
- **Scenario: request.md が canceled/ に残る** — ✅ テスト「request.md is preserved in canceled/ after cancel」で内容一致を assert

### R7: --restore-draft は存置される
- **Scenario: --restore-draft で drafts に復元される** — ✅ テスト「writes drafts/<slug>/request.md and returns info entry when restoreDraft: true」
- **Scenario: --restore-draft なしでは drafts を触らない** — ✅ テスト「does NOT write draft when restoreDraft: false / omitted」

---

## 4. 受け入れ基準との照合

| 基準 | 対応テスト | 判定 |
|------|-----------|------|
| worktree-only cancel → `canceled/<slug>-<jobId8>/` に USER_CANCELED / canceledAt が残る | "worktree-only regression prevention" | ✅ |
| 同名 slug 複数 cancel → canceled/ で衝突しない | "same-slug multiple cancel: no collision" | ✅ |
| cancel 後 local/remote branch と worktree が削除される | "cleanup: worktree remove and branch delete performed after cancel" | ✅ |
| request.md が `canceled/` に保全される | "request.md is preserved in canceled/ after cancel" | ✅ |
| --no-worktree で `changes/<slug>/` が消え `canceled/` にのみ存在する | "--no-worktree: original changes/<slug>/ removed" | ✅ |
| `typecheck && test` が green | verification-result.md: build/typecheck/test/lint all passed | ✅ |

---

## 5. 補足観察

- **runner-branch-delete.test.ts**: `FAKE_REPO_ROOT = "/repo"` で実 FS 操作不可のため `evacuateChangeFolder` は失敗して warning に落ちる（D9 best-effort）。branch 削除アサートは引き続き維持されており、tasks.md の方針と整合。
- **paths.ts TC-034 制約**: `canceledChangesDirRel` / `canceledChangeFolderPath` の実装が `src/` 内モジュールを import していないことを確認済み。
- **cancelAllTerminated**: 挙動不変。`list()` を介した sidecar 削除のみで evacuate は行わない（仕様どおり）。
- **idempotent cancel（already-canceled）**: 既存テストが更新済みで、退避後 `canceled/` に移り status が `canceled` のまま維持されることを assert。
