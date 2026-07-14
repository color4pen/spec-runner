# Tasks: post-work の決定論的 self-check を outputContract（detect→repair）へ移す

## T-01: `OutputContract` port に `"content-format"` kind と検査記述子を追加する

- [x] `src/core/port/output-contract.ts` の `OutputContractKind` に `"content-format"` を追加する
- [x] `ContentFormatCheck` interface を追加する（`label: string`・`pattern: string`・`flags?: string`）
- [x] `OutputContract` に任意フィールド `checks?: ContentFormatCheck[]` を追加する
- [x] `OutputContractKind` の doc コメントに `"content-format"` の意味（宣言 check の regex を
      comment 除去後 content に対し評価、match しない check が失敗）を追記する
- [x] `OutputViolation.detail` の doc に content-format の場合の意味（失敗した check の label 配列）を追記する

**Acceptance Criteria**:
- `OutputContractKind` が `"produced" | "tasks-complete" | "content-format"` である
- `ContentFormatCheck` が export され、`OutputContract.checks` が `ContentFormatCheck[] | undefined` 型を取る
- 既存の produced / tasks-complete 契約の型・doc は無変更で維持される
- `typecheck` が green

## T-02: 検査純関数を `output-verify.ts` に追加し、repair 文言を拡張する

- [x] `src/core/step/output-verify.ts` に `stripHtmlComments(md: string): string` を追加する
      （`<!-- ... -->` を複数行・非貪欲で除去）
- [x] `evaluateContentFormatChecks(content: string | null, checks: ContentFormatCheck[]): string[]` を追加する
      （`content === null` は全 label 失敗、それ以外は `stripHtmlComments` 後に各 pattern を test し
      match しない check の label を返す純関数）
- [x] `buildOutputFollowUpPrompt` に `content-format` violation の分岐を追加する
      （対象 path と失敗した check label を列挙し、該当ファイルを読んで形式を直す指示。
      tool call の生成・修正は指示しない）

**Acceptance Criteria**:
- `stripHtmlComments` が単一行・複数行の HTML コメントを除去し、コメント外テキストを保持する（unit test）
- `evaluateContentFormatChecks` が valid content で `[]`、違反 content で失敗 label 配列、
  `null` で全 label を返す（unit test）
- `buildOutputFollowUpPrompt` が content-format violation の path と失敗 label を prompt に含む（unit test）
- 生成される content-format repair 文言が `report_result` を含まない（越境不変）
- 既存の tasks-complete / produced 分岐の出力は無変更（既存 `tests/unit/step/output-verify.test.ts` が
  content-format 追加以外は無改変で green）
- `typecheck && test` が green

## T-03: local runtime の `validateStepOutputs` に content-format 検出を実装する

- [x] `src/core/runtime/local.ts` の `validateStepOutputs` に `contract.kind === "content-format"` 分岐を追加する
- [x] worktree 上の `contract.path` を読み（欠落時は content=null）、`evaluateContentFormatChecks(content, contract.checks ?? [])`
      を呼び、失敗 label が非空なら violation（`detail = 失敗 label`）を push する
- [x] runtime 側に正規表現・ドメイン知識を置かない（純関数へ委譲）

**Acceptance Criteria**:
- valid なファイルに対し content-format 契約が violation 0 件（unit test）
- invalid なファイル（宣言 check の一部に違反）に対し失敗 label を含む violation を返す（unit test）
- 欠落ファイルに対し violation を返す（unit test）
- 既存 produced / tasks-complete の検出挙動は無変更
- `typecheck && test` が green

## T-04: managed runtime の `validateStepOutputs` に content-format 検出を実装する

- [x] `src/core/runtime/managed.ts` の `validateStepOutputs` に `contract.kind === "content-format"` 分岐を追加する
- [x] `githubClient.getRawFile` で branch 上の `contract.path` を読み（null 時は欠落扱い）、
      local と同一の `evaluateContentFormatChecks` を呼び、失敗 label が非空なら violation を push する
- [x] branch 未設定（`branch === null`）時は既存分岐と同様に violation として扱う

**Acceptance Criteria**:
- valid / invalid いずれも local runtime と同一判定になる（unit test、`getRawFile` を mock）
- 検査ロジックは `evaluateContentFormatChecks` に委譲され、managed 側に regex を持たない
- 既存 produced / tasks-complete の検出挙動は無変更
- `typecheck && test` が green

## T-05: design step の形式 self-check を content-format 契約へ移す

- [x] `src/core/step/design.ts` から `followUpPrompt`（Requirement / Scenario / SHALL の presence self-fix 全文）を削除する
- [x] `outputContracts(state, deps)` を追加し、`isSpecRequired(deps.request.type)` が true のときだけ
      `${changeFolderPath(deps.slug)}/spec.md` に対する content-format 契約（`policy: "follow-up"`）を返す。
      false のときは `[]` を返す
- [x] 契約の checks は document-level presence の 3 件:
      (1) `### Requirement:` header（`^###\s+Requirement:` / `m`）、
      (2) `#### Scenario:`（`^####\s+Scenario:` / `m`）、
      (3) normative keyword（`\b(SHALL|MUST)\b`）。label は doc-level presence を表す文言にする

