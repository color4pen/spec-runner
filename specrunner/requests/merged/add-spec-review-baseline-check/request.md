# spec-review に baseline spec との整合性チェックを追加する

## Meta

- **slug**: add-spec-review-baseline-check
- **type**: spec-change
- **base-branch**: main
- **date**: 2026-05-11
- **author**: color4pen

## ワークフローオプション

- **enabled**: []

## 背景

spec-review は delta spec のみをレビューし、baseline spec との整合性は検証していない。MODIFIED delta が存在しない Requirement を変更しようとしていても検出できない。

delta merge（PR #195）でマージ時にバリデーションエラーとして検出されるが、spec-review の段階で検出できれば早期にフィードバックできる。

## 目的

spec-review agent が baseline spec を参照し、delta spec との整合性を検証できるようにする。

## 要件

1. **Step interface に optional `enrichContext` メソッドを追加** — `src/core/step/types.ts` に追加。`buildMessage` の pure function 制約を維持しつつ、step 実行直前の context 拡充を宣言的に定義する。

   ```typescript
   enrichContext?(dynamicContext: DynamicContext, cwd: string, slug: string): Promise<DynamicContext>;
   ```

2. **StepExecutor に enrichContext 呼び出しを追加** — `src/core/step/executor.ts` の `runAgentStep()` 内、`buildMessage()` 呼び出しの前に `step.enrichContext?.()` を呼ぶ。

3. **SpecReviewStep に enrichContext を実装** — propose 完了後に change folder の `specs/` を走査して capability 名を列挙し、対応する baseline spec（`specrunner/specs/<capability>/spec.md`）を読み取って DynamicContext に追加する。`spec-merge.ts` の capability 列挙ロジックを参考にする。

4. **spec-review のシステムプロンプトに baseline 整合性チェック指示を追加** — `src/prompts/spec-review-system.ts` に以下を追加:
   - 「MODIFIED delta の Requirement header が対応する baseline spec に存在するか検証する」
   - 「REMOVED delta の Requirement header が baseline に存在するか検証する」
   - 「ADDED delta の Requirement header が baseline に既に存在しないか検証する」

5. **spec-review の初期メッセージに関連 baseline spec を注入** — enrichContext で収集した baseline spec の内容を buildMessage で初期メッセージに含める。delta spec がない場合（refactoring 等）はスキップ。

## 受け入れ基準

- [ ] Step interface に optional `enrichContext` が定義されている
- [ ] StepExecutor が `buildMessage` 前に `enrichContext` を呼んでいる
- [ ] SpecReviewStep の enrichContext が delta spec の capability に対応する baseline を収集する
- [ ] spec-review-system.ts に baseline 整合性チェックの指示がある
- [ ] spec-review の初期メッセージに関連 baseline spec の内容が含まれる
- [ ] delta spec がない場合は baseline 注入をスキップする
- [ ] `buildMessage` の pure function 制約が維持されている
- [ ] `bun run typecheck` / `bun run test` が全 pass

## 補足

- add-baseline-spec-context と並行して実行される想定。specIndex が先に入らなくても動作するよう、baseline spec の読み取りは enrichContext 内で直接行う。
- baseline spec の全文注入は対象 capability のみに限定する（コンテキスト膨張防止、通常 1-3 capability で 5-15KB）。
- enrichContext は将来 implementer 等の他ステップにも使い回せる設計。
