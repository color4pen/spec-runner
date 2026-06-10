# Tasks: request の現状コード断定を design / request-review が実コードと突き合わせる

## T-01: request scaffold に任意節「## 現状コードの前提」を追加する

- [x] `src/core/command/request.ts` の `buildScaffoldTemplate()` 内 literal で、`## 背景` ブロックと `## 要件` ブロックの間に `## 現状コードの前提` 節を挿入する（D3）
- [x] 節の直下に書き手向けの HTML コメントを添える。コメントは次の3点を含むこと:
  - 現状コードについての断定（「今のコードはこうなっている」）は file:line を伴ってこの節に書く
  - これらは未検証の前提として扱われ、design / request-review が実コードと突き合わせる
  - 意図・方針・将来の構想はこの節の対象外
- [x] 節はプレースホルダ行（例: `- <file:line を伴う現状コードの断定（任意）>`）を 1 行置き、節を空にしない
- [x] 既存の節（背景 / 要件 / スコープ外 / 受け入れ基準 / architect 評価済みの設計判断）と Meta は変更しない
- [x] `request new` 側（`src/core/command/request-new.ts`）は `buildScaffoldTemplate()` を共有するため追加編集不要であることを確認する（D2）

**Acceptance Criteria**:
- `buildScaffoldTemplate()` / `executeTemplate()` の出力に `## 現状コードの前提` heading と上記コメントが含まれる
- `request new`（`executeNew`）の生成ファイルにも同節が含まれる
- 生成された scaffold が `parseRequestMdContent()` を例外なく通過する

## T-02: scaffold 出力テストを更新する

- [x] `tests/unit/core/command/request.test.ts` の `TC-REQ-001`「includes all required sections」に、出力へ `## 現状コードの前提` 節とコメント断片（例: `file:line`）が含まれることの assertion を追加する
- [x] 既存の `buildScaffoldTemplate()` が `parseRequestMdContent()` を通る assertion（TC-REQ-001）が引き続き green であることを確認する

**Acceptance Criteria**:
- `tests/unit/core/command/request.test.ts` が green
- 追加 assertion が `## 現状コードの前提` 節とコメントの存在を検証している

## T-03: validate が新節を必須としないことを回帰テストで固定する

- [x] `## 現状コードの前提` を **持たない** request.md を入力に、`executeValidate()`（または `parseRequestMdContent()`）が exit 0 / 例外なしで通ることを検証するテストケースを `tests/unit/core/command/request.test.ts` に追加する（要件 4）
- [x] `src/parser/rules/` に required-section rule を追加しないこと（節の必須化はしない）

**Acceptance Criteria**:
- 節を持たない request が `request validate` で green（exit 0）のまま
- `src/parser/rules/` に新たな required-section rule が追加されていない

## T-04: request-generate prompt に任意節の生成指示を追加する

- [x] `src/prompts/request-generate-system.ts` に、「## 現状コードの前提」を **任意（optional）** セクションとして案内する記述を追加する（D4）。既存「目的」セクションと同様の optional 表現にする
- [x] 案内文に「file:line または具体的なシンボル名・ファイルパスを伴う現状コードの断定をここに書く」「意図・方針・将来の話は対象外」を含める
- [x] "Your output MUST include all of the following sections in order" の **必須リストには追加しない**（必須化しない）

**Acceptance Criteria**:
- `REQUEST_GENERATE_SYSTEM_PROMPT` に「現状コードの前提」と任意/optional を示す表現が含まれる
- 必須セクション一覧（MUST include）に「現状コードの前提」が含まれない

## T-05: request-review prompt に突き合わせ観点と severity 規定を追加する

- [x] `src/prompts/request-review-system.ts` の Review Process に工程を追加する: file:line または具体的なシンボル名・ファイルパスを伴う現状コードの断定（**節の内外を問わず request 全体が対象**）を、既存の read-only 探索権限（Read / Grep / Glob）で実コードと突き合わせ、不一致を findings に載せる
- [x] 不一致 finding の severity を **high** と規定する。Severity 定義（high）に「現状コード断定と実コードの不一致」を追加する
- [x] 突き合わせ対象（file:line / 具体シンボル名 / ファイルパスを伴う現状の断定）と対象外（意図・方針・将来の話）を明記する（要件 5）
- [x] 既存の read-only 制約（ファイル編集禁止）と矛盾しない範囲で記述する

**Acceptance Criteria**:
- `REQUEST_REVIEW_SYSTEM_PROMPT` に現状断定の突き合わせ観点、severity high 規定、対象/対象外の定義が含まれる
- 既存の read-only / verdict 関連の記述が壊れていない

## T-06: request-review prompt のテストを追加する

- [x] `tests/prompts/request-review-system.test.ts`（新規）または既存 prompts テストに、`REQUEST_REVIEW_SYSTEM_PROMPT` が突き合わせ観点・severity high・対象/対象外定義を含むことの content assertion を追加する

**Acceptance Criteria**:
- 追加テストが green で、上記 prompt 内容を検証している

## T-07: design prompt に前提検証工程と不一致報告経路を追加する

- [x] `src/prompts/design-system.ts`（`DESIGN_BASE`）に工程を明記する: request 内の現状コード断定（file:line / 具体シンボル名 / ファイルパスを伴うもの、**request 全体が対象**）を設計の前提にする前に Read / Grep で実コードと突き合わせる
- [x] 不一致を発見した場合は誤った前提のまま設計せず、`report_result` を **ok=false + reason** で呼んで報告する旨を明記する（既存 Completion セクションの ok=false 経路と整合させる）
- [x] 突き合わせ対象と対象外（意図・方針・将来の話は対象外）を明記する（要件 5）
- [x] 既存の path-fence / Completion Checklist など他セクションを壊さない

**Acceptance Criteria**:
- `DESIGN_SYSTEM_PROMPT` に前提検証工程、不一致時の ok=false + reason 報告経路、対象/対象外の定義が含まれる
- 既存の design-system テスト（`tests/prompts/design-system.test.ts` / `tests/unit/prompts/design-system.test.ts`）が green

## T-08: design prompt のテストを追加する

- [x] `tests/prompts/design-system.test.ts` に、`DESIGN_SYSTEM_PROMPT` が前提検証工程と ok=false + reason 報告経路を含むことの content assertion を追加する

**Acceptance Criteria**:
- 追加テストが green で、上記 prompt 内容を検証している

## T-09: 全体検証

- [x] `bun run typecheck && bun run test` が green
- [x] `bun run lint` が green
- [x] `specrunner request template` の出力に `## 現状コードの前提` 節とコメントが含まれることを目視確認する

**Acceptance Criteria**:
- typecheck / test / lint がすべて green
- `request template` 出力に新節が含まれることを確認済み
