# Test Cases: request-review-system-refinement

Generated: 2026-05-15  
Source tasks: tasks.md (Task 1–8)  
Acceptance criteria: request.md § 受け入れ基準

---

## TC-01: Prompt に design 領域の評価指示が含まれない

- **Category**: prompt-scope
- **Priority**: must
- **Source**: Task 1 § 削除する要素, request.md 受け入れ基準 #1

**GIVEN** `src/prompts/request-review-system.ts` の実装後  
**WHEN** `REQUEST_REVIEW_SYSTEM_PROMPT` の文字列を検査する  
**THEN**
- `Design Evaluation` の文字列が存在しない
- `Trade-off Analysis` の文字列が存在しない
- `Anti-Pattern Detection` の文字列が存在しない
- `God Object`, `Tight Coupling` 等の実装パターン名が存在しない
- `Design Principles` セクションが存在しない
- `Domain Cluster` の文字列が存在しない
- `Alternative Proposals` の文字列が存在しない

---

## TC-02: Prompt が 4 Step 構成になっている

- **Category**: prompt-scope
- **Priority**: must
- **Source**: Task 1 § Review Process（4 Step）, design.md D1

**GIVEN** `REQUEST_REVIEW_SYSTEM_PROMPT` の実装後  
**WHEN** prompt のステップ構成を検査する  
**THEN**
- Step 1 が `Codebase Context` または相当する名称で存在する
- Step 2 が `Request Validation` または相当する名称で存在する
- Step 3 が `External Dependency Check` または相当する名称で存在する
- Step 4 が `Scope Sanity Check` または相当する名称で存在する
- Step 5 / Step 6 に相当するステップが存在しない（旧 Domain Synthesis / Devil's Advocate）

---

## TC-03: Severity Scope Constraint が prompt に明示されている

- **Category**: prompt-scope
- **Priority**: must
- **Source**: Task 1 § 追加する要素, request.md 受け入れ基準 #2

**GIVEN** `REQUEST_REVIEW_SYSTEM_PROMPT` の実装後  
**WHEN** severity 判定基準の記述を検査する  
**THEN**
- `HIGH` = request 自体の欠陥（ゴール不明、受け入れ基準不在、外部制約の検証漏れ）に限定することが明示されている
- `MEDIUM` = scope の曖昧さ・推奨追記に対応することが明示されている
- `LOW` = 表現の改善余地に対応することが明示されている
- 実装設計の指摘（クラス境界、API 契約、内部 trade-off 等）は severity 対象外であることが明示されている

---

## TC-04: Exclusion clause が prompt に含まれている

- **Category**: prompt-scope
- **Priority**: must
- **Source**: Task 1 § 追加する要素, design.md D1

**GIVEN** `REQUEST_REVIEW_SYSTEM_PROMPT` の実装後  
**WHEN** prompt の除外条件記述を検査する  
**THEN**
- 「コンポーネント責任配置」「API 契約」「内部実装の trade-off」「エラーハンドリング戦略」は design agent の責務であり findings に含めてはならないという主旨の記述が存在する

---

## TC-05: Output format — findings テーブルが新カラム構成になっている

- **Category**: prompt-scope
- **Priority**: must
- **Source**: Task 1 § Output Format の変更

**GIVEN** `REQUEST_REVIEW_SYSTEM_PROMPT` の実装後  
**WHEN** prompt の output format セクションを検査する  
**THEN**
- Findings テーブルのカラムに `#`（番号）、`Severity`、`Category`、`Description`、`Location`（optional）、`Recommendation`（optional）が含まれている
- `architecture` / `performance` / `security` 等の実装系カテゴリが categories リストに含まれない
- 有効な categories は `requirements`, `scope`, `acceptance-criteria`, `external-dependency`, `clarity`, `feasibility` に絞られている

---

## TC-06: JSON schema に number / location / recommendation フィールドが含まれている

- **Category**: prompt-scope
- **Priority**: must
- **Source**: Task 1 § JSON block の変更

**GIVEN** `REQUEST_REVIEW_SYSTEM_PROMPT` の実装後  
**WHEN** prompt の JSON output schema 例を検査する  
**THEN**
- `findings` 配列の各要素に `number` フィールドが存在する（1-indexed）
- `location` フィールドが optional として記載されている
- `recommendation` フィールドが optional として記載されている
- prompt 内に「summary 文中の `#N` 参照は findings の number と一致させること」という指示が含まれている

