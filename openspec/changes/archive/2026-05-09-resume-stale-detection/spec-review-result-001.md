# Spec Review Result — resume-stale-detection

- **iteration**: 1
- **verdict**: approved
- **reviewer**: spec-reviewer
- **date**: 2026-05-09

## Summary

仕様は request.md の全要件を網羅し、既存コードベースとの整合性が高い。proposal → design → tasks の論理的一貫性に問題なし。行番号参照、型定義、遷移ルールの記述はすべて実コードと一致。セキュリティ上の懸念なし。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | consistency | tasks.md:159 | Task 4.2 の `CleanupHandle` 構築が `{ __signalCleanup } as unknown as CleanupHandle` で、LocalRuntime の `makeHandle()`/`getInternals()` パターンと異なる。ManagedRuntime は内部が少ないため実害はないが、将来の保守時に混乱する可能性 | 実装時に ManagedRuntime 用の `makeHandle`/`getInternals` 相当ヘルパーを追加するか、現行の inline cast で割り切るか判断する |
| 2 | LOW | completeness | tasks.md | `--force` が `awaiting-merge` → `running` の override に使えなくなる（`canTransition` が拒否）。現行は `--force` で任意 status から resume 可能だったが、`awaiting-merge` からの resume は実務上不正な操作のため、この変更は正しい。ただし明示的な記載がない | design.md の D4 Rationale に `awaiting-merge` からの resume 不可を一文追記すると、意図の記録として明確になる |

## Completeness Check

| 要件 | 対応タスク | 充足 |
|------|-----------|------|
| `JobState` schema に `pid` フィールド追加 | 1.1 | ✅ |
| `running` 遷移時に `pid` 記録 | 1.2, 3.5 | ✅ |
| orphaned `running` から resume 回復 | 2.1, 2.2, 3.4 | ✅ |
| ManagedRuntime SIGINT → `awaiting-resume` | 4.1-4.4 | ✅ |
| `failed`/`terminated` の resume 許可 | 3.4 (`canTransition`) | ✅ |
| stale detection ユニットテスト | 6.1, 6.2 | ✅ |
| シグナルハンドラテスト | 6.3 | ✅ |
| `bun run typecheck && bun run test` green | 6.5 | ✅ |

## Consistency Check

- **proposal ↔ design**: Goals/Non-Goals が一致。design の Decisions は proposal の変更内容を具体化しており逸脱なし
- **design ↔ tasks**: 全 Decisions (D1-D7) がタスクに反映されている
- **tasks ↔ codebase**: 参照先の行番号・import パス・型名・関数シグネチャが実コードと一致
- **VALID_TRANSITIONS との整合**: `failed` → `running`、`terminated` → `running` は lifecycle.ts で許可済み。`canTransition` 置換で自然に動作する
- **後方互換**: `pid` は optional フィールド。既存 state ファイルは `updatedAt` フォールバックで処理される

## Security Assessment

- `process.kill(pid, 0)` は POSIX 標準のプロセス存在確認。シグナルは送信されない
- EPERM（権限不足）は alive として扱い、他ユーザーの PID を stale と誤判定しない
- `pid` は `process.pid`（自プロセス）からのみ記録され、外部入力ではない
- state ファイルは XDG ユーザーディレクトリに保存され、アクセス制御は OS レベル
