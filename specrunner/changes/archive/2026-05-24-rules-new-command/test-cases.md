# Test Cases: `specrunner rules new` コマンド

## TC-RULES-001: 基本正常系 — 空ディレクトリにファイル作成
- **Category**: Happy Path
- **Priority**: must
- **Source**: request.md 要件 1, 3 / tasks.md TC-RULES-001, TC-RULES-009

**GIVEN** 有効な step-name (`implementer`) と有効な rule-slug (`no-inline-comment`) が与えられ、`specrunner/rules/implementer/` が存在しない  
**WHEN** `specrunner rules new implementer no-inline-comment` を実行する  
**THEN**
- exit code が 0 である
- `specrunner/rules/implementer/01-no-inline-comment.md` が作成される
- stdout に `specrunner/rules/implementer/01-no-inline-comment.md` が出力される

---

## TC-RULES-002: 既存ファイルあり — 次番号で採番
- **Category**: File Numbering
- **Priority**: must
- **Source**: request.md 要件 3 / tasks.md TC-RULES-004

**GIVEN** `specrunner/rules/implementer/01-no-inline-comment.md` が存在する  
**WHEN** `specrunner rules new implementer keep-types` を実行する  
**THEN**
- exit code が 0 である
- `specrunner/rules/implementer/02-keep-types.md` が作成される
- stdout に `specrunner/rules/implementer/02-keep-types.md` が出力される

---

## TC-RULES-003: 非連番の既存ファイル — max + 1 で採番
- **Category**: File Numbering
- **Priority**: must
- **Source**: request.md 要件 3 / design.md RN-1 処理フロー 3

**GIVEN** `specrunner/rules/implementer/01-foo.md` と `specrunner/rules/implementer/03-bar.md` が存在する (02 は欠番)  
**WHEN** `specrunner rules new implementer baz` を実行する  
**THEN**
- exit code が 0 である
- `specrunner/rules/implementer/04-baz.md` が作成される (max=3, next=4)

---

## TC-RULES-004: 数値プレフィックスなしファイルが混在 — NaN を除外して採番
- **Category**: File Numbering
- **Priority**: must
- **Source**: tasks.md TC-RULES-011 / design.md RN-1 処理フロー 3

**GIVEN** `specrunner/rules/implementer/README.md` のみ存在する (数値プレフィックスなし)  
**WHEN** `specrunner rules new implementer first-rule` を実行する  
**THEN**
- exit code が 0 である
- `specrunner/rules/implementer/01-first-rule.md` が作成される (NaN を除外し 01 から開始)

---

## TC-RULES-005: 無効な step-name — エラー終了 + 候補一覧
- **Category**: Step Name Validation
- **Priority**: must
- **Source**: request.md 要件 2 / tasks.md TC-RULES-002

**GIVEN** 存在しない step-name (`implmentor`) が与えられる  
**WHEN** `specrunner rules new implmentor no-inline-comment` を実行する  
**THEN**
- exit code が 2 である
- stderr に step 名が不明である旨のエラーメッセージが出力される
- stderr に有効な agent step 名の候補一覧が含まれる

---

## TC-RULES-006: CLI step name (verification) — エラー終了
- **Category**: Step Name Validation
- **Priority**: must
- **Source**: request.md 要件 2 / tasks.md TC-RULES-003

**GIVEN** CLI step の step-name (`verification`) が与えられる  
**WHEN** `specrunner rules new verification my-rule` を実行する  
**THEN**
- exit code が 2 である
- stderr にエラーメッセージと有効な agent step 名候補が出力される

---

## TC-RULES-007: CLI step name (pr-create) — エラー終了
- **Category**: Step Name Validation
- **Priority**: must
- **Source**: request.md 要件 2

**GIVEN** CLI step の step-name (`pr-create`) が与えられる  
**WHEN** `specrunner rules new pr-create my-rule` を実行する  
**THEN**
- exit code が 2 である
- stderr にエラーメッセージと有効な agent step 名候補が出力される

---

## TC-RULES-008: CLI step name (delta-spec-validation) — エラー終了
- **Category**: Step Name Validation
- **Priority**: must
- **Source**: request.md 要件 2

**GIVEN** CLI step の step-name (`delta-spec-validation`) が与えられる  
**WHEN** `specrunner rules new delta-spec-validation my-rule` を実行する  
**THEN**
- exit code が 2 である
- stderr にエラーメッセージと有効な agent step 名候補が出力される

---

## TC-RULES-009: slug に `_` が含まれる — warning + 変換後にファイル作成
- **Category**: Slug Sanitization
- **Priority**: must
- **Source**: request.md 要件 4 / tasks.md TC-RULES-005

**GIVEN** `_` を含む rule-slug (`no_inline_comment`) が与えられ、有効な step-name が使われる  
**WHEN** `specrunner rules new implementer no_inline_comment` を実行する  
**THEN**
- exit code が 0 である
- stderr に `_` → `-` 変換の warning が出力される
- `specrunner/rules/implementer/01-no-inline-comment.md` が作成される (`_` が `-` に変換される)