**Acceptance Criteria**:
- `DesignStep.followUpPrompt` が `undefined`（移設した決定論的形式検査の記述が無い）
- spec 必須 type（new-feature / spec-change / refactoring / bug-fix）で `outputContracts` が
  spec.md の content-format 契約（policy follow-up）を 1 件返す（unit test）
- spec-exempt type（chore）で `outputContracts` が spec.md の content-format 契約を返さない（unit test）
- valid な spec.md（Requirement/Scenario/SHALL 有）→ 検出 follow-up violation 0 件、
  invalid（Scenario 欠落）→ violation 発火（unit test、実 `validateStepOutputs` を用いる）
- `typecheck && test` が green

## T-06: code-review のテーブル形式検査を content-format 契約へ移し、followUpPrompt を残余へ縮める

- [x] `src/core/step/code-review.ts` に `outputContracts(state, deps)` を追加し、その iteration の
      review-feedback path（`buildReviewFeedbackPath` / `writes()` と同一）に対する content-format 契約
      （`policy: "follow-up"`）を返す
- [x] 契約の checks は 2 件:
      (1) Findings がヘッダー行 + 区切り行を持つ Markdown テーブル形式（区切り行 `|---|...` の存在）、
      (2) 必須 7 カラム（# / Severity / Category / File / Description / How to Fix / Fix）を含むヘッダー行の存在
- [x] `followUpPrompt` から item 1（テーブル形式）と item 2（必須カラム）を削除し、
      item 3（Fix カラムの値 yes/no）と item 4（severity 定義整合）だけを残して 2 項目に採番し直す。
      intro（review-feedback を Read tool で読む）と action（review-feedback ファイルを修正）は保持する

**Acceptance Criteria**:
- `CodeReviewStep.outputContracts` が review-feedback path の content-format 契約（policy follow-up）を返す（unit test）
- valid な review-feedback（7 カラムヘッダー + 区切り行）→ 検出 follow-up violation 0 件、
  invalid（テーブル/カラム欠落）→ violation 発火（unit test、実 `validateStepOutputs` を用いる）
- 指摘ゼロ（本体行なしの空テーブル）の review-feedback で violation 0 件（approved の false positive を防ぐ）
- `followUpPrompt` に移設した決定論的形式検査の記述（テーブル形式指示・7 カラム列挙）が無い
- `followUpPrompt` は残余の item（Fix 値・severity）と review-feedback の Read/修正指示を保持し、`report_result` を含まない
- `typecheck && test` が green

## T-07: 出力ゲート halt メッセージに content-format の失敗ラベルを描画する

- [x] `src/core/step/step-halt.ts` の `makeOutputGateHalt` に、`v.kind === "content-format"` のとき
      `${v.path} (format violations: ${v.detail.join(", ") || "see file"})` を描画する分岐を追加する
- [x] tasks-complete / produced の描画は無変更

**Acceptance Criteria**:
- content-format violation を含む halt のエラーメッセージに path と失敗 label が含まれる（unit test）
- 既存 tasks-complete / produced の halt メッセージは無変更
- `typecheck && test` が green

## T-08: 既存テストの期待更新と移設挙動の固定テストを追加する

- [x] `tests/unit/core/step/post-work-prompt-invariant.test.ts` T-02 を更新する:
      code-review `followUpPrompt` の項目番号を残余（1〜2、3 以降なし）に合わせ、移設した決定論的形式検査
      （テーブル形式・7 カラム列挙）の記述が無いことを assert する。`review-feedback` / `Read tool` /
      修正指示 / `report_result` 非包含の既存 assertion は維持する
- [x] T-04（全 agent step の post-work / follow-up 走査）が design の `followUpPrompt` 削除後も green であることを確認する
      （`followUpPrompt === undefined` の step は静的走査を skip する既存分岐で通る）
- [x] design の「valid → 検査由来の repair 0 / invalid（Scenario 欠落）→ repair 発火」を固定するテストを追加する
      （実 `validateStepOutputs` に spec.md fixture を通し、follow-up violation 数で発火有無を判定）
- [x] code-review の「valid → repair 0 / invalid → repair 発火」を固定するテストを追加する
- [x] 新 `OutputContractKind` の検出が local / managed 両 `validateStepOutputs` で valid / invalid 双方で
      決定論的に動くテストを追加する（T-03 / T-04 と重複しない統合視点、または T-03/T-04 で充足なら参照で足りることを明記）
- [x] design / code-review の `followUpPrompt` から移設した決定論的形式検査の記述が無いことを固定するテストを追加/更新する

**Acceptance Criteria**:
- 上記すべてのテストが green
- 形式検査の移設で期待が変わるテスト以外の既存テストは無改変で green（挙動保存）
- verdict 導出・pipeline 遷移の観測挙動が不変であること（既存 pipeline / executor / agent-runner テストが
  移設起因の変更以外で無改変 green）
- `typecheck && test` が green

## T-09: 全体検証

- [x] `bun run typecheck` が green
- [x] `bun run test` が green
- [x] 受け入れ基準（request.md）を全て満たすことを再確認する

**Acceptance Criteria**:
- `typecheck && test` が green
- design / code-review の valid → repair 0、invalid → repair 発火 がテストで固定されている
- 新 kind の検出が local / managed 両 runtime で valid / invalid ともテストされている
- 移設した決定論的形式検査の記述が followUpPrompt に無いことがテストで固定されている
- 形式違反が従来どおり修復される（挙動保存）
