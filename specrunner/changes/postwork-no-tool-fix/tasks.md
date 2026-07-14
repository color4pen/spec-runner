# Tasks: postwork-no-tool-fix

## T-01: code-review `followUpPrompt` を Markdown 専用 self-check に限定する

- [ ] `src/core/step/code-review.ts` の `CodeReviewStep.followUpPrompt`（現行 :138-159）から、`report_result` の findings 配列提出を確認する項目（現行 :148 の「report_result の findings 配列が提出されているか」＋ sub-bullet「各 finding に severity … が含まれているか」「findings が空の場合は [] を渡してあるか」）を削除する
- [ ] 残る Markdown 検査項目（テーブル形式 / 必須カラム / Fix カラム値 / Severity 定義準拠）を連番付け直す（欠番なし）
- [ ] 末尾の指示（現行 :157「違反があれば review-feedback ファイルまたは report_result findings を修正してください」）を「違反があれば review-feedback ファイルを修正してください」に変更し、`report_result` / typed findings への言及を除去する
- [ ] self-check が「review-feedback（Markdown）ファイルを Read で読み、形式違反があれば Edit で修正、なければ変更せず end_turn」の内容だけになっていることを確認する

**Acceptance Criteria**:
- `CodeReviewStep.followUpPrompt` に `report_result` の語が含まれない
- `followUpPrompt` に typed findings（findings 配列・空なら `[]`・severity/resolution/file/title/rationale の提出）の確認・修正を指示する記述が含まれない
- Markdown 検査項目（テーブル形式・必須カラム・Fix カラム値・Severity 定義準拠）は保持され、連番に欠番がない
- code-review.ts の他フィールド（agent 定義・buildMessage・resultFilePath・parseResult・maxTurns 等）は無変更

## T-02: 要件 1 の固定テスト（code-review post-work self-check）を新規追加する

- [ ] 新規テストファイル `tests/unit/core/step/post-work-prompt-invariant.test.ts` を作成する（既存テストファイルは変更しない）
- [ ] `CodeReviewStep.followUpPrompt` が `report_result`（大文字小文字無視）を含まないことを assert する
- [ ] `followUpPrompt` が typed findings 提出・修正を指示する記述（例: 「findings 配列」「[] を渡し」等の typed-result 提出語）を含まないことを assert する
- [ ] `followUpPrompt` が Markdown 検査の action 指示（review-feedback ファイルの Read / 修正）を保持していることを assert する（Markdown 検査の観測挙動が残っていることの正の確認）

**Acceptance Criteria**:
- 追加テストが green
- テストは `CodeReviewStep.followUpPrompt` を直接読み、`report_result` 非包含を fail-closed に固定する
- 既存テストファイルへの変更が無い

## T-03: 要件 2 の固定テスト（main work turn 完了契約に findings 担保が残る）を追加する

- [ ] T-02 と同じ新規テストファイル内に、code-review の main work turn 完了契約が typed findings の担保を保持していることを assert する describe を追加する
- [ ] `CODE_REVIEW_SYSTEM_PROMPT`（`src/prompts/code-review-system.ts`）が「findings 配列を必ず含める」旨と「指摘がない場合は `[]` を渡す」旨を含むことを assert する
- [ ] `CODE_REVIEW_REPORT_TOOL.description`（`src/core/step/report-tool.ts`）が `findings` 配列を REQUIRED とする旨を含むことを assert する
- [ ] source（system prompt / tool description）は変更しない（担保は既存で満たされているため確認のみ）

**Acceptance Criteria**:
- 追加テストが green
- system prompt / report tool description の source に変更が無い（lock test のみ追加）
- 担保が main work turn 側に存在することが機械的に固定される

## T-04: 越境不変の機械的な歯（全 agent step post-work prompt 走査）を追加する

- [ ] T-02 と同じ新規テストファイル内に、越境不変を固定する describe を追加する
- [ ] pipeline registry（`src/core/pipeline/registry.ts` の `STANDARD_DESCRIPTOR` / `FAST_DESCRIPTOR` の `steps`）から全 agent step（`kind === "agent"`）を列挙し、step 参照で重複排除する
- [ ] 各 step の post-work prompt 文字列を収集する: 静的 `step.followUpPrompt` と、動的 `step.getFollowUpPrompt?.(state, deps)` を、発火条件を満たす最小の state / deps で評価して収集する（adr-gen は `deps.request.adr === true` で評価する）
- [ ] 収集した各文字列が禁止マーカー `report_result`（大文字小文字無視）を含まないことを assert する
- [ ] 補助として rules follow-up wrapper（`buildRulesFollowUpPrompts` の生成する定型枠）にも `report_result` が含まれないことを assert する
- [ ] テストに「pipeline に captured typed tool を追加した場合は禁止マーカー集合を拡張すること」を明記するコメントを残す

**Acceptance Criteria**:
- 追加テストが green（現行の design / code-review / adr-gen ほか全 agent step の post-work prompt が禁止マーカー非包含）
- 任意の agent step の post-work / follow-up prompt に `report_result` を混入させると、このテストが fail する（実装後に一時的な混入で fail を確認、混入は戻す）
- 走査対象の列挙が registry 由来で、step 追加時に自動的に対象へ含まれる（step 名のハードコード列挙に依存しない）

## T-05: 観測挙動不変の確認と全体検証

- [ ] code-review の verdict 導出・Markdown result file 検査に関する既存テストが無変更で green であることを確認する（`tests/unit/step/code-review.test.ts` / `tests/unit/core/step/types.test.ts` 等）
- [ ] `bun run typecheck` が green
- [ ] `bun run test` が green

**Acceptance Criteria**:
- 既存テストへの変更が無く、全て green
- `typecheck && test` が green
- code-review の verdict 導出ロジック・findings routing・Markdown result file 検査の観測挙動が本 request の変更前と同一
