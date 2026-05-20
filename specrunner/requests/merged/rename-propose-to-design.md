# propose ステップを design にリネームする

## Meta

- **slug**: rename-propose-to-design
- **type**: refactoring
- **base-branch**: main
- **date**: 2026-05-13
- **author**: color4pen

## ワークフローオプション

- **enabled**: []

## 背景

propose という名前は openspec 由来で「仕様を提案する」ニュアンスが強い。実際の役割は request.md を読んで design.md + tasks.md + delta spec を生成する設計ステップであり、design の方が実態に合う。

GitHub Issue #201。

## 目的

ステップ名を `propose` から `design` にリネームする。振る舞いは変更しない。

## 要件

1. **step 定義のリネーム**: `src/core/step/propose.ts` → `src/core/step/design.ts`。export 名も `proposeStep` → `designStep`、`name: "propose"` → `name: "design"`

2. **system prompt のリネーム**: `src/prompts/propose-system.ts` → `src/prompts/design-system.ts`。export 名 `PROPOSE_SYSTEM_PROMPT` → `DESIGN_SYSTEM_PROMPT`、`PROPOSE_INITIAL_MESSAGE_TEMPLATE` → `DESIGN_INITIAL_MESSAGE_TEMPLATE`、`buildInitialMessage` はそのまま（汎用名）

3. **遷移テーブルの更新**: `src/core/pipeline/transitions.ts` の step 名を `propose` → `design` に変更

4. **agent 定義の更新**: `src/core/agent/definitions.ts` で propose agent の名前を更新

5. **全 import パスの更新**: `propose` を参照する全 import を `design` に更新

6. **テストの更新**: テストファイル名・テスト内の step 名参照を更新

7. **job state の後方互換**: 既存の job state JSON に `step: "propose"` が記録されている。resume コマンドで古い job を再開する場合に備え、遷移テーブルに `propose` → `design` のエイリアスを残すか、resume の step 解決で `propose` を `design` にマッピングする

8. **commit message フォーマット**: #215 で導入された `commitAndPush` が `${step.name}: ${slug}` で commit message を生成する。リネーム後は `design: ${slug}` になる

## 受け入れ基準

- [ ] `grep -r "propose" src/ --include="*.ts"` で step 名としての `propose` が残っていない（変数名・コメント内の一般的な用法は除く）
- [ ] `src/core/step/propose.ts` が存在しない
- [ ] `src/prompts/propose-system.ts` が存在しない
- [ ] pipeline が `design` ステップ名で正常に実行される
- [ ] 既存 job state（`step: "propose"`）の resume が動作する
- [ ] `bun run typecheck` / `bun run test` が全 pass
