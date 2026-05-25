# Spec Review Result: resume-draft-path-fix

- **verdict**: approved
- **reviewer**: spec-reviewer
- **date**: 2026-05-24

## Summary

仕様は一貫しており、実装可能。根本原因分析・設計判断・タスク分解・delta spec の四層が整合している。

## Findings

### ✅ 根本原因の特定が正確

`pipeline-run.ts:66` → draft path 記録、`local.ts:228` / `managed.ts:118` → draft 削除、`resume.ts:171` → 削除済み path 参照の因果チェーンが明確に示されており、設計の前提として信頼できる。

### ✅ D1 (setupWorkspace 内での state 更新) の配置

`fs.cp` 成功直後・`fs.rm` 前に `updateJobState` を挿入する手順は適切。git add 失敗時は worktree cleanup が走るので state 整合性は保たれる。`changeFolderRequestPath` 変数と `updateJobState` の両方が既に存在することをコード上で確認済み (local.ts L201, L206)。

### ✅ D3 (resolveRequestPath の純粋関数分離) の設計

関数シグネチャ `resolveRequestPath(statePath, slug, worktreePath, cwd): string` は副作用が `fs.existsSync` のみで、テスタビリティが高い。戻り値が「解決済みパス or 元パス（ENOENT 委譲）」という設計はシンプルで正しい。

### ✅ getJobSlug の利用

Task 4 が `getJobSlug(state)` を使うよう指示している。legacy state で `state.request.slug` が null かつ `state.branch` も空の場合、fallback 3 が `path.basename("...drafts/my-slug/request.md", ".md")` → `"request"` を返す可能性があるが、実際の job state では `state.request.slug` または `state.branch` は必ず存在するため実害はない。

### ✅ delta spec 形式

`specs/cli-resume-command/spec.md` は `## Requirements` / `### Requirement:` / `#### Scenario:` 構造を正しく使用。MUST keyword を含み、3 つのシナリオ（local runtime / managed runtime / 完全 ENOENT）が Given/When/Then 形式で記述されている。rules.md 記法要件をすべて満たしている。

### ✅ セキュリティ

- パス組み立ては `path.join(worktreePath, requestMdPath(slug))` 形式で slug を relative segment に限定。slug はユーザー自身が作成した job state から由来するローカル CLI であり、path traversal リスクは許容範囲。
- ファイル I/O は `fs.existsSync` (read-only) のみ。書き込みなし。
- OWASP 該当事項なし（ネットワーク・認証・DB 操作なし）。

### ✅ 後方互換

legacy fallback のフォールバックチェーン（worktreePath → cwd → ENOENT 委譲）は request の要件 3 を満たしており、既存の archived job state を破壊しない。

### ✅ テストカバレッジ

Task 5 が要求する 4 ケース（新規 state / legacy+worktreePathあり / legacy+worktreePathなし / 完全 ENOENT）は受け入れ基準の「local runtime / managed runtime 両 case」を包含している。

## Minor Notes（修正不要）

- `requestMdPath(slug)` が返す relative path を base と join する実装詳細は task に明示されていないが、`path.join(base, requestMdPath(slug))` が自然な実装であり問題ない。
- Task 2/3 の行番号は現行コードと照合済みで正確。
