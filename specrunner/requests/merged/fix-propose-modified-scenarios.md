# propose が MODIFIED requirement にシナリオを生成しない

## Meta

- **type**: bug-fix
- **slug**: fix-propose-modified-scenarios

## 背景

`propose` ステップが delta spec を生成する際、`## MODIFIED Requirements` の requirement に `#### Scenario:` を含めない。`finish` の Phase 0 で `openspec validate` に弾かれ、手動でシナリオを追加して再実行する手戻りが発生する。

PR #137 (`request-command-redesign`) で発生。issue #138。

### 原因

`src/prompts/propose-system.ts` の Delta Spec Format Rules セクションに問題がある:

- Rule 2（107行目）で「各 Requirement は少なくとも 1 つの Scenario を含むこと」と汎用ルールとして記述されている
- ADDED Requirements は新規能力の記述なので自然にシナリオが生成される
- MODIFIED Requirements については 119行目の例示が `<変更後の本文 + Scenario>` と曖昧で、明示的に「MODIFIED にもシナリオ必須」と指示していない
- LLM は MODIFIED を「差分の説明」と解釈し、振る舞いを示すシナリオを省略する傾向がある

### 二重の漏れ

propose 直後の spec-review でも MODIFIED のシナリオ欠落を検出できていない。propose のプロンプト修正が一次対応、spec-review 強化は別途検討。

## 要件

### 1. propose-system.ts の Delta Spec Format Rules を修正

`src/prompts/propose-system.ts` の Delta Spec Format Rules セクションに、MODIFIED Requirements のシナリオ生成を明示する補足指示を追加する:

- 既存の Rule 2（「各 Requirement は少なくとも 1 つの Scenario を含むこと」）は維持した上で、MODIFIED 固有の補足指示を追加する
- MODIFIED Requirements にも最低 1 つの Scenario が必須であることを強調
- MODIFIED の Scenario は変更後の振る舞いを具体的に示すものであること
- 「差分の説明文」ではなく Given/When/Then 形式の振る舞い記述であること

### 2. Self-review checklist の強化

既存のチェックリスト項目「各 `### Requirement:` header の直下に `#### Scenario:` が少なくとも 1 つ存在する」は ADDED/MODIFIED を区別していない。MODIFIED を明示的に言及する項目を追加する。

## スコープ外

- spec-review 側のチェック強化（別 request で対応。issue #138 のコメントで tracking）
- openspec validate のロジック変更（既に正しく検出している）
- REMOVED Requirements のシナリオ（削除なのでシナリオ不要）

## 受け入れ基準

- [ ] `src/prompts/propose-system.ts` の Delta Spec Format Rules に MODIFIED シナリオ必須の明示的指示がある
- [ ] Self-review checklist に MODIFIED を明示的に言及する項目がある
- [ ] `bun run typecheck && bun run test` が green
- [ ] 効果検証は次回の MODIFIED を含む実パイプライン実行で確認する（プロンプト修正は確率的であり単体テストでは検証不可）
