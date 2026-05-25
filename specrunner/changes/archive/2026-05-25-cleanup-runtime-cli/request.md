# runtime / CLI 周辺の cleanup: drafts 空 dir 残置 + repo root 解決の整理 (#391 Finding 2,3)

## Meta

- **type**: bug-fix
- **slug**: cleanup-runtime-cli
- **base-branch**: main
- **adr**: false

## 背景

直近の PR #387-#390 とその後の audit で発見した 3 件の軽微な cleanup を 1 PR にまとめて対応する。

### 課題 A: `drafts/<slug>/` の空 directory が残置される

`request new <slug>` で `specrunner/drafts/<slug>/request.md` を作る (ADR `2026-05-24-drafts-directory-structure` で directory 化済)。`job start <slug>` 起動時に `runtime/local.ts:238` / `runtime/managed.ts` の `fs.rm(opts.requestFilePath)` で **file は削除されるが、親 directory `<slug>/` は残る**。

実害:
1. drafts/ 配下に空 directory が run のたびに蓄積する
2. `request ls` 出力が「未起動」を意味する drafts の意味論を汚す（既に起動済 slug が dir として残る）
3. 同名 slug で再起票しようとすると `request new <slug>` が既存空 dir に file を作るだけになり confusing

実例: PR #387-#390 の merge 後、main worktree の `specrunner/drafts/` 配下に `archive-path-helper/` `remove-xdg-mode/` `resume-draft-path-fix/` の 3 つの空 dir が残った。

### 課題 B: CLI entry の repo root 解決失敗時の挙動不整合 (#391 Finding 2)

`cli/cancel.ts` / `cli/job-show.ts` / `cli/ps.ts` のいずれも `git rev-parse --show-toplevel` で repo root を解決しているが、git 失敗時の挙動が分かれている:

| ファイル | git 失敗時の挙動 |
|---|---|
| `cli/cancel.ts` | `return 1` (fail-fast) |
| `cli/job-show.ts` | `process.cwd()` fallback (silent) |
| `cli/ps.ts` | 同上 (silent) |

意図的な差別化 (state-modifying vs read-only) と推測されるが、**コード側にコメントがなく**、後続 contributor が「片方は throw、片方は fallback、どっちが正しい？」と混乱する余地がある。

### 課題 C: `resolveRepoRoot` のコピペ重複 (#391 Finding 3)

同じ `spawnCommand("git", ["rev-parse", "--show-toplevel"], { cwd: process.cwd() })` パターンが 3 ファイルで重複している (`cli/job-show.ts` と `cli/ps.ts` には同型の `resolveRepoRoot()` private 関数、`cli/cancel.ts` は inline)。共通実装を 1 箇所に集約すべき。

## 要件

1. **drafts 空 dir 残置の修正 (課題 A)**
   - `src/core/runtime/local.ts:238` 周辺と `src/core/runtime/managed.ts` の同等箇所で、`fs.rm(opts.requestFilePath)` 成功後に **親 directory も削除する**
   - 実装方針: `fs.rm(path.dirname(opts.requestFilePath), { recursive: true, force: true })` でまとめて削除、または `fs.rmdir(parent)` を後追いで呼ぶ (dir が空でない場合は silent fail)
   - 既存 flat ファイル形式 (legacy `drafts/<slug>.md`) の resolveWithFallback path もケアする（flat の場合は親 dir 削除しない）

2. **`resolveRepoRoot` 共通 util の新設 (課題 C)**
   - `src/util/repo-root.ts` (or 既存 util) に共通実装を export
   - silent fallback 版: `resolveRepoRoot(): Promise<string | null>` — git 失敗時 null を返す
   - fail-fast 版: `resolveRepoRootOrFail(): Promise<string>` — git 失敗時 throw

3. **CLI entry を共通 util 経由に書き換え + 挙動意図のコメント明記 (課題 B)**
   - `cli/cancel.ts`: `resolveRepoRootOrFail()` を使う + 「state-modifying なので git 必須」のコメントを追加
   - `cli/job-show.ts` / `cli/ps.ts`: `resolveRepoRoot()` (silent) を使い、null 時の挙動 (`process.cwd()` fallback) を維持 + 「read-only なので git 不在でも動作」のコメントを追加

## スコープ外

- `runtime/managed.ts` の signal cleanup 内 inline `JobStateStore` 構築 (#391 Finding 1 の残り部分) — `transitionJob` 経由で mutator 形式に乗らないため別途扱う
- `cli/run.ts` / `cli/resume.ts` / `cli/finish.ts` の repo root 解決 — これらは preflight 経由で別経路、本 request では触らない
- `runtime/*` の `fs.rm` の error handling 全般の見直し — drafts 関連のみ対応
- ADR 化 (= 軽微な cleanup、設計判断レベルではない)

## 受け入れ基準

- [ ] `job start <slug>` 完走後、`specrunner/drafts/<slug>/` directory が完全に削除されている (file + dir 両方)
- [ ] 既存 flat 形式 (`drafts/<slug>.md`) の resolveWithFallback path でも regression が出ない
- [ ] `src/util/repo-root.ts` (or 同等 path) に `resolveRepoRoot` / `resolveRepoRootOrFail` が export されている
- [ ] `cli/cancel.ts` / `cli/job-show.ts` / `cli/ps.ts` が共通 util 経由になっている
- [ ] 各 CLI entry の repo root 解決箇所に「なぜ fail-fast / silent fallback か」の 1 行コメントが付いている
- [ ] `bun run typecheck && bun run test` が green
- [ ] 関連 unit test を追加 (drafts 空 dir 削除 / repo root util の silent / fail-fast 両モード)

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

- **3 件を 1 PR にまとめる根拠**: いずれも `runtime/*` または `cli/*` 周辺の軽微な cleanup。編集ファイルが部分的に重なる (cli/*.ts は 3 件で共通) ため、別 PR にすると rebase 衝突リスクがある
- **空 dir 削除の実装方針**: `fs.rm(..., { recursive: true, force: true })` で dir ごと一括削除が最もシンプル。`fs.rmdir` で dir 単体削除して空でない場合 silent fail は、想定外 file の存在 (= user が後から置いた何か) を保護することになるが、本 request の挙動としては「draft 起動 = consume」なので親 dir ごと消すのが意味的に正しい
- **`resolveRepoRoot` の 2 wrapper 提供**: 1 つの util に「optional の throw flag」を引数で持たせるより、`resolveRepoRoot()` (silent) と `resolveRepoRootOrFail()` (fail-fast) を分けた方が call site の意図が読み取りやすい
