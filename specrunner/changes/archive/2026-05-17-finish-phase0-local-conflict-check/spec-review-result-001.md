# Spec Review Result: finish-phase0-local-conflict-check

- **reviewer**: spec-reviewer
- **date**: 2026-05-16
- **verdict**: approved

## Summary

request.md / design.md / tasks.md / delta spec の4点を baseline spec および実装コード (orchestrator.ts, preflight.ts, spawn.ts, types.ts, escalation.ts) と照合した。仕様は内部整合しており、実装可能。

## Findings

### 1. Interface signature: request.md → tasks.md の deviation (severity: low, non-blocking)

request.md は `runLocalConflictCheck(deps: { baseBranch, spawn, stdout, stderr })` と記述するが、tasks.md は `{ baseBranch, cwd, spawn }` に簡略化。`stdout`/`stderr` コールバックを削除し `cwd` を追加している。

**判定: 改善。** `SpawnFn` は `SpawnOptions.cwd` を必要とし、結果は `SpawnResult.{stdout,stderr}` で取得できるため、呼び出し側に stdout/stderr コールバックは不要。codebase の他の finish module (archive-change-folder.ts, move-requests-dir.ts) も同パターン。tasks.md が正。

### 2. dry-run 時の check #8 スキップ (severity: info)

request.md は dry-run と check #8 の関係を明示していないが、delta spec と tasks.md は `--dry-run` 時にスキップと規定。orchestrator.ts の構造上、dry-run plan 出力 (L116-119) の前に挿入し `!flags.dryRun` でガードする設計。

**判定: 妥当。** check #8 は Phase 1 commit の gate であり、dry-run は Phase 1 を実行しない。dry-run plan に conflict 状態を含めない点は将来の拡張余地として残るが、現 scope では合理的。

### 3. `git merge-tree --write-tree` の conflict 検出精度 (severity: info)

`git merge-tree` は二つの branch tip の three-way merge を計算する。`git rebase` 中の intermediate commit conflict は検出できない可能性がある。ただし GitHub の `mergeStateStatus` / `mergeable` も merge ベースの判定であるため、Phase 0 guard としては十分。escalation message が `git rebase` を案内するので、rebase 固有の conflict はそこでユーザーが発見する。

### 4. delta spec の check table 整合性 (severity: ok)

baseline spec check #1-7 をそのまま引き継ぎ、check #8 を追記。check #8 の条件 (MERGED skip, dry-run skip) も明記。4 scenario (conflict 検出, fetch 失敗, 通過, 再実行可能) が request.md の受け入れ基準を網羅。

### 5. orchestrator 挿入位置の正確性 (severity: ok)

tasks.md は L112-113 (preflight result) と L116 (dry-run check) の間に挿入を指定。既存コードと照合:
- L112: `if (!preflightResult.ok) return` 
- L113: `const { prViewData } = preflightResult;`
- L116: `if (flags.dryRun)`

挿入位置は正確。`prViewData.state !== "MERGED"` ガードにより resume path との干渉もない。

### 6. state 変更なし + 再実行可能性 (severity: ok)

conflict 検出時は `{ exitCode: 1, escalation }` を return するのみ。`markJobArchived` / `transitionJob` を呼ばない。`assertJobFinishable` (job-state-update.ts) は terminal status のみ block するため、rebase 後の再 finish は block されない。既存 Phase 0 escalation パターンと完全に同一。

### 7. fetch 失敗のエラーハンドリング (severity: ok)

tasks.md は `runLocalConflictCheck` 内で throw → orchestrator 側で try/catch → escalation return を規定。`spawnCommand` (spawn.ts) は non-zero exit でも throw しないが、tasks.md Task 1 step 1 で "non-zero exit → throw" を明示。実装者が手動で throw する必要がある点は tasks.md に記載済み。

### 8. test coverage (severity: ok)

- Unit tests (5 TC): ok/conflict/fetch-fail/empty-paths/multi-path
- Integration tests (6 TC): conflict→no-phase1, pass→proceed, fetch-fail, recovery-message, re-runnable, regression-free
- request.md の受け入れ基準 11 項目を全てカバー

### 9. Security (severity: ok)

- `baseBranch` は CLI 入力 → request.md parse → orchestrator 経由。`spawn()` は `shell: false` (spawn.ts L42) なので shell injection なし
- `git fetch` / `git merge-tree` は read-only 操作（worktree を変更しない）
- 新規の認証経路・secret 処理・外部 API 呼び出しなし
- OWASP Top 10 該当項目なし

## Verdict Rationale

- request.md の問題定義が具体的で再現可能 (PR #266/#267)
- 解決策 (git merge-tree) は deterministic かつ既存 git version 前提と整合
- Phase 0 内の挿入位置、state 変更なし、既存ロジック非破壊が正確に設計されている
- delta spec が baseline spec の既存 Requirement を正しく拡張
- scope boundary が明確 (#257 atomicity, #247 gh CLI 脱却との分離)
- security concern なし
- blocking issue なし → **approved**
