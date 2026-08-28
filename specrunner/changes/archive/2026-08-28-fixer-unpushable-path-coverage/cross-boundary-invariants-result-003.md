# Cross-boundary invariants review — iteration 003

## Evidence

- `git diff main...HEAD --stat` を実行し、実装上の主要変更が `code-fixer.ts`, `spec-fixer.ts`, `fixer-helpers.ts`, `executor.ts` と関連 tests にあることを確認した。
- `design.md`, `tasks.md`, `spec.md` を確認し、fixer の notice、`policy: "follow-up"` contract、1 回限りの修復、未解消時の Layer 2 halt を境界条件として追跡した。
- 前周 F-001 の対象である現行 `code-fixer.ts` を読み直した。`CodeFixerStep.outputContracts` は復元され、`buildUnpushablePathContracts(deps)` により code-fixer / spec-fixer の双方が同じ contract を宣言する。
- 未変更側の `step-context-builder.ts` を確認した。step contract は adapter の `OutputVerificationPolicy` に渡され、attempt 1 だけ unpushable-path follow-up を生成し、attempt 2 では同 kind を除外する。このため executor の事後 gate からの除外後も Layer 1 は失われない。
- local runtime の境界を追跡した。adapter の修復 turn 後、`executor.ts` は unpushable-path 以外の contract を事後検査し、`LocalRuntime.finalizeStepArtifacts` が `commitAndPush` を呼ぶ。そこで self-commit は mixed reset により worktree へ正規化され、最終 publishable paths に違反が残る場合だけ `UNPUSHABLE_PATH_BLOCKED` が発生し、executor が typed error を `makeUnpushablePathHalt` に変換する。
- self-commit を伴わない通常編集でも、adapter 内の最初の検査は contract を保持しているため Layer 1 follow-up が先に発生する。修復成功時は Layer 2 の検査対象から path が消え、修復失敗時は Layer 2 halt に到達する。
- self-commit を伴う場合、最初の adapter 検査は commit history を検出して follow-up を送る。修復後も旧 commit が検査集合に残り得るが、attempt 2 では unpushable-path prompt を送らず、続く mixed reset が agent commit を worktree の最終内容へ正規化するため、修復済み path を誤って halt せず、未修復 path だけを Layer 2 が止める。
- managed runtime は従来どおり `unpushable-path` validation を明示的に skip し、CLI finalize も no-op であることを確認した。この change はその runtime 境界を変更せず、pushCapability notice/contract の追加によって既存 managed lifecycle に新しい halt 経路を持ち込まない。
- `bun run test -- --run src/core/step/__tests__/fixer-push-capability.test.ts tests/unit/step/unpushable-path-escalation.test.ts tests/unit/step/unpushable-path-contract.test.ts tests/unit/runtime/unpushable-path-validate.test.ts` を実行し、4 files / 82 tests が pass した。終了時に GitHub Actions summary の workspace 外 read-only path への書込み warning が出たが、test assertions は全件成功した。

## Findings

なし。

## Observations

- `executor.ts` の事後 gate 除外は全 step の `unpushable-path` contract に作用するが、Layer 1 は step-context 構築時に独立して設定され、Layer 2 は local finalize に残るため、implementer の既存 2 層防御も同じ順序で維持される。
- 前周 F-001 は解消済みである。contract を削除する回避策ではなく、contract を復元した上で self-commit 正規化前の重複事後検査だけを除外している。

## Verification gaps

- targeted tests は contract/notice、follow-up policy、executor と Layer 2 の各境界を検証するが、実 git repository 上で「agent self-commit → follow-up repair → mixed reset → publishable-path check」を単一 test として通す end-to-end case は確認できなかった。実行順と各境界の既存 tests から不変条件は確認できるため、blocking finding とはしない。
