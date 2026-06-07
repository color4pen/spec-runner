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
| tasks.md | ✓ | T-01〜T-12 全 [x] 完了 |
| design.md | ✓ | D1〜D10 全決定が実装に反映されている |
| spec.md | ✓ | 全 Requirement / Scenario がテストでカバーされている |
| request.md | ✓ | 全 8 受け入れ基準を実装 + verification で確認済み |

---

## Scope

28 files changed, 2410 insertions / 32 deletions.  
Source: `src/` 9 files、テスト 2 ファイル（764 行）、change folder artifacts。

---

## Tasks — T-01〜T-12

全タスク `[x]` 完了。未チェック項目なし。

---

## Design Decisions

| Decision | 実装箇所 | 確認 |
|----------|---------|------|
| D1: `--no-worktree` フラグ配線 | `command-registry.ts` / `run.ts` / `resume.ts` / `pipeline-run.ts` / `resume.ts` (command) | ✓ |
| D2: `setupWorkspaceNoWorktree` 分岐 | `local.ts`: run = `git checkout -b`、resume = ブランチ操作なし | ✓ |
| D3: clean 必須 | `git status --porcelain` → 非空で `worktreeDirtyError` throw | ✓ |
| D4: `noWorktree` を portable 永続化 | `JobState.noWorktree?: boolean`、`stateToStateJson` の strip 対象外を確認 | ✓ |
| D5: store を cwd フォールバック対応 | `storeFactory`: `worktreePath ?? cwd`、`slugStoreOpts()`: 同様 | ✓ |
| D6: sidecar worktreePath: null | `writeLivenessSidecar(slug, jobId, null)` | ✓ |
| D7: exit-guard no-worktree 分岐 | `handleNoWorktreeExit`、`CommandRunner.execute` で slug 付き登録 | ✓ |
| D8: archive Phase 2 に `!noWorktree` ガード | `if (worktreePath && !noWorktree)`。convention fallback が非 null を返す可能性に対して明示フラグが正しく吸収している | ✓ |
| D9: resume stale 回復は既存経路に委任 | 追加変更なし。既存 stale 判定で成立 | ✓ |
| D10: worktree モード不変 | `opts?.noWorktree` が falsy なら既存コードパスへ | ✓ |

---

## Spec Requirements & Scenarios

| Requirement | Scenario | テスト | 確認 |
|-------------|---------|--------|------|
| `--no-worktree` フラグ受理 | run / resume | TC-NW-014 | ✓ |
| run: worktree 不作成・`checkout -b` | worktree manager.create 不呼出 | TC-NW-004 | ✓ |
| resume: worktree 不作成・checkout 再利用 | `checkout -b` 不呼出 | TC-NW-005 | ✓ |
| dirty tree → `WORKTREE_DIRTY` 停止 | dirty / clean 両シナリオ | TC-NW-006 | ✓ |
| `noWorktree` が state.json に残る | slug-mode で保持・machine-local strip | TC-NW-016 | ✓ |
| sidecar worktreePath: null | sidecar 内容検証 | TC-NW-007 | ✓ |
| exit-guard cwd state から job 特定 | running → awaiting-resume、非 running 不変 | TC-NW-010, TC-NW-011 | ✓ |
| resume store が sidecar 非依存 | sidecar 不在 fresh checkout で running persist | TC-NW-012, TC-NW-013 | ✓ |
| archive: worktree remove/prune スキップ・branch 削除実施 | remove/prune 不呼出・`git branch -D` 呼出 | TC-NW-012 (archive, 2 件) | ✓ |
| worktree モード不変 | フラグ無しで worktree 作成・regression guard | TC-NW-013 (archive) + 全既存テスト | ✓ |

---

## Acceptance Criteria (request.md)

| 受け入れ基準 | 根拠 |
|-------------|------|
| `run --no-worktree` が worktree を作らず feature branch を作成しパイプラインを実行する | TC-NW-004 |
| `resume --no-worktree` が worktree を作らずパイプラインを再開する | TC-NW-005, TC-NW-012, TC-NW-013 |
| archive が no-worktree job を判別し worktree remove/prune をスキップする | no-worktree-archive.test.ts TC-NW-012 |
| dirty な working tree でエラー停止する | TC-NW-006 |
| archive で worktree remove/prune スキップ・branch 削除実施 | no-worktree-archive.test.ts TC-NW-012 (2 件) |
| プロセス終了 → awaiting-resume 遷移 → resume で再開できる | TC-NW-010 + TC-NW-013 |
| worktree モードの既存テストが全て通る | 289 test files / 3382 tests passed |
| `bun run typecheck && bun run test` が green | verification-result.md: build / typecheck / test / lint 全 passed |

---

## 補足観察

- **resume path の null 判定**: `ResumeCommand.prepare()` は `existingWorktreePath: null` を渡す（sidecar の worktreePath が null 型で string 条件を満たさない）。`opts?.existingWorktreePath === undefined` → false（null ≠ undefined）となり resume path に正しく入る。
- **archive の convention fallback**: `resolveWorktreePathForArchive` の step 3 が no-worktree job でも convention path（非 null）を返しうる。`!noWorktree` ガードがこれを吸収しており D8 の設計意図と一致している。
- **ADR**: request に `adr: true` あり。adr-gen は conformance の後続ステップであり本レビュー対象外。
