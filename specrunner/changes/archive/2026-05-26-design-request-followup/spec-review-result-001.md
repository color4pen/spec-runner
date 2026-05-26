# Spec Review Result

- **verdict**: approved

## Summary

design / code-review step に request.md 補助 section を CLI から注入する変更。問題定義・設計判断・タスク分解・delta spec の一貫性が高く、実装可能な粒度に落とし込まれている。

## Findings

### [info] T-01 の空 body 処理が曖昧

`extractMarkdownSections` の「heading 直下が空（本文なし）の case（Map にエントリなし or 空文字列）」の `or` 表現が曖昧。  
ただし同じ `src/parser/request-md.ts` 内の `extractSections` が `if (body.length > 0) { result[heading] = body }` — 空 body はエントリを作らない — という明確な先例を持つ。実装者は同パターンに揃えれば一貫する。blocking ではない。

### [info] T-05 のテストファイルは新規作成

`tests/unit/prompts/design-system.test.ts` は現時点で存在しない（tasks では「既存テストが green であることを確認」と書かれている）。実際は新規作成タスクになる。wording の不正確さだが実装への影響なし。

## Design Decisions Check

| Decision | 判定 | 備考 |
|----------|------|------|
| D1: followUp ではなく initial message 注入 | ✅ | post-work timing の問題・追加 turn コスト・既存 followUp との衝突を正確に分析 |
| D2: `<user-request>` タグ外に分離 | ✅ | agent が "CLI 指示" として扱う可能性を高める合理的な redundancy |
| D3: executor / adapter 無変更 | ✅ | regression リスク最小化。影響範囲が明確 |
| D4: 汎用 `extractMarkdownSections` utility | ✅ | parser layer に配置、再利用可能、pure function |
| D5: 3 heading を定数定義・grace skip | ✅ | heading 不在時の safe fallback が仕様化されている |

## Acceptance Criteria Check

| 受け入れ基準 | タスク対応 | 備考 |
|------------|-----------|------|
| design step context に スコープ外 注入 | T-03 | buildInitialMessage 修正 |
| design step context に 受け入れ基準 注入 | T-03 | 同上 |
| design step context に architect 設計判断 注入 | T-03 | 同上 |
| code-review step context にも注入 | T-04 | buildCodeReviewInitialMessage 修正 |
| 既存 pipeline に regression なし | T-07 + D3 設計 | design / code-review 以外の step には無変更 |
| typecheck + test green | T-07 | 最終 gate |

## Delta Spec Check

`specs/step-execution-architecture/spec.md` を確認:
- `## Requirements` セクション ✅
- `### Requirement:` header ✅
- `#### Scenario:` が 4 件 ✅
- `SHALL` / `MUST` を含む normative 記述 ✅
- ファイルパス `specs/<capability>/spec.md` 形式 ✅
- 旧形式 (`## ADDED/MODIFIED`) なし ✅

## Security

- 注入コンテンツは developer-authored な request.md から抽出（エンドユーザー入力ではない）
- タグ外注入にもかかわらず、コンテンツは既に `<user-request>` 内にも存在するため新規の攻撃面はない
- prompt injection (OWASP A03 相当) リスクは低い
