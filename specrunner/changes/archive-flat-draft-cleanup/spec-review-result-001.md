# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

1. **バグの事実確認** — `src/core/archive/orchestrator.ts:262` の削除先が `recordDir`（worktree パス）であることを実コードで確認。worktree モードでは `recordDir = worktreePath`（`FAKE_WORKTREE`）となり、untracked な draft は届かない。no-worktree モードでは `recordDir = cwd` のため場所バグは発現しないが、形式取りこぼし（ディレクトリのみ）は両モードで存在する。

2. **フラット形式の取りこぼし確認** — 現行コード `fs.rm(nodePath.join(recordDir, draftsDir(), slug), ...)` はディレクトリ形式のみ。`store.ts:resolveWithFallback` が両形式を受け入れることを実コードで確認済み。

3. **worktree-side staging の no-op 確認** — lines 272–284 の `git add specrunner/drafts/` は、untracked draft が worktree に存在しないため staging 対象が空になり実質 no-op であることを確認。設計 D4 の根拠と一致。

4. **`cwd` = repo 本体であることの確認** — `ArchiveInput.cwd` に「Main repo root (cwd). Must not be inside a worktree.」とコメントがあることを実コードで確認。D1 の前提と一致。

5. **cancel/runner.ts の前例確認** — `runner.ts:154` が `deps.repoRoot` 基準で `requestStore.write` を呼ぶことを実コードで確認。D1 が主張する「対称的な前例」は正確。

6. **slug の path traversal 安全性** — `SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/` による検証が CLI エントリポイント（`command-registry.ts`、`request-new.ts`）と parser ルールで行われ、`../` 等が slug に混入できないことを確認。archive orchestrator は job state 由来の slug を使うため、検証済み値のみが届く。

7. **`FinishFs` に必要な依存が揃っていること** — `exists`・`rm` が `FinishFs` に定義済みで、`spawn` が `ArchiveInput` から渡されることを確認。D5「追加の DI 不要」は正確。

8. **既存テスト T-01 が変更対象であることの確認** — T-01 が `nodePath.join(FAKE_WORKTREE, draftsDir(), FAKE_SLUG)` を期待しており、fix 後には `FAKE_CWD` 基準の両形式パスに変わる必要があることを確認。

9. **T-08・T-09 の変更要件確認** — T-08 は drafts パスで `fs.exists` が false のとき `git add` 未呼び出しを検証、T-09 は true のとき呼び出しを検証。worktree-side staging を削除する D4 に伴い、両テストが別の観点（rm 呼び出し有無）への更新を要することを確認。

10. **spec.md の各 Requirement が SHALL/MUST を含むことの確認** — 全 4 要件に SHALL または MUST を含み、Given/When/Then 形式の Scenario が添付されていることを確認。

11. **受け入れ基準とテスト設計の対応確認** — request.md の全チェックボックスに対応するテスト（NEW-flat, NEW-dir, NEW-none, NEW-tracked と既存更新 T-01/T-08/T-09）が tasks.md に列挙されていることを確認。

12. **T-07 命名衝突（既存）の確認** — `orchestrator.test.ts` に「T-07」という識別子を持つテストが 2 件（line 245: EACCES 警告テスト、line 326: archived 状態の short-circuit テスト）存在する既存問題を確認。本 change が導入したものではないが記録する。

## 検証できなかった項目

- `git ls-files -- <path>` に絶対パスを渡した場合の git の実挙動（絶対パスで tracked 判定が正しく動くか）。tasks.md が `relPath` を使うと記述しているが導出式を明示していないため、実装者が `absPath` をそのまま渡すリスクを実環境で確認はできない。
- `createTransportAuth.wrapSpawn` が `git ls-files` に対して余分な認証引数を付加しないかどうかの実挙動（コードから safe と判断したが実測未確認）。

## Findings 詳細

### F-01: tasks.md の `relPath` 定義が暗黙

tasks.md T-01 は `await spawn("git", ["ls-files", "--", relPath], { cwd })` と書くが、`relPath` の導出式を定義していない。`absPath = nodePath.join(cwd, draftsDir(), slug + ".md")` から `relPath = nodePath.join(draftsDir(), slug + ".md")` は自明だが、実装者が `absPath` を誤って渡した場合、`git ls-files` が tracked ファイルを untracked と誤判定する（stdout が空になる）リスクがある。design.md には「相対パスで呼ぶ」と明記されているが、tasks.md の導出式を補記することで曖昧性を除去できる。

修正案: tasks.md T-01 に `const relPath = nodePath.join(draftsDir(), slug + ".md")` （dir 形式は `.md` を除く）の 1 行を明示する。

### F-02: spec.md にディレクトリ形式 tracked draft のシナリオが欠落

"tracked な draft は削除せず警告を出す" 要件に tracked フラット形式のシナリオしかない。ディレクトリ形式が tracked な場合のシナリオと、対応する NEW-tracked テストバリアントが存在しない。実装は両形式に同じロジックを適用するため動作は正しくなる見込みだが、ディレクトリ形式 tracked の挙動がテストで固定されない。

### F-03: spec.md に両形式同時存在シナリオが欠落

フラット形式とディレクトリ形式が同時に存在する場合の挙動（両方削除、フラット優先順序）が spec に記載されていない。設計 D2 で「フラット → ディレクトリの順に処理する」と決定しているが、この順序を保証するテストケースが存在しない。実運用では両形式が同時存在する状況は稀であるため影響は限定的。

### F-04: 既存テストファイルの T-07 命名衝突（pre-existing）

`orchestrator.test.ts` に "T-07" を冠するテストが 2 件存在する（line 245: "draft rm EACCES emits a Warning"、line 326: "archived job resolves via includeArchived"）。本 change が導入した問題ではないが、tasks.md が "T-02〜T-07 は無変更で green のまま" と記述しており、どちらの T-07 を指すか曖昧になる。
