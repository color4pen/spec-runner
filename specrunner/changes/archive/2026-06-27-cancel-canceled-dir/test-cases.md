# Test Cases: cancel 時にジョブを canceled/<slug>-<jobId8>/ へ退避する

## Summary

- **Total**: 20 cases
- **Automated** (unit/integration): 20
- **Manual**: 0
- **Priority**: must: 10, should: 10, could: 0

---

### TC-001: worktree-only state の job を cancel すると退避先に USER_CANCELED が残る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: cancel は change-folder を canceled/\<slug>-\<jobId8>/ へ退避し、worktree 撤去後も記録を残す > Scenario: worktree-only state の job を cancel すると退避先に USER_CANCELED が残る

---

### TC-002: 記録は worktree 撤去の後も残る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: cancel は change-folder を canceled/\<slug>-\<jobId8>/ へ退避し、worktree 撤去後も記録を残す > Scenario: 記録は worktree 撤去の後も残る

---

### TC-003: 同名 slug を複数回 cancel しても衝突しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 退避先ディレクトリ名は jobId で一意化される > Scenario: 同名 slug を複数回 cancel しても衝突しない

---

### TC-004: --no-worktree モードで元の canonical が残らない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: cancel は退避を move（copy でなく）で行い、元の change-folder を残さない > Scenario: --no-worktree モードで元の canonical が残らない

---

### TC-005: 退避済み job は job ls に active として現れない

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: cancel は退避を move（copy でなく）で行い、元の change-folder を残さない > Scenario: 退避済み job は job ls に active として現れない

---

### TC-006: canceled/ 配下は active 一覧に含まれない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: active スキャンは canceled/ を除外する > Scenario: canceled/ 配下は active 一覧に含まれない

---

### TC-007: cancel 後に worktree と branch が削除される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: cancel は片付け（worktree 撤去 + local/remote branch 削除）を維持する > Scenario: cancel 後に worktree と branch が削除される

---

### TC-008: request.md が canceled/ に残る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: request.md は canceled/ に保全される > Scenario: request.md が canceled/ に残る

---

### TC-009: --restore-draft で drafts に復元される

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: --restore-draft は存置される > Scenario: --restore-draft で drafts に復元される

---

### TC-010: --restore-draft なしでは drafts を触らない

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: --restore-draft は存置される > Scenario: --restore-draft なしでは drafts を触らない

---

### TC-011: canceledChangesDirRel() が正しいパスを返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01: canceled/ ディレクトリのパスヘルパーを追加

**GIVEN** `canceledChangesDirRel()` が `src/util/paths.ts` に定義されている
**WHEN** `canceledChangesDirRel()` を呼ぶ
**THEN** `"specrunner/changes/canceled"` を返す

---

### TC-012: canceledChangeFolderPath() が slug-jobId8 を末尾に付けた正しいパスを返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01: canceled/ ディレクトリのパスヘルパーを追加

**GIVEN** `canceledChangeFolderPath` が `src/util/paths.ts` に定義されている
**WHEN** `canceledChangeFolderPath("my-change-12345678")` を呼ぶ
**THEN** `"specrunner/changes/canceled/my-change-12345678"` を返す

---

### TC-013: paths.ts が src/ 内の他モジュールを import していない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01: canceled/ ディレクトリのパスヘルパーを追加（TC-034 制約）

**GIVEN** `src/util/paths.ts` が編集されている
**WHEN** paths.ts の import 宣言を検査する
**THEN** `src/` 配下の他モジュールへの import が存在しない（`slice` 等の純粋処理のみを含む）

---

### TC-014: --purge でも退避先 tombstone が作成される

**Category**: unit
**Priority**: should
**Source**: design.md > D9: 退避・persist は best-effort、ただし正常系で記録残存を保証