---

## TC-07: Verdict 導出ルールが変更されていない

- **Category**: verdict-derivation
- **Priority**: must
- **Source**: Task 1 § Verdict Derivation Rules, request.md 要件 #3

**GIVEN** `REQUEST_REVIEW_SYSTEM_PROMPT` の実装後  
**WHEN** verdict 導出ルールの記述を検査する  
**THEN**
- HIGH 0 件 = `approve` であることが明示されている
- HIGH 1 件以上 = `needs-discussion` であることが明示されている
- 複数 HIGH + 矛盾 = `reject` であることが明示されている
- MEDIUM のみの場合は `approve`（findings は情報提供として出力）であることが明示されている

---

## TC-08: RequestReviewFinding 型に number フィールドが追加されている

- **Category**: type-definition
- **Priority**: must
- **Source**: Task 2, request.md 要件 #7

**GIVEN** `src/core/request/reviewer.ts` の実装後  
**WHEN** `RequestReviewFinding` interface の定義を検査する  
**THEN**
- `number: number` フィールドが存在する（1-indexed の stable 番号）
- `location?: string` フィールドが存在する（optional）
- `recommendation?: string` フィールドが存在する（optional）
- 既存の `severity`, `category`, `description` フィールドが維持されている

---

## TC-09: parseReviewOutput — number フィールドありの JSON は number が保持される

- **Category**: parse-fallback
- **Priority**: must
- **Source**: Task 3, tasks.md TC-RVR-012

**GIVEN** `number` フィールドを含む findings JSON（例: `[{"number": 1, "severity": "HIGH", ...}, {"number": 2, ...}]`）  
**WHEN** `parseReviewOutput()` を呼ぶ  
**THEN**
- `findings[0].number === 1`
- `findings[1].number === 2`
- JSON に指定された number 値がそのまま保持される（上書きされない）

---

## TC-10: parseReviewOutput — number フィールドなしの JSON は index+1 で自動付与される

- **Category**: parse-fallback
- **Priority**: must
- **Source**: Task 3, tasks.md TC-RVR-013, design.md D6

**GIVEN** `number` フィールドを含まない findings JSON（旧形式の出力）  
**WHEN** `parseReviewOutput()` を呼ぶ  
**THEN**
- `findings[0].number === 1`（index 0 + 1）
- `findings[1].number === 2`（index 1 + 1）
- parse エラーは発生しない

---

## TC-11: parseReviewOutput — location / recommendation optional フィールドの parse

- **Category**: parse-fallback
- **Priority**: must
- **Source**: Task 3, tasks.md TC-RVR-014, design.md D6

**GIVEN** `location` と `recommendation` を持つ finding と、持たない finding が混在する JSON  
**WHEN** `parseReviewOutput()` を呼ぶ  
**THEN**
- `location` が存在する finding は `finding.location` に値が入る
- `location` が存在しない finding は `finding.location === undefined`
- `recommendation` が存在する finding は `finding.recommendation` に値が入る
- `recommendation` が存在しない finding は `finding.recommendation === undefined`
- parse エラーは発生しない

---

## TC-12: formatHumanReadable — findings ありの場合のフォーマット（verdict + summary + findings 全件）

- **Category**: output-format
- **Priority**: must
- **Source**: Task 4, tasks.md TC-RVR-015, request.md 受け入れ基準 #4

**GIVEN** verdict = `"needs-discussion"`, summary = `"..."`, findings 2 件（#1 HIGH, #2 MEDIUM）を持つ `RequestReviewResult`  
**WHEN** `formatHumanReadable(result)` を呼ぶ  
**THEN**
- 出力が `## Verdict: needs-discussion` を含む
- 出力が summary の文字列を含む
- 出力が `#1 [HIGH]` を含む
- 出力が `#2 [MEDIUM]` を含む
- findings 間に空行が 1 行ある
- `## Findings` セクションヘッダーが存在する

---

## TC-13: formatHumanReadable — findings なしの場合は "No findings." のみ

- **Category**: output-format
- **Priority**: must
- **Source**: Task 4, tasks.md TC-RVR-016, request.md 受け入れ基準 #6, 要件 #6

