# pipeline-rules を src/prompts/ に埋め込み .claude/ 依存を解消する

## Meta

- **slug**: embed-pipeline-rules
- **type**: spec-change
- **base-branch**: main
- **date**: 2026-05-13
- **author**: color4pen

## ワークフローオプション

- **enabled**: []

## 背景

`.claude/rules/review-standards.md` にパイプライン全体の判定基準（severity, category, verdict, findings format, scoring）が定義されている。これは Claude Code SDK の `query()` が cwd の `.claude/rules/` を自動読み込みすることに依存している。

問題:
- spec-runner を他のプロジェクトにインストールした場合、そのプロジェクトの `.claude/` にこのファイルがないため機能しない
- `.claude/` は Claude Code 固有の仕組みであり、spec-runner のポータビリティを損なう

GitHub Issue #194。

## 目的

review-standards.md の内容を `src/prompts/pipeline-rules.ts` に埋め込み、spec-review と code-review の system prompt に直接含める。`.claude/rules/review-standards.md` を削除する。

## 要件

1. **`src/prompts/pipeline-rules.ts` を作成**: review-standards.md の内容を `PIPELINE_RULES` 定数として export する。名前を `pipeline-rules` に変更する（review-standards は実態と合わない）

2. **spec-review system prompt に埋め込み**: `src/prompts/spec-review-system.ts` で `PIPELINE_RULES` を import し、system prompt に含める。`.claude/rules/review-standards.md` への参照を削除する

3. **code-review system prompt に埋め込み**: `src/prompts/code-review-system.ts` で同様に埋め込む。「Follow .claude/rules/review-standards.md strictly」等の参照を削除する

4. **`.claude/rules/review-standards.md` を削除**: git から削除する

5. **spec-fixer / code-fixer の system prompt も確認**: pipeline-rules を参照している箇所があれば同様に更新する。fixer には pipeline-rules の注入は不要（findings に修正方針が含まれているため）だが、参照テキストがあれば削除する

## 受け入れ基準

- [ ] `src/prompts/pipeline-rules.ts` が存在し `PIPELINE_RULES` を export している
- [ ] spec-review と code-review の system prompt に pipeline-rules の内容が含まれている
- [ ] `.claude/rules/review-standards.md` が削除されている
- [ ] `.claude/rules/review-standards.md` への参照が src/ 内に存在しない
- [ ] `bun run typecheck` / `bun run test` が全 pass

## 補足

- pipeline-rules は約 180 行。system prompt に埋め込むとトークンが増えるが、現状も `.claude/rules/` 経由で同じ内容が注入されているため実質変わらない
- fixer 系には注入しない。fixer が pipeline-rules を持つと scope creep のリスクがある（前回のモジュールアーキテクト分析より）
