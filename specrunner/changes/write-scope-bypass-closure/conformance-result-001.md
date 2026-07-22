# Conformance Result — write-scope-bypass-closure — iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### J1: Requirements (SHALL / MUST) — spec.md

**Requirement 1: scoped mode の commit は宣言 path + pipeline 管理 path のみを記録する**

- `commit-push.ts` scoped branch: `stagePaths = [...new Set([...filePaths, ...existingManaged])]`
- `commitAndPushTail`: `git commit -m msg -- <stagePaths>` (partial-commit pathspec) — 許可外 index エントリ除外 ✓
- Staged check: `git diff --cached --quiet -- <stagePaths>` — same pathspec scope ✓
- Empty stagePaths: commit スキップ、HEAD-advance detection のみ ✓

**Requirement 2: agent 自己 commit の内容を write-scope 規則で検査する**

- `commitAndPushTail` HEAD-advance 検出: `headAfterStep !== headBeforeStep` → `listCommitRangeChangedPaths`
- enumerate null（git error）→ `commitEffectFailedError`（fail-closed） ✓
- Mode 別規則: scoped → `findScopedCommitViolations`, guarded → `findWriteScopeViolations` ✓
- 違反 → `quarantineViolationEvidence({ base, head })` + `writeScopeViolationError`; push 未呼び出し ✓
- 違反なし → push-only 経路保存 ✓

**Requirement 3: scoped mode の保護正典残余違反は halt する**

- quarantine → stderrWrite → `git clean -f` → `git checkout HEAD` → `throw writeScopeViolationError`
- throw は `commitAndPushTail` 呼び出し前 → commit/push 到達不能 ✓

**Requirement 4: 3 経路の違反は証跡を退避し halt メッセージに退避先を含める**

- `quarantineViolationEvidence` に `range?: { base, head }` 引数追加
- range 指定時: `git diff <base> <head> -- <path>` ✓
- range 未指定: `git diff HEAD -- <path>`（既存挙動保存） ✓
- `writeScopeViolationError(step.name, branch, violations, quarantinePath)` — 退避先を halt メッセージに含む ✓

**Requirement 5: 境界内のみの変更の挙動と commit 内容を現行と同一に保つ**

- Guarded: `git add -A`（pathspec なし）、`git commit -m msg`（pathspec なし） ✓
- Scoped: pathspec 付き commit; commit message 形式 `<step.name>: <slug>` 変更なし ✓
- 違反なし自己 commit → push-only 経路維持 ✓

---

### J2: Scenarios — spec.md

| Scenario | 対応テスト |
|----------|-----------|
| 事前 stage された許可外ファイルが commit に含まれない | TC-001（unit）, TC-023（real-git） |
| staged 判定も pathspec scope で行われる | TC-002（unit） |
| scoped で staging 対象が空のとき index 全体へ fallback しない | TC-003（unit） |
| guarded 自己 commit に保護正典が含まれる → push せず halt | TC-004（unit）, TC-024（real-git） |
| scoped 自己 commit に宣言外 path が含まれる → push せず halt | TC-005（unit） |
| 違反の無い自己 commit は push される | TC-006（unit）, TC-018（commit-push-write-scope） |
| 変更 path の列挙に失敗したら fail-closed | TC-007, TC-021（unit） |
| judge step が request.md を改変 → 復元後に halt | TC-008（unit）, TC-025（real-git） |
| 結果採用が halt により抑止される | TC-009（unit + integration） |
| 自己 commit 違反は commit 差分を退避する | TC-010, TC-018（unit） |
| scoped 残余違反は worktree 差分を退避する | TC-011, TC-019（unit） |
| guarded の境界内 worktree 変更は現行どおり commit + push | TC-012（unit） |
| scoped の境界内変更は宣言 path + 管理 path を現行どおり commit | TC-013（unit） |

全 13 シナリオを確認 ✓

---

### J3: Design Decisions (D1–D7) — design.md

**D1 (検査面拡張)**: `commitAndPush` / `commitAndPushTail` が 3 経路を統一コードパスで網羅 ✓

**D2 (自己 commit は push 停止・巻き戻しなし)**: `throw writeScopeViolationError` のみ。`git reset` なし。enumerate null → fail-closed ✓

**D3 (pathspec commit)**: `git commit -m msg -- <stagePaths>`。staged 判定も同 pathspec。guarded は全 index 維持 ✓

**D4 (scoped 残余 halt 化)**: quarantine + two-step restore の後に throw。fall-through なし ✓

**D5 (単一ソース追加)**: `findScopedCommitViolations` を `write-scope.ts` に追加。`managedPaths` は引数注入。leaf 制約（`src/util/paths.js` のみ import）維持を TC-010, TC-028 が機械確認 ✓

**D6 (quarantine range 対応)**: `quarantineViolationEvidence(..., range?)` 追加。既存呼び出しは range 未指定で挙動保存 ✓

**D7 (tail への scope 文脈受け渡し)**: `CommitTailContext { mode, stagePaths, declaredWritePaths, managedPaths }` を `commitAndPush` で構築し `commitAndPushTail` へ注入 ✓

---

### J4: Acceptance Criteria — request.md

| 受け入れ基準 | 確認手段 |
|------------|---------|
| scoped 事前 stage → commit に含まれない（テスト固定） | TC-001（unit）, TC-023（real-git）, DESTROY コメント記録 |
| scoped/guarded 自己 commit 違反 → WRITE_SCOPE_VIOLATION + push 未実行（テスト固定） | TC-004, TC-005（unit）, TC-024（real-git）, DESTROY コメント |
| 違反なし自己 commit → push（挙動保存テスト固定） | TC-006（unit）, TC-018（commit-push-write-scope） |
| scoped 残余違反 → halt（続行しないテスト固定） | TC-008, TC-009（unit）, TC-025（real-git）, TC-023/quarantine-03（commit-push-write-scope） |
| 3 経路の違反 → quarantine 生成 + halt メッセージに退避先（テスト固定） | TC-010, TC-011, TC-018, TC-019（unit） |
| 修正前挙動に戻すと fail（破壊確認記録） | DESTROY コメント: TC-001（T-04 revert）, TC-004/005/007（T-05 revert）, TC-008/009（T-06 revert）, TC-023/024/025（integration）|
| 既存テストは意図変更（残余 halt 化）の期待更新のみ、他は無改変 green | TC-023/quarantine-03 のみ更新（T-08）。8689 tests passed |
| typecheck && test green | verification-result.md: build/typecheck/test/lint 全フェーズ passed |

全 8 基準を確認 ✓

---

## 検証できなかった項目

None

---

## Findings 詳細

None — ブロッキング所見なし。
