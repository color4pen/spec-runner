# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### spec.md

全 7 要件と各シナリオを確認した。

- **CommandSpec ツリーの handler は named reference のみ**: `handler.name === "handler"` による runtime 検査で anonymous inline handler を検出する仕組みを確認。ES2015+ のプロパティ名推論（`{ handler: async () => {} }` → `.name === "handler"`）は技術的に正しく、Bun（V8 互換）でも成立する。
- **command-registry.ts の process.exit が 0 件**: T-16 完了後にコメント除去 + テキスト検索で確認する設計。
- **handler → registry の value import 禁止**: D2（CommandHandler 型の中立モジュール移動）+ D4（import 解析 ratchet）の組み合わせで防止。
- **CLI 契約の唯一の正本**: ratchet check 4 で `export const COMMANDS` を持つファイルを列挙し `command-registry.ts` 以外を検出。
- **CLI 契約の同一性**: T-01 で snapshot を生成し T-18 で再確認する二段構え。
- **既存テストが green を維持**: 期待値の変更禁止が明示されており、テスト一覧（command-registry-resume.test.ts 他）も明示されている。
- **USAGE 定数の import 互換性**: ARCHIVE_USAGE のみ archive.ts に移動して re-export、他は残留。ベースライン（line 1342: `stderrWrite(ARCHIVE_USAGE)`）を確認し、LOGIN_USAGE / REOPEN_USAGE / JOB_RESUME_USAGE はすべて `help.detail` のみ参照であることを確認した。
- **process.exit 件数の不変性**: R3a スコープで削減しないという制約が明示されており、T-18 でメトリクス比較する。

### design.md

- **D1 handler 配置**: 29 件の inline handler（`grep -c "handler: async"` = 29 実測）を既存モジュール拡張 + 最小新規ファイルで分散する設計。全 29 件を T-03〜T-15 が網羅していることを、行番号とコマンドパスを突き合わせて確認した。
- **D2 CommandHandler 型移動**: `command-handler.ts` 新規作成 → `command-registry.ts` は re-export のみ。循環防止として有効。
- **D3 USAGE 定数帰属**: ARCHIVE_USAGE のみ移動（ハンドラ内 `stderrWrite` で参照）、他は registry 残留。handler 呼び出し側の参照がないことをソースで確認。
- **D4 ratchet 実装**: 4 つのチェック（handler.name / process.exit / import graph / 並行正本）の設計を確認。`@typescript-eslint/parser` が既存 devDependency であることを `package.json` で確認済み。
- **D5 CLI contract snapshot**: `normalizeCommandsTree` 方式（path / flags / aliases / requiresRepo / worktreeGuard）をシリアライズして vitest snapshot で固定する設計。

### tasks.md

- T-01〜T-18 の全タスクを通読。29 件の inline handler が T-03〜T-15 で漏れなく抽出されることを手動カウントで確認（T-03:3 + T-04:5 + T-06:2 + T-07:3 + T-08:1 + T-09:2 + T-10:1 + T-11:3 + T-12:3 + T-13:2 + T-14:2 + T-15:2 = 29）。
- T-05 は `runJobHandler`（anonymous ではなく named だが registry 内定義）の `run.ts` 移動も対象とし、`resolveSlugForDetach` の移動も含む。
- T-16 は business logic import の完全除去（fs / path / credential / GitHub client 等）を担当。TC-022 が対応する検証テスト。
- T-17 が architecture ratchet の 4 チェック全てを実装。T-18 が最終確認とメトリクス収集。

### test-cases.md

- 25 件（unit 23 + gate 2、manual 0）の TC を確認。
- must: 13 / should: 11 / could: 1 の優先度分布を手動確認（一致）。
- 各 TC の Source（spec.md > Scenario または design.md / tasks.md セクション）追跡を抜き打ちで確認。TC-009 / TC-011 は gate TC で verification コマンドが明記されている。
- TC-022 が T-16 の import 除去を網羅的に確認（value import 一覧が明示）。
- TC-025 が ratchet の 4 チェックすべてを unit test として検証。

### ベースライン実測値（参照）

| 項目 | 値 |
|---|---|
| command-registry.ts 行数 | 1,696 |
| inline handler 数 (`handler: async`) | 29 |
| registry 内 process.exit 件数 | 67 |
| 既存 CLI テストファイル数（`__tests__/`） | 18 |
| @typescript-eslint/parser devDependency | ✓ |
| 既存 CLI モジュールの command-registry value import | 0 件（clean） |

---

## 検証できなかった項目

- **ratchet check 3 の実行**: `@typescript-eslint/parser` による AST 解析の実際の動作（test 実行なし）。ただし同 parser の `parse()` API は公開 API であり、設計自体は技術的に妥当と判断。
- **全 29 件の handler 実装詳細の行動等価確認**: 各 inline handler のロジックをソースで確認したが、抽出後コードの等価性は implementation 段階で検証される（TC-009 / TC-011 / verification step）。

---

## Findings 詳細

### [低] ratchet check 3 のスコープが T-03〜T-15 の列挙ファイルに限定されている

**design.md D4 / tasks.md T-17（チェック 3）**

設計では「handler modules（T-03〜T-15 で作成・変更した各 `src/cli/*.ts`）の import 宣言を解析し、command-registry への value import が 0 件であることを確認する」としている。これは実装時に特定ファイルのハードコードリストになる見込みである。

将来、新たな `src/cli/` ハンドラモジュールが追加された際にそのリストを更新しなければ、当該モジュールの循環 import が検出されない。より堅牢な実装は、`src/cli/` 配下の全 `.ts` ファイルから `command-registry.ts` を除外して検査することである。

**影響**: R3a 自体の正しさには影響しない（現時点での全ハンドラファイルがリストに含まれる）。将来の維持コストに影響する軽微な設計ギャップ。

fixable: T-17 の説明文に「全 src/cli/*.ts から command-registry.ts を除いたファイルを検査する」と明記するか、実装コードでファイルを動的に探索するよう変更することで解消できる。
