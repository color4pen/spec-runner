# Test Cases: finish Phase 1 spec-merge idempotency

## Summary

| ID | Category | Priority | Level | Source |
|----|----------|----------|-------|--------|
| TC-SM-069 | spec-merge / skip | must | unit | AC1, Task 2 |
| TC-SM-068 | spec-merge / regression | must | unit | AC3, Task 3 |
| TC-SM-070-fix | spec-merge / existing test fix | must | unit | AC1, Task 3.5 |
| TC-103-fix | orchestrator / idempotency | must | integration | AC2, Task 4 |
| TC-PHASE1-NOOP | orchestrator / resume | must | integration | AC2 |
| TC-PARSE-ERR | spec-merge / error boundary | must | unit | AC3, AC4 |
| TC-READFILE-NOT-CALLED | spec-merge / skip | should | unit | AC1 |
| TC-MSG-CONTENT | spec-merge / skip message | should | unit | AC1 |

---

## TC-SM-069: mergeSpecsForChange — change folder 不在で skip

- **Category**: spec-merge / skip
- **Priority**: must
- **Level**: unit
- **Source**: AC1, Task 2

### GIVEN
- change folder（`changes/<slug>/`）がファイルシステム上に存在しない
- `fs.exists(changeFolderAbsPath)` が `false` を返す

### WHEN
- `mergeSpecsForChange({ slug, cwd, spawn, fs })` を呼ぶ

### THEN
- `result.ok === true`
- `result.skipped === true`
- `result.message` に `"change folder not found"` が含まれる
- `fs.readFile` が一切呼ばれない（ENOENT を発生させる前に return）

---

## TC-SM-068: mergeSpecsForChange — request.md が存在するが parse 不能なら escalation

- **Category**: spec-merge / regression guard
- **Priority**: must
- **Level**: unit
- **Source**: AC3, Task 3

### GIVEN
- change folder は存在する（`fs.exists` → `true`）
- `request.md` は読み取れるが front matter として無効な内容（YAML parse 不能）

### WHEN
- `mergeSpecsForChange({ slug, cwd, spawn, fs })` を呼ぶ

### THEN
- `result.ok === false`
- `result.escalation` に `"spec-merge (request.md)"` が含まれる
- 従来と同様の escalation パスを通ること（skip されない）

---

## TC-SM-070-fix: TC-SM-070 の specs/-absent skip パスが Task 1 適用後も機能する

- **Category**: spec-merge / existing test compatibility
- **Priority**: must
- **Level**: unit
- **Source**: AC1, Task 3.5

### GIVEN
- change folder は存在する（`fs.exists(changeFolderAbsPath)` → `true`）
- specs/ ディレクトリが存在しない（`fs.exists(specs/)` → `false`）
- `exists` mock がパスによって戻り値を切り替える実装になっている

### WHEN
- `mergeSpecsForChange({ slug, cwd, spawn, fs })` を呼ぶ

### THEN
- TC-SM-069 の「change folder 不在 skip」パスには入らない
- specs/ 不在の skip パス（既存の TC-SM-070 が検証していた挙動）が引き続き正しく動作する

---

## TC-103-fix: TC-103 integration — change folder 不在時に request.md ENOENT を再現

- **Category**: orchestrator / integration mock fidelity
- **Priority**: must
- **Level**: integration
- **Source**: AC2, Task 4

### GIVEN
- `makeStubFs` の `readFile` mock が `changeFolderExists === false` のとき `request.md` への読み取りで ENOENT を返す
- Phase 1 archive 済み状態（`changeFolderExists = false`）

### WHEN
- `runPhase1Archive` を実行する

### THEN
- Task 1 修正前: ENOENT → escalation で Phase 1 が fail する（修正の必要性を確認）
- Task 1 修正後: `mergeSpecsForChange` が `skipped: true` を返し Phase 1 が正常完了する

---

## TC-PHASE1-NOOP: Phase 1 完了済み状態で finish 再実行すると Phase 1 が no-op skip される

- **Category**: orchestrator / idempotency
- **Priority**: must
- **Level**: integration
- **Source**: AC2

### GIVEN
- 1 回目の finish で Phase 1 が完了し change folder が `changes/archive/<date>-<slug>/` に移動済み
- Phase 3 (squash merge) が transient 失敗（`Base branch was modified` 等）で止まっている
- 2 回目の finish を実行しようとしている

### WHEN
- `specrunner finish <job-id>` を再実行する（または orchestrator を直接呼ぶ）

### THEN
- Phase 1: `spec-merge` が `skipped: true` を返す
- Phase 1: `archiveChangeFolder` が `skipped: true` を返す（自前の不在チェックで skip）
- Phase 1: commit が staged changes なしで skip される
- Phase 1 全体が crash せず完了する
- Phase 3 の merge ステップに到達できる

---

## TC-PARSE-ERR: change folder 存在 + request.md parse 失敗 → escalation（不在 skip との区別）

- **Category**: spec-merge / error boundary
- **Priority**: must
- **Level**: unit
- **Source**: AC3, AC4

### GIVEN
- change folder は存在する（`fs.exists(changeFolderAbsPath)` → `true`）
- `request.md` が存在するが内容が壊れている（空 / 不正 YAML）

### WHEN
- `mergeSpecsForChange` を呼ぶ

### THEN
- `result.ok === false`（skip されない）
- 正常な change の変更内容が握り潰されない
- 不在 skip パス（`skipped: true`）には入らない

---

## TC-READFILE-NOT-CALLED: change folder 不在時に readFile が呼ばれない

- **Category**: spec-merge / skip side-effect
- **Priority**: should
- **Level**: unit
- **Source**: AC1

### GIVEN
- change folder が存在しない（`fs.exists` → `false`）
- `readFile` mock は呼ばれたら Error を投げる実装

### WHEN
- `mergeSpecsForChange` を呼ぶ

### THEN
- Error が throw されない（readFile が呼ばれていない）
- `fs.readFile` の呼び出し回数が 0

---

## TC-MSG-CONTENT: skip 時の message フォーマット

- **Category**: spec-merge / skip message
- **Priority**: should
- **Level**: unit
- **Source**: AC1, design.md

### GIVEN
- change folder が存在しない

### WHEN
- `mergeSpecsForChange` を呼ぶ

### THEN
- `result.message === "spec-merge skipped: change folder not found"`（exact match または contains）
- `archiveChangeFolder` の skip message パターンと一貫したフォーマット
