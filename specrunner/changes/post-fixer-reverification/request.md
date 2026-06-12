# code 変更後に機械検証を経ずに pr-create へ到達できる遷移経路を塞ぐ

## Meta

- **type**: spec-change
- **slug**: post-fixer-reverification
- **base-branch**: main
- **adr**: true

## 背景

conformance-fix-target の run（job e9602244、PR #648、2026-06-12）で実証された事象。code-fixer の commit がアーキテクチャテスト TC-018 に違反するコード（pipeline.ts への STEP_NAMES import）を持ち込んだが、verification（typecheck && test）は implementer 直後に実行済みで、それ以降の gate（code-review / custom reviewers / regression-gate / conformance）はすべて LLM レビューでありテストを再実行しない。結果、テスト fail を含む branch が pr-create まで到達し、CI red の PR が作られた。

防御として機能したのは repo 側 CI（最終防衛線）のみで、pipeline 内部の機械検証は「最後のコード変更」より前の時点の snapshot しか保証していなかった。

## 現状コードの前提

- `src/core/pipeline/types.ts:160-163` — verification は passed で code-review へ進み、以降 verification に戻る遷移は build-fixer ↔ verification ループのみ
- `src/core/pipeline/reviewer-chain.ts:191-211` — code-fixer は approved で次の reviewer（または元の reviewer）へ遷移し、verification を経由しない
- つまり code-fixer / spec-fixer がコードを変更した後、pr-create までの経路上に typecheck && test を実行する step が存在しない
- verification step 自体は決定的な機械検証（typecheck && test）であり、LLM gate と違って判断揺れがない

## 要件

1. 不変条件として「最後にコードを変更した step の後、pr-create へ到達する前に、機械検証（typecheck && test）が当該変更を含む状態で少なくとも 1 回成功している」を pipeline が構造的に保証する。実現方式（最終 gate 前の verification 再実行、fixer 後の条件付き再検証等）は design で決定する
2. 再検証が failed の場合は既存の verification → build-fixer 遷移と同じ収束則に乗せる
3. コード変更が一度も起きていない経路（fixer が走らなかった run 等）では余分な再検証を増やさない

## スコープ外

- CI 側の防御強化（CI は最終防衛線として現に機能した。本件は pipeline 内部の保証）
- LLM reviewer へのテスト実行義務付け（決定的検証を LLM の判断に委ねない）
- verification ↔ build-fixer ループの maxIterations 等の収束パラメータ変更

## 受け入れ基準

- [ ] 最後のコード変更の後に機械検証を経ずに pr-create へ到達する遷移経路が存在しないことをテストで固定する
- [ ] 再検証 failed 時に build-fixer 経路へ遷移することをテストで固定する
- [ ] fixer が一度も走らない run で再検証が追加実行されないことをテストで固定する
- [ ] `typecheck && test` が green

## 関連

- 実証: PR #648 の CI red（TC-018 違反が pipeline 内部 gate を素通り、2026-06-12）
