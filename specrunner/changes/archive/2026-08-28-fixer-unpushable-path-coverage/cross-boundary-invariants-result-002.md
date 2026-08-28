# Cross-boundary invariants review — iteration 002

## Evidence

- `git diff main...HEAD --stat` と実装差分を確認した。実装差分は `code-fixer.ts`, `spec-fixer.ts`, `fixer-helpers.ts` と fixer push-capability tests に限定され、Layer 1/Layer 2 の既存基盤は未変更である。
- `design.md`, `tasks.md`, `spec.md` を読み、code-fixer / spec-fixer の両方が notice と `policy: "follow-up"` contract を持つこと、および follow-up 後にだけ Layer 2 へ到達することが normative な境界条件であると確認した。
- 未変更側の `executor.ts` の実行順を追跡した。`buildAllOutputContracts` による output gate は `finalizeStepArtifacts` より前に実行され、contract がない step は follow-up を一切開始せず、finalize の `UNPUSHABLE_PATH_BLOCKED` を直接 halt に変換する。
- 未変更側の `commit-push.ts` を確認した。Layer 2 は mixed reset 後に `collectPublishablePaths` を検査するが、修復 prompt を送る機能はなく、違反時は例外を投げるだけである。
- 前周 F-001 の対象 `code-fixer.ts` を現行内容で読み直した。self-commit の履歴残留問題を避けるため、今回の修正では code-fixer の contract が全面的に削除されている。
- 新規 test は `CodeFixerStep.outputContracts` が `undefined` であることを正として固定しており、request/spec/test-cases の TC-004, TC-005, TC-015 と逆の挙動を検証している。

## Finding F-001

- Severity: high
- Resolution: fixable
- Location: `src/core/step/code-fixer.ts:83`
- Title: self-commit 対策が code-fixer の Layer 1 修復経路そのものを削除している

前周の指摘は、self-commit がある場合に output gate が mixed-reset より先に走るため、follow-up で worktree を修復しても commit 履歴由来の violation が残るというものだった。現行修正はこの順序問題を解消せず、`CodeFixerStep.outputContracts` を宣言しないことで gate を迂回している。

これは self-commit の有無にかかわらず code-fixer の Layer 1 を無効にする。code-fixer が通常の未コミット編集として `.github/workflows/**` を変更した場合、`executor.ts` の output-contract 検査には unpushable contract が一件も渡らないため follow-up prompt は 0 回となる。その後 `finalizeStepArtifacts` が `commitAndPush` を呼び、Layer 2 が同 path を検出して直ちに `UNPUSHABLE_PATH_BLOCKED` / `awaiting-resume` halt にする。つまり original request が修正対象とした実測経路がそのまま残り、受け入れ基準「Layer 2 halt の前に 1 回の follow-up prompt」と、spec の code-fixer contract 要件を満たさない。

新規 tests はこの逸脱を検出できないだけでなく、`outputContracts` 不在を期待値に書き換えている。テスト内コメントで Layer 2 を「sole backstop」と呼んでも、Layer 2 には agent へ修復機会を返す境界機能がないため代替にはならない。

修正では code-fixer の `unpushable-path` follow-up contract を復元した上で、前周で確認された self-commit 正規化との順序を両立させる必要がある。たとえば contract 検査が step-start 基準の実効差分を評価できるように self-commit を検査前に正規化する、または修復後の内容が path を除去した場合に古い self-commit path を検査集合へ残さない形にする。通常編集と self-commit の両経路について、follow-up が一度発生し、修復成功時は finalize へ進み、修復失敗時だけ Layer 2 halt になる統合テストが必要である。

## Observations

- code-fixer の全 prompt return pathには capability notice が付与されている。しかし notice は予防的情報であり、agent が違反した場合の一回限りの修復機会という contract 不変条件を代替しない。
- spec-fixer は contract を保持している。現在の Actions workflow pattern と spec-fixer の write scope の組合せでは self-commit 順序問題は実害化しないため、この iteration では別 finding としない。

## Verification gaps

- review は静的な実行経路追跡を中心に行った。full suite は既存の `verification-result.md` では green だが、現行 tests が code-fixer の必須 contract 不在を意図的に期待しているため、green は要求された cross-boundary behavior の証拠にならない。
- code-fixer の通常未コミット編集と self-commit の双方について、agent follow-up から mixed-reset、Layer 2 までを一続きに検証する integration test は確認できなかった。
