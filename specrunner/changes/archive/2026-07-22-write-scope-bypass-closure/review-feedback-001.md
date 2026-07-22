# Code Review Feedback — iteration 001

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 実装ファイル

**`src/core/step/write-scope.ts`**
- `findScopedCommitViolations` が T-01/D5 の通り追加されている。
- 実装: `changedPaths − (declaredWritePaths ∪ managedPaths)` — 仕様と一致。
- leaf module 制約: import は `../../util/paths.js` のみ。TC-010 / TC-028 の architecture invariant を満たす。

**`src/core/step/commit-push.ts`**

*経路 1（index 混入）—  T-04 / D3*
- scoped mode の commit が `git commit -m <msg> -- <stagePaths>` (pathspec 付き) に変更されている。`line 250-252`
- staged 判定も `git diff --cached --quiet -- <stagePaths>` (pathspec 付き) に変更。`line 175-181`
- `stagePaths` が空のとき `hasChanges = false` で commit をスキップし、HEAD 前進検出のみ実行。`line 182-185`
- guarded mode は従来どおり pathspec なし (`git commit -m <msg>`) を維持。`line 253-255`

*経路 2（agent 自己 commit 無検査）— T-05 / D2*
- `commitAndPushTail` の HEAD 前進検出経路で `listCommitRangeChangedPaths` (`git diff --name-only --no-renames base head`) を呼ぶ。`line 200-203`
- 列挙失敗 (null) → `commitEffectFailedError` で fail-closed。`line 203-207`
- scoped: `findScopedCommitViolations` で `declaredWritePaths + managedPaths` 以外を違反判定。`line 214-216`
- guarded: `findWriteScopeViolations` で保護正典パスへの変更を違反判定。`line 217-220`
- 違反あり → `quarantineViolationEvidence(range={base, head})` で commit 差分を退避 → `writeScopeViolationError` throw。push は呼ばない。`line 223-230`
- 違反なし → 既存どおり push。`line 233-238`

*経路 3（残余違反の続行）— T-06 / D4*
- scoped 残余検査で違反を検出した場合、`quarantineViolationEvidence` + stderrWrite + restore (clean/checkout) の後に `writeScopeViolationError` を **throw**。`line 438`
- 旧「続行」パスは除去。`commitAndPushTail` には到達しない。

*証跡退避の一般化 — T-02 / D6*
- `quarantineViolationEvidence` に `range?: { base, head }` 引数を追加。指定時は `git diff base head -- path`、未指定時は `git diff HEAD -- path`。`line 288-332`

*CommitTailContext — T-07 / D7*
- `CommitTailContext` 型で mode / stagePaths / declaredWritePaths / managedPaths を tail に受け渡す。`line 110-123`
- guarded の `ctx.managedPaths = []`（guarded 自己 commit 規則は `findWriteScopeViolations` を使用するため不要）。設計 D2 と整合。

### テストファイル

**`write-scope-bypass-closure.test.ts`** (新規、26 件 unit)
- TC-001〜TC-022 を網羅。`makeGitSpawnFnByArgs` による args マッチング mock で `--cached` と `--name-only` の diff 呼び分けを実現。
- TC-008/009: scoped 残余 halt を検証。
- TC-010: quarantine ファイルに range diff 内容が記録されることを `fs.readdir` + `fs.readFile` で実ファイル検証。

**`write-scope-bypass-closure-integration.test.ts`** (新規、4 件 integration)
- `makeRealGitNoPushSpawnFn` パターン（push のみ intercept、他は実 git）を採用。
- TC-023: `git show --name-only HEAD` で commit tree に `src/secret.ts` が含まれないことを実 git で検証。破壊確認コメントあり。
- TC-024: 自己 commit に request.md が含まれる場合の halt + push 抑止を実 git で検証。
- TC-025: scoped 残余 halt 後に worktree の request.md が HEAD 内容に復元されることを実 git + `fs.readFile` で検証。

**`write-scope-bypass-closure-write-scope.test.ts`** (新規、9 件 unit)
- TC-014〜TC-017: `findScopedCommitViolations` の単体テスト。各境界条件を網羅。

**`commit-push-write-scope.test.ts`** (既存、T-08 更新)
- TC-023 群: 旧「resolves + 続行」→ 新「rejects WRITE_SCOPE_VIOLATION + commit/push 未実行」に期待を更新。
- quarantine-03 (TC-027): 旧「resolves」→ 新「throws + evidence file + stderr note」に更新。
- TC-018 (既存 guarded HEAD 前進): `diff` mock が exit 0 / 空 stdout → range enumerate が `[]` → 違反なし → push。挙動保存を確認。

**`write-scope-invariants.test.ts`** (既存、TC-028 追加)
- TC-028: `findScopedCommitViolations` が write-scope.ts から export されること、commit-push.ts から呼ばれること、leaf module 制約を維持することを静的解析で固定。

### 検証確認

- `typecheck && test`: 全フェーズ passed（verification-result.md: 8689 tests passed | 1 skipped）。
- `changed-line-coverage`: passed。

### 受け入れ基準との照合

| 基準 | 対応テスト | 確認 |
|------|-----------|------|
| scoped 事前 stage → commit に含まれない | TC-001, TC-023(integration) | ✓ |
| 自己 commit 違反 → push なし WRITE_SCOPE_VIOLATION | TC-004, TC-005, TC-024(integration) | ✓ |
| 違反なし自己 commit → push される | TC-006 | ✓ |
| scoped 残余違反 → halt（続行しない） | TC-008, TC-023/quarantine-03(existing), TC-025(integration) | ✓ |
| quarantine + halt message に退避先 | TC-010, TC-011, quarantine-03 | ✓ |
| 修正 revert で該当 TC が fail（破壊確認） | TC-023/024/025 integration のコメント | ✓ |
| 既存テスト意図変更分以外 green | 8689 tests passed | ✓ |
| typecheck && test green | verification-result.md | ✓ |

## 検証できなかった項目

None

## Findings 詳細

### F-001 (LOW): TC-011 第 2 テストの halt アサーションが条件付き

`write-scope-bypass-closure.test.ts:1221-1223` の `halt message contains quarantine file path after T-06` テストは:

```typescript
if (caught) {
  expect(String((caught as Error).message)).toContain("write-scope-violation-");
}
```

`caught` が未定義の場合（実装が throw しない退行）、アサーションが silently スキップされる。T-06 の throw 有無を確定的に保護していない。TC-008 第 4 テストおよび TC-025 integration が同じシナリオで `expect(caught).toBeDefined()` を先行させているため、実質的なカバレッジは維持されている。

### F-002 (LOW): TC-009 の category 分類ミスマッチ

`test-cases.md` では TC-009 を **integration** に分類しているが、実装は `write-scope-bypass-closure.test.ts`（unit / mock spawn）に収録されている。Integration variant は TC-025 で間接的にカバーされる。テスト自体の正確性に問題はない。