---

## TC-RULES-010: slug に空白が含まれる — warning + 変換後にファイル作成
- **Category**: Slug Sanitization
- **Priority**: must
- **Source**: request.md 要件 4 / tasks.md TC-RULES-006

**GIVEN** 空白を含む rule-slug (`no inline comment`) が与えられ、有効な step-name が使われる  
**WHEN** `specrunner rules new implementer "no inline comment"` を実行する  
**THEN**
- exit code が 0 である
- stderr に空白 → `-` 変換の warning が出力される
- `specrunner/rules/implementer/01-no-inline-comment.md` が作成される

---

## TC-RULES-011: 無効な slug (path traversal) — エラー終了
- **Category**: Slug Sanitization
- **Priority**: must
- **Source**: request.md 要件 4 / tasks.md TC-RULES-007

**GIVEN** `../evil` のような path traversal を含む rule-slug が与えられる  
**WHEN** `specrunner rules new implementer ../evil` を実行する  
**THEN**
- exit code が 2 である
- stderr に slug が不正である旨のエラーメッセージが出力される

---

## TC-RULES-012: 無効な slug (大文字を含む) — エラー終了
- **Category**: Slug Sanitization
- **Priority**: should
- **Source**: request.md 要件 4 / design.md RN-3 (SLUG_REGEX)

**GIVEN** 大文字を含む rule-slug (`NoInlineComment`) が与えられる  
**WHEN** `specrunner rules new implementer NoInlineComment` を実行する  
**THEN**
- exit code が 2 である
- stderr に slug が不正である旨のエラーメッセージが出力される

---

## TC-RULES-013: 同名ファイル衝突 — エラー終了 (上書き禁止)
- **Category**: Conflict Detection
- **Priority**: must
- **Source**: request.md 要件 5 / tasks.md TC-RULES-008

**GIVEN** `specrunner/rules/implementer/01-no-inline-comment.md` が既に存在する  
**WHEN** `specrunner rules new implementer no-inline-comment` を実行する (採番すると `01-` になる状況)  
**THEN**
- exit code が 1 である
- stderr にファイルが既に存在する旨のエラーメッセージが出力される
- 既存ファイルは上書きされない

---

## TC-RULES-014: 生成ファイルに推奨見出し 3 セクションが含まれる
- **Category**: Template Content
- **Priority**: must
- **Source**: request.md 要件 6 / tasks.md TC-RULES-010

**GIVEN** 有効な step-name と rule-slug が与えられる  
**WHEN** `specrunner rules new implementer my-rule` を実行する  
**THEN**
- 生成されたファイルに `## やめてほしいこと` が含まれる
- 生成されたファイルに `## こうしてほしいこと` が含まれる
- 生成されたファイルに `## 例外` が含まれる

---

## TC-RULES-015: 生成ファイルの冒頭に方針コメントが含まれる
- **Category**: Template Content
- **Priority**: must
- **Source**: request.md 要件 7 / tasks.md TC-RULES-010

**GIVEN** 有効な step-name と rule-slug が与えられる  
**WHEN** `specrunner rules new implementer my-rule` を実行する  
**THEN**
- 生成されたファイルの冒頭に `<!-- ... -->` コメントが含まれる
- コメントに「CLI はこのファイルの中身を解釈しない」旨の記述がある
- コメントに「自然文で自由に書いてよい」旨の記述がある
- コメントに「番号 prefix が follow-up の実行順序を決める」旨の記述がある
- コメントに「重要度高いものを末尾に配置する (recency bias 活用)」旨の記述がある

---

## TC-RULES-016: template が source code 内 const として保持されている
- **Category**: Template Content
- **Priority**: must
- **Source**: request.md 要件 8 / design.md D2

**GIVEN** `src/core/command/rules-new.ts` を参照する  
**WHEN** 実装を確認する  
**THEN**
- template 文字列が source code 内の string const として定義されている
- 実行時に外部ファイルを読み込む処理が存在しない

---

## TC-RULES-017: `specrunner rules --help` で usage が表示される
- **Category**: Help/Usage
- **Priority**: must
- **Source**: request.md 要件 9

**GIVEN** `specrunner rules --help` を実行する  
**WHEN** コマンドが実行される  
**THEN**
- exit code が 0 である
- stdout に Usage 行 (`specrunner rules new <step-name> <rule-slug>`) が含まれる
- stdout に有効な agent step 名一覧が含まれる
- stdout に番号 prefix の自動採番の説明が含まれる
- stdout に推奨見出しの説明が含まれる
- stdout に順序方針 (末尾優先) の説明が含まれる

---

## TC-RULES-018: `specrunner rules -h` で usage が表示される
- **Category**: Help/Usage
- **Priority**: should
- **Source**: request.md 要件 9 / design.md CR-3, Task 3-5

**GIVEN** `specrunner rules -h` を実行する  
**WHEN** コマンドが実行される  
**THEN**
- exit code が 0 である
- stdout に usage が出力される (`--help` と同等の内容)

---

