# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### J-1: tasks.md — チェックボックス完了確認

T-01 〜 T-04 の全タスクが `[x]` で完了。未完了項目なし。

### J-2: spec.md — 全 Requirement / Scenario のテストカバレッジ

| Requirement | Scenario | Test |
|---|---|---|
| archive はフラット形式 draft を repo 本体から削除する | フラット形式 draft が untracked で存在する場合 | TC-001 ✅ |
| archive はディレクトリ形式 draft を repo 本体から削除する | ディレクトリ形式 draft が untracked で存在する場合 | TC-002 ✅ |
| 両形式とも存在しない場合 archive は無音で続行する | draft が一切存在しない場合 | TC-003 ✅ |
| tracked な draft は削除せず警告を出す | tracked なフラット形式 draft が存在する場合 | TC-004 ✅ |
| tracked な draft は削除せず警告を出す | tracked なディレクトリ形式 draft が存在する場合 | TC-005 ✅ |
| フラット形式とディレクトリ形式が同時に存在する場合、両方を削除する | 両形式同時存在の場合 | TC-006 ✅ |

spec.md の全 5 Requirement (6 Scenarios) が TC-001〜TC-006 でカバーされている。

### J-3: design.md — 実装が設計決定に準拠しているか

| Decision | 確認内容 |
|---|---|
| D1: 削除先を `cwd`(repo 本体) に変更 | `orchestrator.ts:264-265` が `nodePath.join(cwd, draftsDir(), …)` を使用。worktree/recordDir 基準の削除なし ✅ |
| D2: フラット・ディレクトリ両形式を削除 | for ループで `slug + ".md"` → `slug` の順に処理。`fs.exists` で事前確認 ✅ |
| D3: tracked draft は削除せず警告 | `git ls-files -- relPath` を `{ cwd }` で実行し stdout 非空なら `stderrWrite` + `continue` ✅ |
| D4: worktree 側削除・staging を削除 | 旧 `recordDir` 基準 `fs.rm` (旧 lines 260–265) と `git add draftsDir` + `archivePathspecs.push` (旧 lines 272–284) の両ブロックが削除済み ✅ |
| D5: `FinishFs` / `ArchiveInput` は変更しない | 両インターフェース変更なし ✅ |

D4 影響テスト (T-01, T-08, T-09) の更新内容は design.md に列挙・根拠明示あり。tasks.md T-02 で追跡・完了。

### J-4: request.md — 受け入れ基準

| 受け入れ基準 | 状態 |
|---|---|
| repo 本体フラット形式 draft 削除をテストで固定 | TC-001 ✅ |
| repo 本体ディレクトリ形式 draft 削除をテストで固定 | TC-002 ✅ |
| 両形式とも不在時に archive 失敗せず警告なしをテストで固定 | TC-003 ✅ |
| tracked draft は削除せず警告が出ることをテストで固定 | TC-004 / TC-005 ✅ |
| 既存テストが green（変更対象は design D4 に列挙・根拠明示） | T-01/T-08/T-09 更新済み、他無変更、全 green ✅ |
| `typecheck && test` が green | build / typecheck / test 全 phase passed ✅ |

### Verification result (参照)

```
Verdict: passed
build:      passed (exit 0)
typecheck:  passed (exit 0)
test:       passed — 762 test files, 11394 passed
lint:       passed (exit 0)
```

## 検証できなかった項目

None。すべての項目をコードおよびテストファイルで直接確認した。

## Findings 詳細

非ブロッキングの観察事項のみ:

- TC-007 (worktree-side `fs.rm` が呼ばれない) と TC-008 (worktree-side `git add specrunner/drafts` が呼ばれない) は test-cases.md で "should" 優先度かつ request.md の受け入れ基準外。実装から該当コードは物理削除されており実行不可能だが、ネガティブアサーションテストは未追加。非ブロッキング。
