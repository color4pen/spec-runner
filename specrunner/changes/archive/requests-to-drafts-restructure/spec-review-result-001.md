# Spec Review Result: requests-to-drafts-restructure

- **verdict**: approved
- **date**: 2026-05-20
- **reviewer**: spec-reviewer

---

## Summary

request.md が描いた問題（untracked 残骸バグ・4 経路冗長・active/archived 語彙衝突）は実コードで確認済み。設計判断は一貫しており、delta spec 3 件はすべて仕様として整合している。実装に進んでよい。

---

## Verification of Problem Statement

コードを実際に確認した結果、request.md の問題記述はすべて正確:

- `src/core/request/store.ts`: `ACTIVE_SUBDIR = requests/active`、collision 検出も `active + merged` の 2 経路のみ（`changes/archive` 漏れ）
- `src/core/runtime/local.ts:207`: `fs.cp(requestFilePath, worktreeRequestPath)` — main 側の削除なし
- `src/core/runtime/local.ts:219-233`: change folder へのコピーも存在（2 箇所コピー）
- `src/context/request-patterns.ts:34-39`: `isDirectory()` filter を使っているが `requests/merged/` は flat 形式に移行済みのため全エントリが除外され事実上空配列
- `src/core/finish/orchestrator.ts:271-273`: `moveRequestsDir` 呼び出しが存在し、`requests/active → merged` の git mv を実行

---

## Design Assessment

### 強み

- **D2 (move 化)**: `fs.cp` + `fs.rm` の 2 ステップで untracked 残骸バグを構造的に解消。squash merge の挙動を理解した正確な診断と対策。
- **D3 (archive 一本化)**: `move-requests-dir.ts` を廃止して `changes/archive/` のみに絞ることで経路数が 4→1 に削減。
- **D7 (3 経路 collision)**: `drafts/ + requests/merged/ + changes/archive/` の 3 経路参照で既存 246 件との衝突を継続防止。正しいトレードオフ。
- **D6 (request-patterns)**: `isDirectory()` バグを修正して archive 経路に切り替えることで LLM examples が実際に機能するようになる。副次的な改善として価値が高い。
- **D4 (resolveByAutoDetect 廃止)**: 機能しなくなる auto-detect を素直に廃止し、エラーで返す設計は明快。

### リスク評価 (設計書記載 R1, R2)

- **R1**: `fs.rm` 失敗を非致命的 warning にする設計は開発者向け CLI として妥当。
- **R2**: 同一 slug の二重実行は job state で既に防がれているため影響なし。

---

## Findings

### F1 (Gap): ADR task が tasks.md にない

- request.md の `adr: true` と受け入れ基準に「ADR に...を記録」とあるが、tasks.md には ADR ファイル作成タスクが存在しない。
- 実装者が ADR 作成を見落とすリスクがある。
- **重大度**: 低（仕様の不整合ではなく tasks.md の記述漏れ）。実装時に受け入れ基準を見て対処可能。

### F2 (Gap): `job start <slug>` の旧 path fallback が tasks.md に未記載

- delta spec (cli-commands) には「`specrunner/drafts/my-feature.md` が存在しない場合、`requests/active/my-feature.md` を fallback」シナリオがある。
- tasks.md の Task 4 は `CANONICAL_PATTERN` 更新のみで、`job start <slug>` の path 解決に fallback ロジックを追加するタスクがない。
- `src/cli/run.ts` は tasks.md に登場しないが、`job start <slug>` の slug→path 解決はこのファイルを通る可能性が高い。
- **重大度**: 低（delta spec 側が正しく記述されているため、実装者が delta spec を読めば対処可能）。

### F3 (Cosmetic): `request-new.ts` の success メッセージが古い path をハードコード

- `src/core/command/request-new.ts:52`: `const relPath = path.join("specrunner", "requests", "active", slug + ".md")` — Task 2 で store.ts が `drafts/` に変わっても、このメッセージは `requests/active/` を表示し続ける。
- **重大度**: 極低。機能には影響しないが、`request new` 実行時のフィードバックが誤ったパスを示す。Task 3a の実装時に合わせて修正すること。

---

## Delta Spec Review

| delta spec | 内容 | 評価 |
|---|---|---|
| `cli-commands` | request 系コマンドの drafts 対応、job finish 引数なしエラー | ✅ 要件と一致 |
| `job-state-store` | CANONICAL_PATTERN の `drafts/` 対応 | ✅ 要件と一致 |
| `repository-registration` | bootstrap status detection の drafts/ 対応 | ✅ 要件と一致 |

specs/ (merge 済みベースライン) は delta-specs/ と内容が一致していることを確認。

---

## Security Assessment

- **Path traversal**: `SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/` が slug に適用されており、`fs.rm` の対象は事前検証済みの slug から構築されたパスのみ。問題なし。
- **fs.rm の対象**: `opts.requestFilePath` は `store.resolve(cwd, slug)` で構築された `drafts/<slug>.md` のみ。任意パス削除にはならない。
- **新規攻撃面**: なし。OWASP Top 10 で関連するインジェクション・パスインジェクションのリスクは既存ガードで対処済み。

---

## Acceptance Criteria Coverage

| 基準 | 対応タスク | 評価 |
|---|---|---|
| drafts/ への起票 | Task 1, 2, 3a | ✅ |
| request rm/show/migrate-flat の path 更新 | Task 3b-3d | ✅ |
| pipeline-run での drafts move (local/managed) | Task 5, 6 | ✅ |
| finish 後 untracked なし | Task 5, 6, 7 | ✅ |
| move-requests-dir.ts 廃止 | Task 7a, 7b | ✅ |
| finish 引数なしエラー | Task 8 | ✅ |
| path 参照更新 5 ファイル | Task 1, 2, 8, 9, 10 | ✅ |
| request-patterns が空配列でない | Task 9 | ✅ |
| checkSlugCollision 3 経路 | Task 2 | ✅ |
| delta spec 3 件 | Task 12 | ✅ |
| requests/merged/ 140 件 read-only | design D8 | ✅ |
| rules-md-injection.md 残骸の消去 | Task 5 (fs.rm の副次効果) | ✅ |
| doc/skill 4 ファイル更新 | Task 11 | ✅ |
| 再現 test 3 件 | Task 14 | ✅ |
| 既存 test 更新 | Task 13 | ✅ |
| typecheck + test green | Task 15 | ✅ |
| ADR 記録 | **tasks.md 未記載 (F1)** | ⚠️ |
