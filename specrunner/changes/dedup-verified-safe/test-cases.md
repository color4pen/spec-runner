# Test Cases: dedup-verified-safe

## Summary

- **Total**: 17 cases
- **Automated** (unit/integration): 9
- **Manual**: 0
- **Priority**: must: 11, should: 5, could: 1

---

### TC-001: Same slug input produces identical runtime behavior

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: run and job-start commands produce identical runtime behavior > Scenario: same slug input produces same behavior

---

### TC-002: Help output preserves positional labels

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: run and job-start commands produce identical runtime behavior > Scenario: help output preserves positional labels

---

### TC-003: Command path skip string is preserved byte-for-byte

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: verification skip strings are preserved byte-for-byte > Scenario: command path skip string

---

### TC-004: Phase path skip string is preserved byte-for-byte

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: verification skip strings are preserved byte-for-byte > Scenario: phase path skip string

---

### TC-005: Deleted symbols absent from src/ and tests/

**Category**: gate
**Priority**: must
**Source**: spec.md > Requirement: deleted symbols are absent from the codebase > Scenario: grep check

`typecheck` フェーズおよび grep チェックコマンドで充足する。対象シンボル: `computeCodeReviewIteration`, `computeSpecReviewIteration`, `computeRequestReviewIteration`, `computeConformanceIteration`, `PROBE_SLUG`（`VALIDATOR_PROBE_SLUG` のサブストリングとしての出現は除外）。

---

### TC-006: typecheck && test が全て green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-09: Final verification

`bun run typecheck` および `bun run test` フェーズで充足する。test ファイルへの変更が 0 件であることを `git diff --name-only tests/` で確認する。

---

### TC-007: loadConfig は両設定ファイル不在時に CONFIG_MISSING を throw する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04: Delegate loadConfig to loadConfigWithSourceMetadata

**GIVEN** `repoRoot` の下に `specrunner.config.json`（プロジェクトローカル）も `~/.specrunner/config.json`（ユーザーグローバル）も存在しない
**WHEN** `loadConfig(repoRoot)` を呼ぶ
**THEN** `ConfigMissingError`（`CONFIG_MISSING` コード）が throw される（委譲先 `loadConfigWithSourceMetadata` が同条件で同エラーを throw するため挙動は変わらない）

---

### TC-008: detectPackageManager の lockfile 優先順と停止条件が変更前と同一

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05: Replace detectPackageManager phase-1 with findLockfile

**GIVEN** `cwd` から fs root に向かうディレクトリ木に複数の lockfile が存在し、その途中に `.git` ディレクトリがある
**WHEN** `detectPackageManager(cwd, fs)` を呼ぶ
**THEN** `findLockfile` と同じ LOCKFILE_MAP 優先順・`.git` stop・fs root stop で最初に見つかった lockfile の `{ pm, root }` を返す（既存の detect-pm テストが無改変で green であることが検証）

---

### TC-009: appendEventRecord が job-journal.ts に 1 箇所だけ存在する

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-06: Add private _appendRecord in JobJournal

`grep -c 'appendEventRecord' src/store/job-journal.ts` の出力が `1` であることをゲートチェックで確認する。

---

### TC-010: skipLabel テンプレートが現行リテラルと byte-identical な文字列を生成する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08: Extract verification runner tail

**GIVEN** `finalizeVerificationRun` が `skipLabel: "command"` で呼ばれる
**WHEN** 前のコマンドが失敗した後続フェーズのスキップ文言を生成する
**THEN** 生成文字列は `_(skipped — previous command failed)_` と byte-identical

**GIVEN** `finalizeVerificationRun` が `skipLabel: "phase"` で呼ばれる
**WHEN** 前のフェーズが失敗した後続フェーズのスキップ文言を生成する
**THEN** 生成文字列は `_(skipped — previous phase failed)_` と byte-identical

---

### TC-011: run と job start のハンドラが同一関数参照である

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03: Unify run / job-start handler

**GIVEN** `command-registry.ts` の registry 定義
**WHEN** `run` エントリと `job.subcommands.start` エントリの `.handler` プロパティを参照する
**THEN** 両者が同一の関数オブジェクト（`runJobHandler`）を指している

---

### TC-012: PROBE_SLUG エイリアスが src/ と tests/ に存在しない

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-02: Remove dead code

`grep -rn '\bPROBE_SLUG\b' src/ tests/` でマッチ 0 件であることをゲートチェックで確認する（`VALIDATOR_PROBE_SLUG` へのリネームが完了している）。

---

### TC-013: 名前付き journal メソッドが引き続き public API に存在する

**Category**: unit
**Priority**: should
**Source**: design.md > D5: journal append consolidation

**GIVEN** `JobJournal` インスタンス
**WHEN** `appendInterruption`, `appendLineage`, `appendOperatorEvent`, `appendFindingRecency` を呼ぶ
**THEN** 各メソッドが存在し、それぞれの元の型シグネチャで受け付け、`appendEventRecord` を通じてイベントを書き込む（`artifact-observability.test.ts` および `signal-handler-order.test.ts` が無改変で green）

---

### TC-014: liveness worktreePath 解決ブロックが core/resume/resolve-worktree-path.ts の 1 箇所だけに存在する

**Category**: gate
**Priority**: should
**Source**: tasks.md > T-07: Extract worktreePath resolution helper

`src/core/resume/resolve-worktree-path.ts` が存在し、`resume.ts` と `reopen.ts` がそれをインポートして `resolveLivenessWorktreePath` を呼んでいることを grep で確認する。元の block が両ファイルから削除されていることも確認する。

---

### TC-015: 空 if ブロックが job-state-projection.ts から削除されている

**Category**: gate
**Priority**: should
**Source**: tasks.md > T-02: Remove dead code

`grep 'Counters are stale' src/store/job-state-projection.ts` でマッチ 0 件であることをゲートチェックで確認する。

---

### TC-016: identity enrichContext が spec-review.ts から削除されている（意図的残置）

**Category**: gate
**Priority**: should
**Source**: tasks.md > T-02: Remove dead code

> **注記（意図的残置）**: `enrichContext` は削除されておらず `src/core/step/spec-review.ts:93` に残置されている。
> 既存テスト（`tests/prompts/spec-review-system.test.ts` の TC-003/TC-010、`tests/pipeline-integration.test.ts:1239-1246`）が `typeof SpecReviewStep.enrichContext === 'function'` を assert しており、削除には既存テストの改変が必要になる。受け入れ基準「既存テスト無改変で green」を優先して残置した。
> grep 0 件は期待しない。

---

### TC-017: loadConfig の本体が単一 return 文になっている

**Category**: gate
**Priority**: could
**Source**: tasks.md > T-04: Delegate loadConfig to loadConfigWithSourceMetadata

`src/config/store.ts` の `loadConfig` 関数本体が `return (await loadConfigWithSourceMetadata(repoRoot)).config;` の 1 行のみからなることを静的確認する（旧来の read→migrate→merge→validate 連鎖が削除されている）。

---

## Result

```yaml
result: completed
total: 17
automated: 9
manual: 0
must: 11
should: 5
could: 1
blocked_reasons: []
```
