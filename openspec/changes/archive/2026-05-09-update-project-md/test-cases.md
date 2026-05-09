# Test Cases: update-project-md

## TC-01: Next.js / React / SSE の記述が除去されている

- **Priority**: must
- **Category**: correctness

**GIVEN** `openspec/project.md` が書き換えられた状態  
**WHEN** ファイルの全文を検索する  
**THEN**
- "Next.js" という文字列が存在しない
- "React" という文字列が存在しない
- "SSE" という文字列が存在しない
- "Web アプリケーション" という文字列が存在しない

---

## TC-02: CLI-first アーキテクチャが記述されている

- **Priority**: must
- **Category**: correctness

**GIVEN** `openspec/project.md` が書き換えられた状態  
**WHEN** Architecture セクションを参照する  
**THEN**
- "CLI-first" という記述が存在する
- "local runtime" と "managed runtime" の dual runtime 構成が説明されている
- Claude Agent SDK 経由のローカル実行に言及している
- Anthropic Managed Agents API 経由のクラウド実行に言及している

---

## TC-03: 10 ステップ pipeline が列挙されている

- **Priority**: must
- **Category**: correctness

**GIVEN** `openspec/project.md` が書き換えられた状態  
**WHEN** Pipeline の記述を参照する  
**THEN** 以下の 10 ステップが順番通りに記載されている:
1. propose
2. spec-review
3. spec-fixer
4. test-case-gen
5. implementer
6. verification
7. build-fixer
8. code-review
9. code-fixer
10. pr-create

---

## TC-04: Stack セクションに現行の依存関係が反映されている

- **Priority**: must
- **Category**: correctness

**GIVEN** `openspec/project.md` が書き換えられた状態  
**WHEN** Stack セクションを参照する  
**THEN**
- Runtime として "Bun (TypeScript)" が記載されている
- テストフレームワークとして "vitest" が記載されている
- `@anthropic-ai/claude-agent-sdk` が記載されている
- `@anthropic-ai/sdk` が記載されている
- `octokit` は記載されていない（package.json の dependencies に存在しないため）

---

## TC-05: 設計パターンが記述されている

- **Priority**: must
- **Category**: correctness

**GIVEN** `openspec/project.md` が書き換えられた状態  
**WHEN** 設計パターンのセクションを参照する  
**THEN**
- "Ports & Adapters" パターンが記載されている
- 遷移テーブル駆動の設計が記載されている
- "Step as data / Executor as behavior" の分離が記載されている
- "CommandRunner Template Method" が記載されている

---

## TC-06: 状態管理と設定の記述が正確である

- **Priority**: must
- **Category**: correctness

**GIVEN** `openspec/project.md` が書き換えられた状態  
**WHEN** 状態管理・設定セクションを参照する  
**THEN**
- ジョブ状態の永続化先として `~/.local/share/specrunner/jobs/` が記載されている
- git worktree によるジョブ隔離が記載されている
- 設定ファイルパスとして `~/.config/specrunner/config.json` が記載されている
- step-config resolution chain が 4 レベルで記載されている

---

## TC-07: Directory Structure が現行の src/ 構造を反映している

- **Priority**: should
- **Category**: correctness

**GIVEN** `openspec/project.md` が書き換えられた状態  
**WHEN** Directory Structure セクションを参照する  
**THEN**
- `src/adapter/` が存在する
- `src/cli/` が存在する
- `src/core/pipeline/`、`src/core/step/`、`src/core/runtime/` が存在する
- `src/state/`、`src/store/` が存在する
- `openspec/changes/` と `openspec/specs/` が記載されている
- `docs/adr/` が記載されている

---

## TC-08: typecheck と test が green である

- **Priority**: must
- **Category**: verification

**GIVEN** `openspec/project.md` が書き換えられた状態（ドキュメントのみの変更）  
**WHEN** `bun run typecheck && bun run test` を実行する  
**THEN**
- typecheck がエラーなしで完了する
- test suite が全件 PASS する

---

## TC-09: ファイルの先頭説明が CLI ツールとして記述されている

- **Priority**: should
- **Category**: correctness

**GIVEN** `openspec/project.md` が書き換えられた状態  
**WHEN** ファイルの先頭（ヘッダー直下）を参照する  
**THEN**
- SpecRunner が CLI ツールであることが明記されている
- "request.md を投入すると PR が返る" という核心的な説明が存在する