**GIVEN** cancellable な job
**WHEN** `specrunner job cancel <jobId> --purge` を実行する
**THEN** `canceled/<slug>-<jobId8>/state.json` に status=canceled / error.code=USER_CANCELED / canceledAt が記録され、機械ローカル sidecar（`.specrunner/local/<slug>/`）のみが追加削除される

---

### TC-015: 元 files が両方不在の degraded モードでも tombstone が作成される

**Category**: unit
**Priority**: should
**Source**: design.md > D7: 退避元 change-folder の解決（worktree / no-worktree 両対応）; D6: 退避先へ persist は changeDir 直指定の JobStateStore で行う

**GIVEN** worktree 内の `changes/<slug>/state.json` も canonical の `changes/<slug>/state.json` も存在しない job（degraded 状態）
**WHEN** `specrunner job cancel <jobId>` を実行する
**THEN** `canceled/<slug>-<jobId8>/` ディレクトリが作成され、in-memory state から tombstone（status=canceled）が fresh write され、cancel が warning 付きで exit 0 で完了する

---

### TC-016: 退避中の IO 例外は warning を積んで cancel を継続する

**Category**: unit
**Priority**: should
**Source**: design.md > D9: 退避・persist は best-effort、ただし正常系で記録残存を保証

**GIVEN** `fs.cp` が IO エラーをスローするようにモックした cancellable な job
**WHEN** `specrunner job cancel <jobId>` を実行する
**THEN** cancel は exit code を変えずに完了し、warnings リストに IO エラーに関するメッセージが含まれ、後続の cleanup（worktree 撤去 + branch 削除）が実行される

---

### TC-017: 退避・persist は cleanup（worktree 撤去・branch 削除）より前に完了する

**Category**: unit
**Priority**: must
**Source**: design.md > D1: 退避を worktree 撤去の前に行い、退避先へ persist する（順序の反転で記録喪失を解消）

**GIVEN** worktree と branch を持つ cancellable な job
**WHEN** `specrunner job cancel <jobId>` を実行する
**THEN** `evacuateChangeFolder` の呼び出し（および退避先への persist）が `cleanupJobResources`（worktree 撤去・branch 削除）の呼び出しより前に発生する（呼び出し順序のアサート）

---

### TC-018: 既に canceled な job を再 cancel しても退避先に state が残る（idempotent）

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 > 既存「canceled status (idempotent)」テストを新挙動へ更新する

**GIVEN** status が既に `canceled` の job（`canceled/<slug>-<jobId8>/` に state が存在）
**WHEN** `specrunner job cancel <jobId>` を再実行する
**THEN** 再 transition は行われず loaded state がそのまま使われ、`canceled/<slug>-<jobId8>/state.json` は変更前の状態を維持したまま cancel が完了する

---

### TC-019: worktree モードで cancel 後、退避元 worktree 内の change-folder が消える

**Category**: unit
**Priority**: should
**Source**: design.md > D2: 退避は move（copy + 元削除）。copy のみは却下

**GIVEN** worktree モードで実行され、state が `<worktreePath>/specrunner/changes/<slug>/` にある job
**WHEN** `specrunner job cancel <jobId>` を実行する
**THEN** 退避先 `canceled/<slug>-<jobId8>/` に change-folder が存在し、worktree 撤去（または退避時の元削除）により元の `<worktreePath>/specrunner/changes/<slug>/` が残らない

---

### TC-020: JobStateStore.list() セクション2（worktree 内走査）でも canceled/ を除外する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02: list() / canonical resolver で canceled/ を active から除外（セクション2の防御的追加）

**GIVEN** worktree 内の `specrunner/changes/canceled/<slug>-<jobId8>/state.json` が存在する
**WHEN** `JobStateStore.list()`（includeArchived 指定なし）を呼ぶ
**THEN** worktree 内走査セクションでも `canceled` エントリが skip され、返される active 一覧にその state は含まれない

---

## Result

```yaml
result: completed
total: 20
automated: 20
manual: 0
must: 10
should: 10
could: 0
blocked_reasons: []
```
