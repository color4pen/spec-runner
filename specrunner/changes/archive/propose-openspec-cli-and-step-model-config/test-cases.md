# Test Cases: propose step の openspec CLI 対応 + step ごとの model / maxTurns 設定

## Summary

- **Total**: 25 cases
- **Automated** (unit/integration/e2e): 19
- **Manual**: 6
- **Priority**: must: 14, should: 8, could: 3

## Test Cases

### TC-001: AgentStep interface に maxTurns フィールドが存在する

**Category**: unit
**Priority**: must
**Source**: tasks.md T1.1 / design.md D3

**GIVEN** `src/core/step/types.ts` の `AgentStep` interface
**WHEN** TypeScript コンパイラが型チェックを実行する
**THEN** `maxTurns?: number` が optional フィールドとして定義されており、型エラーが発生しない

---

### TC-002: step.maxTurns が undefined のとき ClaudeCodeRunner はデフォルト 30 を使用する

**Category**: unit
**Priority**: must
**Source**: tasks.md T1.2 / design.md D3 / request.md 要件9

**GIVEN** `AgentStep` オブジェクトの `maxTurns` が `undefined`
**WHEN** `ClaudeCodeRunner` が SDK の `query()` を呼び出す
**THEN** `query()` の `options.maxTurns` に `30` が渡される

---

### TC-003: step.maxTurns が設定されているとき ClaudeCodeRunner はその値を使用する

**Category**: unit
**Priority**: must
**Source**: tasks.md T1.2 / design.md D3 / request.md 要件9

**GIVEN** `AgentStep` オブジェクトの `maxTurns` が `60`（例: ImplementerStep）
**WHEN** `ClaudeCodeRunner` が SDK の `query()` を呼び出す
**THEN** `query()` の `options.maxTurns` に `60` が渡される（ハードコード値 30 は使われない）

---

### TC-004: 設計/レビュー step の model が claude-opus-4-6[1m] に設定されている

**Category**: unit
**Priority**: must
**Source**: tasks.md T2.1, T2.2, T2.3 / design.md D2 / request.md 要件5

**GIVEN** `propose.ts`, `spec-review.ts`, `code-review.ts` の各 step 定義
**WHEN** 各ファイルのモデル定数を参照する
**THEN** `PROPOSE_AGENT_MODEL`, `SPEC_REVIEW_AGENT_MODEL`, `CODE_REVIEW_AGENT_MODEL` がすべて `"claude-opus-4-6[1m]"` である

---

### TC-005: 実装/修正 step の model が claude-sonnet-4-6 に設定されている

**Category**: unit
**Priority**: must
**Source**: tasks.md T2.4, T2.5, T2.6, T2.7 / design.md D2 / request.md 要件5

**GIVEN** `spec-fixer.ts`, `implementer.ts`, `build-fixer.ts`, `code-fixer.ts` の各 step 定義
**WHEN** 各ファイルのモデル定数を参照する
**THEN** 4 つのモデル定数がすべて `"claude-sonnet-4-6"` である

---

### TC-006: 各 step の maxTurns が設計値と一致する

**Category**: unit
**Priority**: must
**Source**: tasks.md T3.1–T3.7 / design.md D3 / request.md 要件8

**GIVEN** propose, spec-review, spec-fixer, implementer, build-fixer, code-review, code-fixer の各 step 定義
**WHEN** 各 step オブジェクトの `maxTurns` プロパティを参照する
**THEN** 以下の値が設定されている: propose=20, spec-review=15, spec-fixer=25, implementer=60, build-fixer=35, code-review=20, code-fixer=30

---

### TC-007: PROPOSE_SYSTEM_PROMPT に openspec new change コマンドの指示が含まれる

**Category**: unit
**Priority**: must
**Source**: tasks.md T4.1 / design.md D1 / request.md 要件1

**GIVEN** `src/prompts/propose-system.ts` の `PROPOSE_SYSTEM_PROMPT`
**WHEN** 文字列の内容を検査する
**THEN** `openspec new change` コマンドを呼び出す手順が記述されている

---