**GIVEN** findings が空配列の `RequestReviewResult`  
**WHEN** `formatHumanReadable(result)` を呼ぶ  
**THEN**
- 出力が `No findings.` を含む
- `## Findings` セクションヘッダーが存在しない（または findings リストが空）
- `#1` のような finding エントリが出力されない

---

## TC-14: formatHumanReadable — location が存在する場合は Location 行を出力する

- **Category**: output-format
- **Priority**: must
- **Source**: Task 4, tasks.md TC-RVR-017, design.md D4

**GIVEN** `location = "request.md § 要件"` を持つ finding 1 件  
**WHEN** `formatHumanReadable(result)` を呼ぶ  
**THEN**
- `Location: request.md § 要件` を含む行が出力される

---

## TC-15: formatHumanReadable — location が存在しない場合は Location 行を出力しない

- **Category**: output-format
- **Priority**: must
- **Source**: Task 4, tasks.md TC-RVR-017, design.md D4

**GIVEN** `location` が undefined の finding 1 件  
**WHEN** `formatHumanReadable(result)` を呼ぶ  
**THEN**
- `Location:` を含む行が出力されない

---

## TC-16: formatHumanReadable — recommendation が存在する場合は → 行を出力する

- **Category**: output-format
- **Priority**: must
- **Source**: Task 4, tasks.md TC-RVR-017, design.md D4

**GIVEN** `recommendation = "Add explicit error recovery criteria."` を持つ finding 1 件  
**WHEN** `formatHumanReadable(result)` を呼ぶ  
**THEN**
- `→ Add explicit error recovery criteria.` を含む行が出力される

---

## TC-17: formatHumanReadable — recommendation が存在しない場合は → 行を出力しない

- **Category**: output-format
- **Priority**: must
- **Source**: Task 4, tasks.md TC-RVR-017, design.md D4

**GIVEN** `recommendation` が undefined の finding 1 件  
**WHEN** `formatHumanReadable(result)` を呼ぶ  
**THEN**
- `→` を含む行が finding エントリ内に出力されない

---

## TC-18: formatHumanReadable — summary 中の #N 参照が findings number と一致する

- **Category**: output-format
- **Priority**: must
- **Source**: Task 4, tasks.md TC-RVR-018, request.md 受け入れ基準 #5

**GIVEN** summary = `"特に #1 と #2 は設計判断が必要"`, findings = `[{number:1, ...}, {number:2, ...}]`  
**WHEN** `formatHumanReadable(result)` を呼ぶ  
**THEN**
- 出力中の summary テキストに `#1` が存在する
- findings セクションに `#1` のエントリが存在する
- 出力中の summary テキストに `#2` が存在する
- findings セクションに `#2` のエントリが存在する
- summary が参照している番号と findings の番号が整合している

---

## TC-19: formatHumanReadable が reviewer.ts から export されている

- **Category**: type-definition
- **Priority**: must
- **Source**: Task 4 § 完了条件

**GIVEN** `src/core/request/reviewer.ts` の実装後  
**WHEN** `import { formatHumanReadable } from "../request/reviewer.js"` を検査する  
**THEN**
- `formatHumanReadable` が named export として存在する
- `bun run typecheck` が green

---

## TC-20: executeReview の default 出力が formatHumanReadable を使用している

- **Category**: output-format
- **Priority**: must
- **Source**: Task 5, request.md 受け入れ基準 #4

**GIVEN** `src/core/command/request-review.ts` の実装後  
**WHEN** `opts.json` が false（default モード）のコードパスを検査する  
**THEN**
- `formatHumanReadable(result)` が呼び出される
- `result.summary` のみを直接 write するコードが存在しない

---

## TC-21: executeReview の --json モードの出力が不変

- **Category**: json-compatibility
- **Priority**: must
- **Source**: Task 5, request.md 受け入れ基準 #6, 要件 #5

**GIVEN** `opts.json === true` のコードパス  
**WHEN** `executeReview()` を実行する  
**THEN**
- `JSON.stringify(result, null, 2)` がそのまま stdout に出力される
- `formatHumanReadable()` は呼ばれない
- JSON 出力の既存フィールド（`verdict`, `summary`, `findings`, `findings[].severity`, `findings[].category`, `findings[].description`）の構造・意味が変わらない
- `number`, `location`, `recommendation` フィールドが追加されているが既存フィールドは変更なし（additive change）

---

