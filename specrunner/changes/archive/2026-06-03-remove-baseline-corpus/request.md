# baseline corpus を削除し、残存する読み手と guard を撤去する

## Meta

- **type**: spec-change
- **slug**: remove-baseline-corpus
- **base-branch**: main
- **adr**: false

## 背景

ADR-20260602（spec-model）D4（baseline corpus を維持対象から外す）を完了する。D4 は監査記録への縮小を述べるが、本変更では corpus を監査記録として残さず削除する。

`specrunner/specs/`（capability 別 baseline corpus）は既に authority ではない。#508 で spec-merge（書き込み経路）を、#510 で pipeline 側の読み手（design / spec-review / delta-spec-validation）を撤去済みで、振る舞いの正典は spec.md → spec-review + test に移っている。

残るのは凍結した corpus 本体と、それを読む宙吊りコード・それを守る guard だけ。守る対象が消えた今、これらを撤去する。

## 要件

1. `specrunner/specs/` corpus（capability baseline 全ディレクトリ）を削除する。
2. baseline path helper を撤去する: `src/util/paths.ts` の `baselineSpecPath` / `specsDirRel` / `SPECS_DIR`。
3. baseline を読む残存コードを撤去する（`src/git/dynamic-context.ts` の specIndex 収集・注入など）。消費側、および `specIndex` / `SpecIndexEntry` を参照するテストファイルも含めて baseline 非依存にする。
4. baseline corpus を守るための guard を撤去する（守る対象が消えるため）: `src/core/step/commit-push.ts` の baseline 編集検出（`findAuthoritySpecViolations`）、prompt（`rules.ts` / `code-fixer-system.ts` / `design-system.ts` / `request-generate-system.ts`）の「baseline read-only / authority path 記述禁止」guidance、`src/core/command/request.ts` template の authority path 記述禁止コメント、`request-review-system.ts` の baseline-path-intent チェック。
5. `specrunner/specs/` への参照が `src/` 内に残らない。

## スコープ外

- `architecture/` の `specrunner/specs/` 参照更新（out-of-loop / 人手）。

## 受け入れ基準

- [ ] `specrunner/specs/` が存在しない
- [ ] `baselineSpecPath` / `specsDirRel` / `SPECS_DIR` への参照が `src/` 内に残らない
- [ ] `specrunner/specs/` への参照が `src/` 内に残らない
- [ ] `specIndex` / `SpecIndexEntry` への参照が `src/` ・ `tests/` に残らない
- [ ] `commit-push` に baseline 編集検出（`findAuthoritySpecViolations`）が無い
- [ ] prompt に baseline read-only / 直接編集禁止 guidance が残らない
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

ADR-20260602（spec-model）D4 準拠。baseline は authority でなく、読み書き経路は #508 / #510 で一掃済み。spec.md → spec-review + test が live gate であることを確認済み。corpus と guard は守る対象を失ったため撤去する。
