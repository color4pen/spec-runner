# Design: finish-phase1-commit-restore

## 概要

`runPhase1Archive` の末尾に commit step を復元する。`mergeSpecsForChange` + `archiveChangeFolder` が staging した変更を `git commit -m "chore: archive <slug>"` で確定する。PR #347 で `moveRequestsDir` 関数ごと削除された副次的責務の再導入。

## 設計判断

### D1: 新規 module `src/core/finish/commit-archive.ts`

commit 責務を独立した module に切り出す。理由:

- `archiveChangeFolder` は「git mv + git add」で完結しており、commit を混ぜると SRP 違反
- 既存の `mergeSpecsForChange` / `archiveChangeFolder` と同粒度の step function にする
- テスト時に step 単位で mock / 検証できる

### D2: `fs` 不要、`spawn` のみ依存

commit step は git コマンドのみ実行する。`FinishFs` への依存はない。params は `{ slug, cwd, spawn }` の最小構成。

### D3: staging 検出は `git diff --cached --quiet` の exit code のみ

既存 spec (L85) が明示的に「`git diff --cached --quiet` の exit code で判定、stdout/stderr 文言に依存しない」と規定済み。そのまま従う。

- exit 0 = staging なし → skip (`{ ok: true, skipped: true }`)
- exit 1 = staging あり → commit に進む
- その他 exit code → escalation (git 自体の異常)

### D4: `spawnOrEscalate` は使わない

`git diff --cached --quiet` は exit code 1 が「staging あり」を意味する正常系であり、`spawnOrEscalate` の「exit 0 以外は escalation」というセマンティクスと合わない。raw spawn + 手動分岐の方が意図が明確。

### D5: orchestrator 統合位置

`runPhase1Archive` の `archiveChangeFolder` 呼び出し後、`return { ok: true }` の前に挿入する。既存の error handling パターン (`if (!result.ok) return ...`) と同一。

## 影響範囲

| ファイル | 変更内容 |
|---------|---------|
| `src/core/finish/commit-archive.ts` | **新規** — `commitArchive` 関数 |
| `src/core/finish/orchestrator.ts` | `runPhase1Archive` 末尾に `commitArchive` 呼び出し追加 |
| `tests/finish-commit-archive.test.ts` | **新規** — unit test (staging あり / なし / commit 失敗) |
| `tests/finish-orchestrator.test.ts` | Phase 1 commit step の integration assert 追加 |
| `specrunner/changes/finish-phase1-commit-restore/specs/cli-finish-command/delta.md` | delta spec — Phase 1 commit step の Requirement 追加 |

### 影響しないファイル（調査済）

- `src/core/finish/archive-change-folder.ts` — git mv + git add のみ、commit 責務は持たない
- `src/core/finish/spec-merge.ts` — writeFile + git add のみ、commit 責務は持たない
- `src/core/finish/types.ts` — `FinishFs` 型に変更不要（commit step は fs 不使用）
- `src/core/finish/spawn-helper.ts` — D4 の判断により不使用
