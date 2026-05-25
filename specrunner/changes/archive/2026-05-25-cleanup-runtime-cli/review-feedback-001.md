# Review Feedback: cleanup-runtime-cli

## Summary

3 件の cleanup (drafts 空 dir 残置 / resolveRepoRoot 共通 util / CLI 挙動意図コメント) を 1 PR にまとめた実装。全体的に設計通りに実装されており、build/typecheck/test すべて green。

---

## Findings

### F-01
- **severity**: minor
- **location**: `tests/unit/core/runtime/draft-move.test.ts`
- **description**: テスト名が `TC-DRAFT-001` 〜 `TC-DRAFT-004` に揃えられているが、`test-cases.md` の TC ID は `TC-05` / `TC-06` / `TC-07` / `TC-08` / `TC-09` / `TC-21`。verification-result.md の test-coverage check が「20/20 must TCs covered」と通っているのは、`test-coverage.ts` が `TC-DRAFT-NNN` 形式を別 namespace として認識しているか、もしくは TC-05〜TC-09 を「covered」と判定する別ロジックがあるため。draft-move.test.ts が `TC-05` 等のラベルを一切含まないため、test-cases.md との追跡可能性 (traceability) が断絶している。
- **suggestion**: `describe` 行に `// Covers TC-05, TC-06` 等のコメントを追加するか、TC-DRAFT-NNN を test-cases.md に追記してマッピングを明示する。どちらでもよいが、現状は coverage check が pass しているため機能上の問題はない。

### F-02
- **severity**: minor
- **location**: `tests/unit/core/runtime/managed.test.ts`
- **description**: TC-08 / TC-09 (managed.ts の directory-format draft 削除 / legacy flat-file 親 dir 保護) に相当するテストが `managed.test.ts` に存在しない。`draft-move.test.ts` の `simulateSetupWorkspaceDraftMove` スタブは local.ts / managed.ts 共通のロジックを模倣しているが、managed runtime を直接 instantiate して setupWorkspace を呼ぶテストはない。`TC-MR-005` は `flat-file` パスのみ使用しており、directory-format (`/request.md` suffix) のケースを managed.ts で直接検証していない。
- **suggestion**: `TC-MR-005` に directory-format draft path (ending with `/request.md`) を使ったケースを追加し、slug dir が削除されることを確認する。`draft-move.test.ts` のスタブが共通ロジックを代替しているという判断なら、コメントで明示する。

### F-03
- **severity**: nit
- **location**: `tests/unit/core/runtime/draft-move.test.ts`, L30-60
- **description**: `simulateSetupWorkspaceDraftMove` はスタブ実装であり、`local.ts` / `managed.ts` の実際のコードとは別に保守が必要。実装が変わった際にスタブが追従しない可能性がある。
- **suggestion**: スタブである旨と「local.ts L243-254 / managed.ts L133-144 と同期すること」のコメントを追加する。

### F-04
- **severity**: nit
- **location**: `src/cli/cancel.ts`, L52
- **description**: エラーメッセージが `Error: Failed to resolve git repo root. Ensure you are inside a git repository.` と出力されるが、元の実装は `Error: failed to resolve git repo root: <detail>` という形式で詳細情報を含んでいた。新実装では `resolveRepoRootOrFail` が throw する固定メッセージのみになり、git コマンドの stderr (例: `fatal: not a git repository`) が消える。
- **suggestion**: 現行の挙動で機能的に十分 (エラー原因は明示的) なため変更必須ではないが、デバッグ時の情報量が減ることを認識しておく。

---

## TC Coverage Matrix

| TC ID | Priority | Covered | Location |
|-------|----------|---------|----------|
| TC-01 | must | yes | `repo-root.test.ts` TC-RR-001 |
| TC-02 | must | yes | `repo-root.test.ts` TC-RR-002 |
| TC-03 | must | yes | `repo-root.test.ts` TC-RR-004 |
| TC-04 | must | yes | `repo-root.test.ts` TC-RR-005 |
| TC-05 | must | partial | `draft-move.test.ts` TC-DRAFT-003 (スタブ経由) |
| TC-06 | must | partial | `draft-move.test.ts` TC-DRAFT-004 (スタブ経由) |
| TC-07 | must | no | 複数 slug が共存する状態で一方だけ削除されるテストなし |
| TC-08 | must | no | managed.ts での directory-format 直接テストなし |
| TC-09 | must | partial | `managed.test.ts` TC-MR-005 は flat-file のみ |
| TC-10 | must | static check のみ | cancel.ts が resolveRepoRootOrFail 使用を確認可能 |
| TC-12 | must | yes (static) | import 文の確認で充足 |
| TC-14 | must | yes (static) | import 文の確認で充足 |
| TC-16 | must | yes (static) | import 文の確認で充足 |
| TC-17 | must | yes (static) | cancel.ts L47 コメント確認 |
| TC-18a | must | yes (static) | job-show.ts L24 コメント確認 |
| TC-18b | must | yes (static) | ps.ts L125 コメント確認 |
| TC-19 | must | yes | verification-result.md typecheck passed |
| TC-20 | must | yes | verification-result.md test passed |
| TC-22 | should | yes | `repo-root.test.ts` TC-RR-002 (exitCode:128) |
| TC-21 | should | partial | スタブ内で catch → stderr.write はあるが fs.rm mock による直接テストなし |

---

## Correctness Checks

- **drafts dir 削除ロジック**: `opts.requestFilePath.endsWith("/request.md")` で directory-format を判定し `fs.rm(path.dirname(...), { recursive: true, force: true })` を呼ぶ。local.ts / managed.ts 両方に同一ロジック適用済み。設計 D1 通り。
- **resolveRepoRoot util**: `spawnCommand` を使い、exitCode === 0 のみ成功、例外・非 0 は null 返却。`resolveRepoRootOrFail` は null 時に throw。設計 D2 通り。
- **cancel.ts**: `resolveRepoRootOrFail` import、コメント `// State-modifying command — require valid git repo (fail-fast)` あり。
- **job-show.ts**: private `resolveRepoRoot` 削除、共通 util import、`?? process.cwd()` fallback 維持、コメント `// Read-only command — fallback to cwd if git unavailable` あり。
- **ps.ts**: 同上パターン。`opts.repoRoot ??` の優先も維持。
- **型安全性**: `any` キャストなし。`err as Error` / `err as NodeJS.ErrnoException` はパターンとして適切。
- **エラー伝播**: draft 削除失敗は警告のみで job を継続。repo root 失敗は cancel で exit 1、read-only CLI は cwd fallback。要件通り。

---

- **verdict**: approved