### TC-008: PROPOSE_SYSTEM_PROMPT に openspec status --json コマンドの指示が含まれる

**Category**: unit
**Priority**: must
**Source**: tasks.md T4.1 / design.md D1 / request.md 要件1

**GIVEN** `src/prompts/propose-system.ts` の `PROPOSE_SYSTEM_PROMPT`
**WHEN** 文字列の内容を検査する
**THEN** `openspec status` と `--json` フラグを使った artifact 確認手順が記述されている

---

### TC-009: PROPOSE_SYSTEM_PROMPT に openspec instructions コマンドの指示が含まれる

**Category**: unit
**Priority**: must
**Source**: tasks.md T4.1 / design.md D1 / request.md 要件1

**GIVEN** `src/prompts/propose-system.ts` の `PROPOSE_SYSTEM_PROMPT`
**WHEN** 文字列の内容を検査する
**THEN** `openspec instructions` コマンドで各 artifact の生成指示を取得する手順が記述されている

---

### TC-010: PROPOSE_SYSTEM_PROMPT に path-fence の記述が維持されている

**Category**: unit
**Priority**: must
**Source**: tasks.md T4.1 / design.md D1

**GIVEN** 書き換え後の `PROPOSE_SYSTEM_PROMPT`
**WHEN** 文字列の内容を検査する
**THEN** `openspec/changes/<slug>/` 外への編集禁止（path-fence）に関する記述が存在する

---

### TC-011: PROPOSE_SYSTEM_PROMPT に完了条件（commit + push + register_branch）が維持されている

**Category**: unit
**Priority**: must
**Source**: tasks.md T4.1

**GIVEN** 書き換え後の `PROPOSE_SYSTEM_PROMPT`
**WHEN** 文字列の内容を検査する
**THEN** commit、push、register_branch の完了条件に関する記述が存在する

---

### TC-012: PROPOSE_INITIAL_MESSAGE_TEMPLATE が slug と branch を注入する構造を維持する

**Category**: unit
**Priority**: must
**Source**: tasks.md T4.2 / design.md D4

**GIVEN** `PROPOSE_INITIAL_MESSAGE_TEMPLATE` のテンプレート文字列
**WHEN** slug と branch の値を注入してメッセージを生成する
**THEN** 生成されたメッセージに slug と branch の値が含まれる（`buildInitialMessage` の signature は変更されていない）

---

### TC-013: propose agent が delta spec（specs/ ディレクトリ）を省略しない（manual）

**Category**: manual
**Priority**: must
**Source**: design.md D1 / request.md 要件2 / proposal.md

**GIVEN** propose agent を実際の変更リクエストで実行する
**WHEN** openspec CLI が `openspec instructions` で delta spec の生成を指示する
**THEN** agent が `openspec/changes/<slug>/specs/` に delta spec ファイルを生成し、省略しない

---

### TC-014: propose agent の Bash で openspec CLI コマンドが実行される（manual）

**Category**: manual
**Priority**: must
**Source**: design.md D1 / request.md 要件1

**GIVEN** propose agent が新しい system prompt で起動した状態
**WHEN** agent セッションのツール呼び出しログを確認する
**THEN** `openspec new change`, `openspec status --json`, `openspec instructions` の Bash 呼び出しがログに記録されている

---

### TC-015: bun run typecheck が green である

**Category**: integration
**Priority**: should
**Source**: tasks.md T5.6 / request.md 受け入れ基準

**GIVEN** maxTurns フィールド追加・model 変更・system prompt 書き換えをすべて適用した状態
**WHEN** `bun run typecheck` を実行する
**THEN** TypeScript の型エラーが 0 件で終了する

---

### TC-016: bun test が green である

**Category**: integration
**Priority**: should
**Source**: tasks.md T5.6 / request.md 受け入れ基準

**GIVEN** テストファイル（propose.test.ts, spec-review.test.ts, code-review.test.ts, agent-runner.test.ts）が新しい値に更新された状態
**WHEN** `bun test` を実行する
**THEN** 全テストスイートが PASS し、失敗件数が 0 である

---

