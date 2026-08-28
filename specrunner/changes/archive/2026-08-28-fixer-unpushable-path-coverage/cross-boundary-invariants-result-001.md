# Cross-boundary invariants review — iteration 001

<!-- verdict は CLI が typed findings から導出するため、この file には記載しない。 -->

## Evidence

- `git diff main...HEAD --stat` と source diff を確認した。実装差分は主に `code-fixer.ts`, `spec-fixer.ts`, `fixer-helpers.ts` と新規 test である。
- `design.md` / `tasks.md` / `spec.md` を、request の Layer 1 → Layer 2 と escalation 要件に照合した。
- 新しく contract が接続される経路を列挙した: code-fixer の normal / conformance / custom-review coordinator（各 initial / continuation）と spec-fixer の normal / conformance（各 initial / continuation）。全 prompt return path に notice があることを確認した。
- 未変更側の `step-context-builder.ts`, local `validateStepOutputs`, `executor.ts`, `commit-push.ts`, `collectPublishablePaths` を追跡した。
- fixer push-capability test を実行し、29 tests pass を確認した。

## Finding F-001

- Severity: high
- Resolution: fixable
- Location: `src/core/step/code-fixer.ts:84`（同じ問題が `src/core/step/spec-fixer.ts:87` にも該当）
- Title: fixer の self-commit が Layer 1 follow-up では除去不能な履歴として残る

新しい contract は agent 実行中の follow-up verification に接続されるが、その検査は synthesis の self-commit 正規化より前に行われる。未変更コードの具体的な実行列は次の通り。

1. code-fixer が `.github/workflows/x.yml` を修正し、自身で commit する。self-commit は既存機構が明示的にサポートする入力である。
2. `step-context-builder.ts:141` の detect が local runtime の `validateStepOutputs` を呼ぶ。
3. `collectPublishablePaths` は worktree だけでなく `HEAD --not --remotes=origin` の commit paths も列挙するため、self-commit 内の workflow path を violation として返す。
4. agent は一回限りの follow-up で workflow の worktree 内容を戻して代替修正を行っても、すでに作られた unpushed commit は HEAD に残る。通常のファイル修正だけでは publishable path set から消えない。
5. 再検査は同じ commit path を再び violation とし、executor は `UNPUSHABLE_PATH_BLOCKED` で halt する。
6. self-commit を `headBeforeStep` へ mixed reset する既存処理は `commit-push.ts:503` にあるが、これは output gate 後の finalize でしか走らないため到達しない。

したがって、fixer に追加した Layer 1 は、pipeline が許容している self-commit 経路では「該当 path の変更破棄 + 代替手段」の修復に成功できず、元の問題と同じく backstop halt に直行する。新規 tests は prompt builder と contract shape を個別に検査し、TC-015 も filtering logic をテスト内で再実装しているため、この呼出し順の組合せを踏んでいない。

修正では、follow-up 検査前に step-start HEAD を基準として self-commit を安全に正規化するか、検査対象を当該 step の修復後の実効差分として扱い、follow-up で path を戻した場合に過去の self-commit path が残留 violation にならないようにする必要がある。Layer 2 の finalize 前 backstop は維持すること。

## Observations

- Managed runtime は `unpushable-path` contract を明示的に skip するが、push capability は command runner で環境から注入される。今回の再現は local runtime の supported self-commit synthesis 経路に限定した finding である。
- prompt notice は確認した全分岐で null/empty capability 時に既存文字列を変えない。

## Verification gaps

- full suite は既存 `verification-result.md` で green。今回の review では対象 test file（29 tests）のみ再実行した。
- self-commit → follow-up → repair → finalize を結ぶ integration test は存在しない。
