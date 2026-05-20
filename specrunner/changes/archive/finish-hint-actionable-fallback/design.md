# Design: finish-hint-actionable-fallback

## Problem

`STATUS_HINTS` の `failed` / `terminated` と `pollTimeoutError` の hint が未実装の `specrunner cancel` を案内しており、ユーザーが dead-end に陥る。

## Solution

hint を既存の `specrunner rm <jobId>` に書き換え、hint 内コマンドの存在を CI で保証するテストを追加する。

## Design Decisions

### D1: hint 文言

- `failed`: `"Run 'specrunner rm <jobId>' to remove the failed job."`
- `terminated`: `"Run 'specrunner rm <jobId>' to remove the terminated job."`
- `pollTimeoutError`: `"Session may still be running on Anthropic side. Use 'specrunner resume' to retry or 'specrunner rm <jobId>' to abort."`

根拠: `specrunner rm` は `ALLOWED_STATUSES = {failed, terminated, archived}` で許可済（`src/core/rm/runner.ts:37`）。

### D2: hint コマンド存在テストの設計

**検査方式**: 正規表現 `/specrunner (\w+)/g` で hint 文字列から verb を抽出し、`COMMANDS` registry（`src/cli/command-registry.ts`）のキーに存在するかを assertion する。

**検査対象**:
1. `STATUS_HINTS`（`src/core/finish/job-state-update.ts`）の全エントリ
2. `pollTimeoutError` を含む、hint 引数で `specrunner <verb>` を含む `errors.ts` の factory 関数群

**テストファイル**: `tests/hint-command-existence.test.ts` — 既存テストファイルに混ぜず、横断検証として独立させる。

**`COMMANDS` の import**: `COMMANDS` は top-level で各 handler の `import()` を含まないため、テストから直接 import 可能。キーの集合（`Object.keys(COMMANDS)`）のみ使用し handler は実行しない。subcommands を持つエントリ（`managed`, `request`）は top-level キーが CLI の第 1 引数として有効なので、top-level キーの存在で判定する。

### D3: 既存テストへの影響

`tests/finish-job-state.test.ts` の `failed` / `terminated` テストは `.toThrow(/failed/)` / `.toThrow(/terminated/)` で `Error.message`（第 3 引数）をマッチしており、hint 変更の影響を受けない。hint 文字列を直接 assert しているテストは現時点で存在しない。

## Files to Change

| File | Change |
|------|--------|
| `src/core/finish/job-state-update.ts` | `STATUS_HINTS` の `failed` / `terminated` 書き換え |
| `src/errors.ts` | `pollTimeoutError` の hint 書き換え |
| `tests/hint-command-existence.test.ts` | 新規テスト追加 |