### TC-017: propose.test.ts が新しい model 値と system prompt をアサートする

**Category**: unit
**Priority**: should
**Source**: tasks.md T5.1

**GIVEN** `propose.test.ts` のアサーション
**WHEN** テストを実行する
**THEN** `PROPOSE_AGENT_MODEL` が `"claude-opus-4-6[1m]"` であること、および system prompt が openspec CLI ワークフローの記述を含むことがアサートされる

---

### TC-018: spec-review.test.ts と code-review.test.ts が Opus モデルをアサートする

**Category**: unit
**Priority**: should
**Source**: tasks.md T5.2, T5.3

**GIVEN** `spec-review.test.ts` と `code-review.test.ts` の model アサーション
**WHEN** テストを実行する
**THEN** 両テストが `"claude-opus-4-6[1m]"` をアサートして PASS する

---

### TC-019: agent-runner.test.ts が step.maxTurns を query() に渡すことを検証する

**Category**: unit
**Priority**: should
**Source**: tasks.md T5.4

**GIVEN** `AgentStep` の `maxTurns` に任意の値（例: 42）を設定した mock
**WHEN** `ClaudeCodeRunner` の実行をテストする
**THEN** SDK の `query()` が `options.maxTurns: 42` で呼ばれたことがアサートされる

---

### TC-020: maxTurns 上限到達時に completionReason が "error" になる

**Category**: integration
**Priority**: should
**Source**: design.md Risks / request.md 外部 SDK 制約

**GIVEN** SDK が `subtype: "error_max_turns"` イベントを返すシナリオ
**WHEN** `ClaudeCodeRunner` がそのレスポンスを処理する
**THEN** `completionReason` が `"error"` として捕捉され、上位に伝播する（既存のエラーハンドリングで処理される）

---

### TC-021: delta spec が openspec validate を通過する

**Category**: integration
**Priority**: should
**Source**: tasks.md T6.1 / request.md 受け入れ基準

**GIVEN** `openspec/changes/propose-openspec-cli-and-step-model-config/` に delta spec が生成された状態
**WHEN** `openspec validate propose-openspec-cli-and-step-model-config --type change --strict` を実行する
**THEN** バリデーションが pass する（エラー 0 件）

---

### TC-022: step ごとのモデルが Claude Code セッションログで確認できる（manual）

**Category**: manual
**Priority**: should
**Source**: design.md D2 / request.md 要件5

**GIVEN** propose, spec-review, implementer など複数 step が実行されたパイプラインログ
**WHEN** 各 step の SDK 呼び出しパラメータを確認する
**THEN** 設計/レビュー step は `claude-opus-4-6[1m]`、実装/修正 step は `claude-sonnet-4-6` が使われている

---

### TC-023: openspec CLI が未インストールの環境で propose agent が適切なエラーを返す（manual）

**Category**: manual
**Priority**: could
**Source**: design.md Risks

**GIVEN** `openspec` コマンドが `node_modules/.bin/` に存在しない環境
**WHEN** propose agent が `openspec new change` を Bash で実行しようとする
**THEN** コマンドが失敗してエラーメッセージが返り、agent セッションが継続不可能な状態として報告される

---

### TC-024: propose agent の maxTurns 20 が設計と実装の規模に対して十分である（manual）

**Category**: manual
**Priority**: could
**Source**: design.md D2, D3 / tasks.md T3.1

**GIVEN** propose step が `maxTurns: 20` で実行される
**WHEN** 実際の変更リクエストで propose セッションを観察する
**THEN** `error_max_turns` が発生せずに artifact（proposal.md, design.md, tasks.md, delta spec）が生成される

---

### TC-025: 既存パイプラインの他 step に model/maxTurns 変更の副作用がない（manual）

**Category**: manual
**Priority**: could
**Source**: design.md Risks / tasks.md T5.6

**GIVEN** model と maxTurns を変更した後の完全なパイプライン実行
**WHEN** propose → spec-review → implementer → code-review のパイプラインを通して実行する
**THEN** 各 step が正常に完了し、step 間のデータ引き継ぎ（artifacts, context）に異常がない