## TC-22: buildInitialMessage が新しい 4 Step 名を参照している

- **Category**: prompt-scope
- **Priority**: should
- **Source**: Task 6, design.md D5

**GIVEN** `src/core/request/reviewer.ts` の実装後  
**WHEN** `buildInitialMessage()` の戻り値を検査する  
**THEN**
- 「コードベース文脈把握」「要件検証」「外部依存チェック」「Scope 妥当性検証」（または英語相当語句）が含まれる
- 旧ステップ名「設計評価」「トレードオフ分析」「Domain Synthesis」「Devil's Advocate」が含まれない

---

## TC-23: TC-RVR-001 — parseReviewOutput の既存テストに number assertion が追加されている

- **Category**: test-coverage
- **Priority**: must
- **Source**: Task 7 § 既存テスト更新

**GIVEN** `tests/unit/core/request/reviewer.test.ts` の実装後  
**WHEN** TC-RVR-001 のテストケースを検査する  
**THEN**
- `findings[0].number === 1` の assertion が存在する

---

## TC-24: TC-RVR-009 — buildInitialMessage の既存テストが新ステップ名を確認している

- **Category**: test-coverage
- **Priority**: should
- **Source**: Task 7 § 既存テスト更新

**GIVEN** `tests/unit/core/request/reviewer.test.ts` の実装後  
**WHEN** TC-RVR-009 のテストケースを検査する  
**THEN**
- 新しいステップ名（Codebase Context / Request Validation / External Dependency Check / Scope Sanity Check または相当語句）の包含確認が assertion に含まれる

---

## TC-25: Unit tests TC-RVR-012 〜 TC-RVR-018 が全て存在し pass する

- **Category**: test-coverage
- **Priority**: must
- **Source**: Task 7 § 新規テスト

**GIVEN** `tests/unit/core/request/reviewer.test.ts` の実装後  
**WHEN** `bun run test` を実行する  
**THEN**
- TC-RVR-012: `parseReviewOutput` — number フィールドありで number が保持される
- TC-RVR-013: `parseReviewOutput` — number フィールドなしで index+1 が付与される
- TC-RVR-014: `parseReviewOutput` — location / recommendation optional の parse
- TC-RVR-015: `formatHumanReadable` — findings ありのフォーマット検証
- TC-RVR-016: `formatHumanReadable` — findings なしで `No findings.` 表示
- TC-RVR-017: `formatHumanReadable` — optional フィールド省略時に対応行が出ない
- TC-RVR-018: `formatHumanReadable` — summary 中の `#N` が findings number と一致
- 全テストケースが pass する

---

## TC-26: typecheck && test が green

- **Category**: build
- **Priority**: must
- **Source**: Task 8, request.md 受け入れ基準 #8

**GIVEN** 全 Task（1–7）の実装完了後  
**WHEN** `bun run typecheck && bun run test` を実行する  
**THEN**
- `bun run typecheck` が exit code 0 で終了する
- `bun run test` が exit code 0 で終了する
- 型エラーが 0 件
- テスト失敗が 0 件

---

## TC-27: design 領域の指摘が HIGH にならない（定性的・観察的）

- **Category**: prompt-scope
- **Priority**: should
- **Source**: request.md 受け入れ基準 #3, 背景 § 問題 1

**GIVEN** 改修後の `REQUEST_REVIEW_SYSTEM_PROMPT` を使用する review セッション  
**WHEN** 本 request（`request-review-system-refinement`）自体を review にかける  
**THEN**
- 「StepExecutor vs Pipeline の責任境界」のような実装設計指摘が HIGH で出ない
- verdict が `needs-discussion` で停まらず `approved` または `approved`（MEDIUM findings あり）に到達する
- review iteration 数が旧 prompt より少ない（4 周 → 1〜2 周程度に収束）

---

## TC-28: MEDIUM findings のみの場合 verdict が approved になる

- **Category**: verdict-derivation
- **Priority**: must
- **Source**: request.md 要件 #3, design.md D2

**GIVEN** HIGH finding が 0 件、MEDIUM finding が 1 件以上存在する parse 結果  
**WHEN** verdict 導出ロジックを実行する（または `parseReviewOutput` の結果を検査する）  
**THEN**
- `result.verdict === "approved"`
- findings は情報提供として出力される（`formatHumanReadable` で findings セクションに表示される）
