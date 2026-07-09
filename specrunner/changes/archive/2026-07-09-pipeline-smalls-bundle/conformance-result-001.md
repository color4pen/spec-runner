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
| tasks.md | ✓ | 全チェックボックス [x]、typecheck && test 全フェーズ green |
| design.md | ✓ | D1〜D4 すべて実装済み（D4 の軽微な差異は許容範囲内） |
| spec.md | ✓ | 4 Requirement / 12 Scenario すべてテストでカバー |
| request.md | ✓ | 受け入れ基準 7 項目すべて充足 |

---

## 詳細

### tasks.md — 全タスク完了

T-01 〜 T-08 の全チェックボックスが `[x]`。verification-result.md で build / typecheck / test / lint / changed-line-coverage 全フェーズ passed を確認。

### design.md — 設計判断 D1〜D4 の実装確認

**D1: build-fixer step 4 を lcov 変更行 gate 手順に差し替え**

`src/prompts/build-fixer-system.ts` の `## 修正手順` step 4 が以下を含む:
- `verification-result.md` の `## Phase: test-coverage` 参照、未実行変更行（file:line）と実行率の確認
- 「その行を実際に実行する実テストを追加する」が唯一の正当な修正
- dead code / dead export 追加禁止
- 「正当な修正で解消できない場合は失敗のまま終える」明記

旧テキスト（`"missing TC ID"`、`"test-cases.md"`、`"TC ID を必ず記載"`）は存在しない。合致。

**D2: code-fixer 禁止事項に coverage gate 回避禁止を追記**

`src/prompts/code-fixer-system.ts` の `### 禁止事項` に「coverage gate の回避: 既存テストの削除・移設 / カバレッジ目的の dead code / dead export の追加 / coverage 設定（include / exclude / threshold）の編集」を追加。合致。

**D3: exit-guard 3 経路で `patch.resumePoint` を条件付き追加**

`src/core/lifecycle/exit-guard.ts` の `handleNoWorktreeExit` / `handlePerJobExit` / `handleGlobalExit` の全 3 箇所に同一パターン:

```ts
...(state.step
  ? { patch: { resumePoint: { step: state.step, reason: "signal", iterationsExhausted: 0 } } }
  : {})
```

executor.ts の timeout パスと同形式。合致。

**D4: view コマンドに `detectSpecrunnerWorktree` + `worktreeGuardError` を流用**

`runPs` / `runJobStats` / `runJobShow` の各エントリーで `JobStateStore.list` 呼び出し前に worktree guard ブロックを挿入。exit code 2 / stderr / `Hint:` メッセージは `job resume` 既存ガードと整合。

軽微な差異: D4 コメントでは `runPs` の guard に `process.cwd()` を使うと記述されているが、実装では `resolveRepoRoot() ?? process.cwd()` から得た `repoRoot` を渡している。production では `opts.repoRoot` は設定されないため動作は等価。テストでは `detectSpecrunnerWorktree` をモックするため影響なし。許容範囲内。合致。

### spec.md — Requirements / Scenarios 確認

| Requirement | Scenario | テスト | 状態 |
|-------------|----------|--------|------|
| build-fixer が lcov 変更行 gate 手順を使う | test-coverage failed 時の手順に変更行記載 | coverage-gate-prohibition.test.ts | ✓ |
| | 旧 TC-ID 手順が残っていない | coverage-gate-prohibition.test.ts | ✓ |
| 両 prompt が gate 回避を禁止する | build-fixer prompt に回避禁止規律 | coverage-gate-prohibition.test.ts | ✓ |
| | code-fixer prompt に回避禁止規律 | coverage-gate-prohibition.test.ts | ✓ |
| exit-guard が resumePoint を書く | no-worktree 経路 | exit-guard.test.ts | ✓ |
| | per-job 経路 | exit-guard.test.ts | ✓ |
| | global scan 経路 | exit-guard.test.ts | ✓ |
| | step が空の job は resumePoint なし | exit-guard.test.ts | ✓ |
| view コマンドが worktree cwd で明示エラー | job ls → exit 2 | view-commands-worktree-guard.test.ts | ✓ |
| | job stats → exit 2 | view-commands-worktree-guard.test.ts | ✓ |
| | job show → exit 2 | view-commands-worktree-guard.test.ts | ✓ |
| | main checkout では正常動作 | view-commands-worktree-guard.test.ts | ✓ |

### request.md — 受け入れ基準確認

| 基準 | 状態 |
|------|------|
| build-fixer prompt に lcov 変更行 gate 手順があり旧 TC-ID 手順が残っていないことをテストで固定 | ✓ |
| build-fixer / code-fixer 両 prompt に gate 回避禁止規律があることをテストで固定 | ✓ |
| exit-guard 3 経路で `resumePoint(step=中断時 step, reason="signal")` が書かれることをテストで固定 | ✓ |
| `state.step` が falsy の場合は resumePoint なしで遷移することをテストで固定 | ✓ |
| worktree cwd からの job ls / job stats / job show が state scan 前に明示エラーになることをテストで固定 | ✓ |
| main checkout cwd からの各 view コマンドは従来どおり動作する（既存テスト無変更で green） | ✓ |
| `typecheck && test` が green | ✓ |

### スコープ外の変更がないことの確認

- `ResumePoint` schema の変更: なし ✓
- `JobStateStore.list` の ENOTDIR 握り潰し: なし ✓
- view 系以外のコマンドへの cwd 検証追加: なし ✓
- prompt 全体の再構成: なし（手順と禁止規律の局所変更のみ）✓
- codex adapter の変更: なし ✓
