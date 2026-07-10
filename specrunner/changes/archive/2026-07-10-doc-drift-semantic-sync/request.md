# authority 文書と実装の drift 3 件を修正し、同期テストを意味的照合に拡張する

## Meta

- **type**: spec-change
- **slug**: doc-drift-semantic-sync
- **base-branch**: main
- **adr**: false

## 背景

外部レビューにより、実装と文書（README / registry コメント / architecture 文書）の drift が 3 件確認された。いずれも実装が正で文書が古い。既存の README 同期テストは「step 名が README に含まれるか」と「必須見出しの存在」しか照合しないため、個数・並列性・スキーマ版号といった**意味的な drift を検出できない**。守るべき範囲を検査が走査していないという構造は、過去のコードベース監査で確認された「architecture test が守るべき call-site を grep スコープから外している」問題の文書版である。個別修正に加え、同種 drift の再発を機械検出できるよう同期テストを拡張する。

## 現状コードの前提

- `README.md:94` — custom reviewers を「run serially after `code-review`」と記述。実装は parallel fan-out（`src/core/pipeline/pipeline.ts:732` の runCoordinatorFanOut が `Promise.allSettled`（791）で member step を並列実行し、commit/push のみ FIFO mutex で直列化）
- `src/core/pipeline/registry.ts:27` — 「Standard 12-step pipeline descriptor」とあるが、STANDARD_DESCRIPTOR.steps は 13 entries（registry.ts:32-46: request-review / design / spec-review / spec-fixer / test-case-gen / implementer / verification / build-fixer / code-review / code-fixer / conformance / adr-gen / pr-create）。`registry.ts:166` の「standard (12-step)」も同様。同行の design-only (1-step) / fast (9-step) は実数と一致している
- `architecture/domain-model.md:20` — 「`version` は常に 1」とあるが、実装は `version: 1 | 2` で新規 state は 2（`src/state/schema.ts:246-252`、`src/store/job-state-store.ts:88`）。version 1 は read 時に 2 へ normalize される（`schema.ts:453-460`）。なお同文書 22 行目に「正確なフィールドはコードが正典」とあり、文書をコードに合わせる方向が正
- `tests/unit/docs/readme-pipeline-sync.test.ts` — README が STEP_NAMES の各値を含むか（19-25）と、4 つの必須見出しの存在（28-43）のみを照合する

## 要件

1. `README.md:94` の custom reviewers 記述を実装に一致させる（並列 fan-out で実行され、commit/push が直列化される旨）
2. `src/core/pipeline/registry.ts` の「12-step」コメント 2 箇所（27 / 166）を steps 配列の実数に一致させる
3. `architecture/domain-model.md:20` の version 記述を実装に一致させる（1 | 2、read 時に 1→2 normalize、新規 state は 2）
4. 同期テストを拡張し、少なくとも次の 2 軸を実装由来の値と機械照合する:
   - (a) `registry.ts` のコメント内「N-step」表記が、対応する descriptor の `steps.length` と一致すること（standard / design-only / fast すべて）
   - (b) `architecture/domain-model.md` の version 記述が state schema の現行版号と矛盾しないこと
   照合の実装方式（ソース・文書テキストへの regex 照合等）は design 判断とするが、既存の grep 系 drift guard（例: `tests/grep-no-step-name-hardcode.test.ts`）の慣例に倣うこと
5. 並列性（serial / parallel）の記述の機械照合は、brittle にならない範囲で design 判断とする（見送る場合は理由を design に記録）

## スコープ外

- README の全体再構成（backlog B-1 の別線）
- 文書の意味的照合の一般化・対象文書の拡大（今回の 2 軸に限定）
- descriptor / schema / pipeline 実装本体の変更（文書とテストのみ）

## 受け入れ基準

- [ ] 文書 3 件（README.md / registry.ts コメント / domain-model.md）の修正が入り、記述が実装と一致する
- [ ] 「N-step」表記を誤った数に書き換えると同期テストが fail することをテストで固定する（descriptor の steps.length 由来の照合であること）
- [ ] domain-model.md の version 記述を旧記述（「常に 1」）に戻すと同期テストが fail することをテストで固定する
- [ ] 既存テスト無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: 個別修正と検査軸拡張を 1 request に束ねる — 修正だけでは同種 drift が再発する。「歯の走査範囲の穴」と同型の問題であり、穴を塞ぐところまでが 1 単位
- **採用**: 機械照合の対象を「数値（N-step）」「版号（version）」の 2 軸に限定する — 一意に照合可能で false positive が出にくい。散文の意味照合は brittle で保守コストが利得を上回る
- **却下**: descriptor から README の該当節を生成する方式 — README は人間向け文書であり、生成物化は可読性と編集自由度を損なう。照合（検証）に留める
- **却下**: 「12-step」を数え方の注記で維持する案（fixer を loop pair として数える等）— descriptor の entries は 13 であり、注記による整合は読者に暗算を強いる。実数表記が誠実
