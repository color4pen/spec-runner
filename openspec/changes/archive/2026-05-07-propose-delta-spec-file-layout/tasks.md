## 1. Prompt にファイル配置ルールを追加

- [x] 1.1 `src/prompts/propose-system.ts` の `## Delta Spec Format Rules (MUST)` セクション内、`### Self-review checklist` の直前に `### ファイル配置` サブセクションを追加する。内容:
  - delta spec は `openspec/changes/<slug>/specs/<capability-name>/spec.md` に配置すること
  - `specs/<name>.delta.md` 等のフラットファイルは禁止
  - `<capability-name>` は `openspec/specs/` 配下の既存ディレクトリ名と一致すること（新規 capability の場合は proposal.md の New Capabilities で宣言した名前を使用）
- [x] 1.2 `### Self-review checklist` に以下の項目を追加: `- [ ] delta spec のファイルパスが \`specs/<capability-name>/spec.md\` の形式である（フラットファイルでない）`

## 2. propose-session spec の更新

- [x] 2.1 delta spec `openspec/changes/propose-delta-spec-file-layout/specs/propose-session/spec.md` が `openspec validate` を pass することを確認する（本 change folder に既に含まれている）

## 3. 検証

- [x] 3.1 `bun run typecheck` が green であること
- [x] 3.2 `bun run test` が green であること
- [x] 3.3 `npx openspec validate "propose-delta-spec-file-layout" --type change --strict` が pass すること
