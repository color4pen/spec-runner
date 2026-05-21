# Spec Review Result — rules-md-cli-embed

- **verdict**: approved

## Summary

request.md → design.md → tasks.md → delta spec の一貫性、セキュリティ観点、実装可能性をすべてパス。

---

## 検証項目

### 1. 要件網羅性（request.md ↔ tasks.md）

| 要件 | 対応 Task | 判定 |
|---|---|---|
| Req 1: `src/prompts/rules.ts` 新規作成 | Task 1 | ✓ |
| Req 2: `copyRulesToChangeFolder` を writeFile に変更 | Task 2 | ✓ |
| Req 3: `rulesSourcePath` 削除 | Task 3 | ✓ |
| Req 4: `specrunner/rules.md` 削除 | Task 4 | ✓ |
| Req 5: `rules-md.test.ts` 書き換え | Task 5 | ✓ |
| Req 6: `local.test.ts` TC-LR-014/017 更新 | Task 6 | ✓ |
| Req 7: delta spec `prompt-fragment-registry` 更新 | Task 7 | ✓ |

### 2. 設計整合性（design.md）

- **D1 (template literal)**: `src/prompts/fragments.ts` の既存パターン（`COMMIT_DISCIPLINE` / `PIPELINE_RULES`）と同一手法。Build step 不要、tsc 干渉リスクなし。合理的。
- **D2 (signature 不変)**: caller 2 箇所（`local.ts:223`, `managed.ts:113`）の変更を最小化。`repoRoot` は dest path 構築に引き続き必要。合理的。
- **D3 (ENOENT guard 削除)**: string constant の writeFile では disk read 起因の ENOENT が unreachable。unreachable code の除去は正しい。
- **D4 (テスト方式)**: `fs.readFile` → `RULES_MD_CONTENT` import への置換は明確。file existence test の削除も正当（string constant に「存在確認」は不要）。

### 3. Delta spec

- `specs/prompt-fragment-registry/spec.md` は baseline L102 の `### Requirement: rules.md の存在と構造的保証` を正しく MODIFIED。
- 旧: `specrunner/rules.md` が存在し、`fs.cp` でコピー。
- 新: `RULES_MD_CONTENT` が source of truth、`fs.writeFile` で配置、`specrunner/rules.md` は repo に存在しない。
- Scenario の GIVEN も `RULES_MD_CONTENT` が export されている前提に正しく更新済み。
- `delta-spec-validation-result.md`: approved ✓

### 4. テスト整合性

- **TC-LR-014**: worktree に `specrunner/rules.md` を作成する行は不要になるため削除対象として明示されている。`fs.access(destPath)` assertion は writeFile 後でも有効なので構造的互換あり。
- **TC-LR-017**: ENOENT 経路が unreachable になるため describe ブロックごと削除。正当。
- **rules-md.test.ts**: `fs.readFile` を `RULES_MD_CONTENT` import に置換し、file existence test を削除。delta spec の新 Scenario と一致。

### 5. セキュリティ

純粋な内部リファクタリング。外部入力なし、認証なし、ネットワーク呼び出しなし。OWASP 観点での懸念事項なし。`fs.writeFile` の dest は CLI 内部で構築した固定パス（`rulesDestPath(slug)`）であり、path traversal の余地もない。

---

## 備考

- `request.md` の `architect 評価済みの設計判断: TBD` は template placeholder。design.md の D1–D4 が実質的にこれを満たしている。
- Task 2 の `fs.mkdir(..., { recursive: true })` 追加は防御的コーディングとして適切（change folder が既存でも冪等）。
