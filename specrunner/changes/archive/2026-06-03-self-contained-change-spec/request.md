# spec を自己完結 Layer-1 spec に再定義し、rule 検証を廃止する

## Meta

- **type**: spec-change
- **slug**: self-contained-change-spec
- **base-branch**: main
- **adr**: true

## 背景

ADR-20260602（spec-model）D1/D2 に基づき、spec を baseline への差分ではなく「その作業で達成する Layer-1 振る舞いの自己完結記述」に再定義する。

spec は authority ではなく test への入力であり、振る舞いの真実は test suite + 構造の歯が担う。consumer は LLM（test-case-gen / spec-review）なので、入力 format を rule で機械検証する意味がない。品質は spec-review の意味的レビューと test が担保する。

## 要件

1. 1 作業 = 1 自己完結 spec ファイルとする（`specrunner/changes/<slug>/spec.md`）。capability 別ディレクトリ分割をやめ、baseline への差分ではなくその作業で達成する Layer-1 振る舞いを記述する。
2. 記述項目（Requirement / Scenario / 正規キーワード等）は書き方の指針として残すが、機械的に強制しない。
3. rule ベースの spec 検証を全廃する: `delta-spec-validation` step、rules registry（`src/core/spec/rules/`）、validator（`src/core/spec/delta-spec-validator.ts`）、`delta-spec-fixer`、および baseline header 一致 / marker の差分意味 / capability baseline 参照。
4. design step の template 配置を変更する: `delta-spec-template.md`（B-group・配置してから削除する参照テンプレート）を廃し、`spec.md` を A-group として配置する（agent が書き込み、永続。削除しない）。記述項目の指針は `spec.md` の scaffold か design prompt に持たせる。
5. design / spec-review を新モデルに合わせる: baseline 参照・marker 分類・header 一致の指示を除去する。spec-review は spec.md の各定義セグメント単位で「書かれていることが正しいか・不足がないか」を意味的にレビューする（rule 検証ではない）。
6. test-case-gen は新しい `spec.md`（`specrunner/changes/<slug>/spec.md`）を読む。
7. "delta" 命名を廃止する（step 名 / template 名 / 関連 path helper / prompt 文言）。

## スコープ外

- `specrunner/specs/` baseline corpus 自体の物理削除（別リクエスト baseline-capability-consolidation）。

## 受け入れ基準

- [ ] design step 後、その作業の spec が `specrunner/changes/<slug>/spec.md` に 1 ファイルで存在する
- [ ] `delta-spec-validation` / `delta-spec-fixer` が pipeline から無くなっている
- [ ] `src/core/spec/rules/` と `delta-spec-validator.ts` への参照が `src/` 内に残らない
- [ ] `delta-spec-template.md` を配置・削除する処理が無く、`spec.md` が A-group として配置される
- [ ] spec-review が baseline を読まずに spec.md の各セグメントをレビューする
- [ ] "delta" を含む step 名 / template 名 / path helper が残らない
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- spec は authority でなく test への入力。入力 format の rule 検証は不要で、品質は spec-review（意味的）と test が担保する。
- test は spec の項目に加え spec 外の要素もカバーする。spec が取りこぼす範囲は test 側で守る。
- spec-review は廃止せず、各定義セグメントの正しさ・不足の有無を判断する役割として残す。
