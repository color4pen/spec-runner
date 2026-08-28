# Cross-boundary invariants review — iteration 004

## Evidence

- `git diff main...HEAD --stat` を実行し、実装変更が主に `code-fixer.ts`, `spec-fixer.ts`, `fixer-helpers.ts`, `executor.ts` と関連 tests に限定されることを確認した。
- `design.md` と `tasks.md` を読み、fixer の notice、`policy: "follow-up"` contract、1 回限りの修復、未解消時の Layer 2 halt、および operator 裁定済みの executor gate 変更を境界条件として追跡した。
- `code-fixer.ts` と `spec-fixer.ts` の全 `buildMessage` return path を確認した。両 step は全 variant に capability notice を付加し、共通 helper から同形の unpushable-path contract を宣言する。coordinator fallback を含む code-fixer の分岐にも notice が残っている。
- 未変更側の `step-context-builder.ts` と adapter loop を確認した。step contract は executor gate とは独立して `OutputVerificationPolicy` に渡され、attempt 1 だけ unpushable-path follow-up を生成し、attempt 2 以降は同 kind を除外して repair turn を停止する。
- local runtime の finalize 境界を追跡した。adapter の修復 turn 後、`commitAndPush` が self-commit を mixed reset で最終 worktree state に正規化し、その後の publishable-path 検査で違反が残る場合にだけ `UnpushablePathBlockedError` を投げる。executor はこの typed error を既存の `awaiting-resume` halt に変換する。
- `executor.ts` の gate 除外は全 step の unpushable-path contract に作用するが、implementer の Layer 1 は独立した step-context policy に残り、Layer 2 も local finalize に残る。したがって変更されていない implementer の 2 層防御順序を破らない。
- managed runtime は従来どおり local git を持たないため unpushable-path validation を skip し、managed agent 自身の commit/push lifecycle を使う。この change はその既存 runtime 境界を変更していない。
- `bun run test -- --run src/core/step/__tests__/fixer-push-capability.test.ts tests/unit/step/unpushable-path-escalation.test.ts tests/unit/step/unpushable-path-contract.test.ts tests/unit/runtime/unpushable-path-validate.test.ts` を実行し、4 files / 82 tests が pass した。GitHub Actions summary の workspace 外 read-only path への書込み warning は発生したが、test process は exit 0 で全 assertions が成功した。

## Findings

なし。

## Observations

- persistent violation の halt point を mixed reset 後の Layer 2 に一本化したことで、agent self-commit に含まれたが follow-up で解消済みの path を、古い commit history だけを根拠に halt する false positive を避けている。
- 前周以降に source code の追加変更はなく、iteration 003 で確認した cross-boundary invariants は現行内容でも維持されている。

## Verification gaps

- 実 git repository 上で「agent self-commit → follow-up repair → mixed reset → publishable-path check」を単一 test として通す end-to-end case は確認できなかった。ただし adapter follow-up、executor ordering、commitAndPush backstop の各境界は個別 tests と現行コードで確認できるため、blocking finding とはしない。