## TC-RULES-019: `specrunner rules` (subcommand なし) で usage が表示される
- **Category**: Help/Usage
- **Priority**: should
- **Source**: design.md Task 3-5

**GIVEN** subcommand を指定せずに `specrunner rules` を実行する  
**WHEN** コマンドが実行される  
**THEN**
- exit code が 0 である
- stdout に usage が出力される

---

## TC-RULES-020: `specrunner --help` に Rules セクションが含まれる
- **Category**: Help/Usage
- **Priority**: must
- **Source**: request.md 受け入れ基準 / design.md CR-2

**GIVEN** `specrunner --help` を実行する  
**WHEN** コマンドが実行される  
**THEN**
- stdout に `rules new <step> <slug>` の記載が含まれる
- stdout に Rules コマンドの説明が含まれる

---

## TC-RULES-021: エラーメッセージに次アクション候補が含まれる — step 名 typo
- **Category**: Error Messages
- **Priority**: must
- **Source**: request.md 要件 10

**GIVEN** typo した step-name (`code-reveiw`) を与える  
**WHEN** `specrunner rules new code-reveiw my-rule` を実行する  
**THEN**
- exit code が 2 である
- stderr に入力した step 名が不明である旨が含まれる
- stderr に有効な agent step 名の候補一覧が含まれる (例: `code-review`, `implementer`, ...)

---

## TC-RULES-022: エラーメッセージに次アクション候補が含まれる — slug 衝突
- **Category**: Error Messages
- **Priority**: should
- **Source**: request.md 要件 10

**GIVEN** 衝突が発生するファイルが既に存在する  
**WHEN** 同名になる `specrunner rules new <step-name> <rule-slug>` を実行する  
**THEN**
- exit code が 1 である
- stderr に既存ファイル名が含まれる
- stderr に次のアクション (別の slug を使うか既存ファイルを確認する) を示唆するメッセージが含まれる

---

## TC-RULES-023: flag-parser — 複数 positional を positionals 配列で取得
- **Category**: flag-parser
- **Priority**: must
- **Source**: design.md FP-1 / tasks.md Task 1-4

**GIVEN** `parseFlags` に `["implementer", "my-rule"]` という non-flag トークンを渡す  
**WHEN** `parseFlags` を呼び出す  
**THEN**
- 返り値の `positionals` が `["implementer", "my-rule"]` である
- 返り値の `positional` が `"implementer"` (`positionals[0]` と一致) である

---

## TC-RULES-024: flag-parser — `positional` が `positionals[0]` の後方互換エイリアス
- **Category**: flag-parser
- **Priority**: must
- **Source**: design.md FP-1 / tasks.md Task 1-4

**GIVEN** 既存コマンドが `positional` フィールドを使用している  
**WHEN** `parseFlags` を呼び出す  
**THEN**
- `positional` の値が `positionals[0]` と一致し、既存ハンドラが変更なく動作する

---

## TC-RULES-025: flag-parser — count:2 で positional が 1 つのみ → FlagParseError
- **Category**: flag-parser
- **Priority**: must
- **Source**: design.md FP-2 / tasks.md Task 1-4

**GIVEN** `positionalDef: { name: "step-name rule-slug", required: true, count: 2 }` で `parseFlags` を呼び出す  
**WHEN** positional トークンが 1 つしか与えられない  
**THEN**
- `FlagParseError` がスローされる
- エラーメッセージに `requires` と引数名が含まれる

---

## TC-RULES-026: flag-parser — 既存テストの回帰なし
- **Category**: flag-parser
- **Priority**: must
- **Source**: tasks.md Task 1-4

**GIVEN** flag-parser に `positionals: string[]` が追加された  
**WHEN** 既存の `flag-parser.test.ts` テストを実行する  
**THEN**
- 既存テストが全て pass する (破壊的変更なし)

---

## TC-RULES-027: noun-verb 構造 — 将来の拡張を阻害しない
- **Category**: CLI Surface
- **Priority**: should
- **Source**: request.md 要件 11 / design.md CR-1

**GIVEN** `command-registry.ts` の `rules` エントリを参照する  
**WHEN** 実装を確認する  
**THEN**
- `rules` が `subcommands` を持つ parent command として登録されている
- `new` が subcommand として登録されており、`ls` や `show` を後追い追加できる構造になっている

---

## TC-RULES-028: step-name の hardcode がない
- **Category**: CLI Surface
- **Priority**: must
- **Source**: request.md 設計判断 D3 / design.md RN-1

**GIVEN** `src/core/command/rules-new.ts` および関連ファイルを参照する  
**WHEN** 実装を確認する  
**THEN**
- step 名が `AGENT_STEP_NAMES` から import されており、CLI 側で step 名がハードコードされていない
- `grep-no-step-name-hardcode.test.ts` (既存) が pass する

---

## TC-RULES-029: typecheck + test が green
- **Category**: Build
- **Priority**: must
- **Source**: request.md 受け入れ基準

**GIVEN** 全実装が完了している  
**WHEN** `bun run typecheck && bun run test` を実行する  
**THEN**
- 型エラーが 0 件である
- 全テストが pass する
