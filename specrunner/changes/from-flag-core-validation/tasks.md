# Tasks: --from の検証正本を core に一本化し CLI 静的 enum を撤去する

## T-01: CLI `from` flag から静的 `values` 制約を撤去する

対象: `src/cli/command-registry.ts`

- [x] resume の `from` flag 定義（:1061）を `{ type: "string", values: [...AGENT_STEP_NAMES, ...CLI_STEP_NAMES] as const }` から `{ type: "string" }` に変更する
- [x] reopen の `from` flag 定義（:1197）を同様に `{ type: "string" }` に変更する
- [x] `AGENT_STEP_NAMES` / `CLI_STEP_NAMES` が `from` flag 以外でも使われているか確認し、使われていない場合は import 整理の必要なし（残しておいて問題ない、usage text テンプレートで使用中）

**Acceptance Criteria**:
- `job resume <slug> --from regression-gate` が flag-parser 段でエラーにならない
- `job resume <slug> --from custom-reviewers` が flag-parser 段でエラーにならない
- `job resume <slug> --from alice` （任意文字列）が flag-parser 段でエラーにならない
- `job reopen <slug> --from regression-gate --reason "x"` が flag-parser 段でエラーにならない

---

## T-02: resume.ts の `resolveResumeStep` 失敗時 exit code を区別する

対象: `src/core/command/resume.ts`（:262-267）

- [x] `resolveResumeStep` を呼ぶ try/catch ブロック（:262-267）の catch 内を修正する
- [x] `--from` が明示指定されていた場合（`this.options.from !== undefined`）は `PrepareError(2, "Failed to resolve resume step")` を throw する
- [x] `--from` が未指定の場合（`this.options.from === undefined`）は従来どおり `PrepareError(1, "Failed to resolve resume step")` を throw する
- [x] `logError` でのエラーメッセージ出力（`(err as Error).message`）は変更しない（core の "Available step names: ..." メッセージがそのまま表示される）

**Acceptance Criteria**:
- `--from bogus-step` で resume した場合に `execute()` が exit code 2 を返す
- `--from regression-gate` で reviewers のない job を resume した場合に exit code 2 を返す
- `--from` 未指定で resumePoint も state.step も決定できない場合は exit code 1 を返す（既存テスト `resume-hard-crash.test.ts` が無変更で green）

---

## T-03: reopen.ts の `resolveResumeStep` 失敗時 exit code を exit 2 に変更する

対象: `src/core/command/reopen.ts`（:222-227）

- [x] `resolveResumeStep` を呼ぶ try/catch ブロック（:222-227）の catch 内の `PrepareError(1, ...)` を `PrepareError(2, ...)` に変更する
- [x] `logError` でのメッセージ出力は変更しない

**Acceptance Criteria**:
- `--from bogus-step` で reopen した場合に `execute()` が exit code 2 を返す
- `--from regression-gate` で reviewers のない job を reopen した場合に exit code 2 を返す

---

## T-04: usage text を core の実能力に合わせて更新する

対象: `src/cli/command-registry.ts`

- [x] resume の `JOB_RESUME_USAGE`（:368-373）の `--from <step>` 説明を以下のように更新する:
  - 「Valid steps: ${[...AGENT_STEP_NAMES, ...CLI_STEP_NAMES].join(", ")}」の行は保持してもよい（静的 step の参考一覧）
  - 「Note: composite steps (custom-reviewers fan-out, regression-gate) are not valid --from targets and are not listed above.」の行を削除する
  - 代わりに「Note: jobs with custom reviewers also accept: regression-gate, custom-reviewers, or reviewer member names (member names are mapped to the custom-reviewers coordinator).」を追加する
  - 「Note: bite-evidence is an internal step not intended for regular operator use.」は維持する
- [x] reopen の `REOPEN_USAGE`（:500）の `--from <step>` 説明を更新する:
  - 静的 step 一覧の後に「Note: jobs with custom reviewers also accept: regression-gate, custom-reviewers, or reviewer member names (member names are mapped to the custom-reviewers coordinator).」を追加する

**Acceptance Criteria**:
- resume usage text に "composite steps" / "are not valid --from targets" の文言が含まれない
- resume usage text に "custom reviewers" および "regression-gate" への言及が含まれる
- reopen usage text に "custom reviewers" への言及が含まれる
- "bite-evidence" の internal step 注記が resume usage text に残っている

---

## T-05: 受け入れ基準を満たすテストを追加する

対象: 新規テストファイル `src/cli/__tests__/from-flag-no-enum.test.ts` および `src/core/command/__tests__/resume-from-exit-code.test.ts`

### T-05a: CLI parser が `--from` 任意文字列を受理することを固定する

新規ファイル: `src/cli/__tests__/from-flag-no-enum.test.ts`

- [x] `parseFlags` を直接呼び出し、resume の `from` flag 定義で `--from regression-gate` が FlagParseError を throw しないことを検証する
- [x] 同様に `--from custom-reviewers` / `--from alice` が FlagParseError を throw しないことを検証する
- [x] reopen の `from` flag 定義でも同様に検証する
- [x] flag 定義は `COMMANDS["job"]!.children!["resume"]!.flags!` から取得する（実際の定義を参照）

### T-05b: resume exit code 区別のテスト

新規ファイル: `src/core/command/__tests__/resume-from-exit-code.test.ts`

テスト構成は既存 `resume-hard-crash.test.ts` のモック構成を踏襲する。

- [x] `--from bogus-step` を指定して reviewers なし job を resume → `execute()` が 2 を返す
- [x] `--from regression-gate` を指定して reviewers なし job を resume → `execute()` が 2 を返す
- [x] `--from regression-gate` を指定して reviewers あり job を resume → `execute()` が 2 を返さない（`resolveResumeStep` が成功する：allowed set に regression-gate が含まれる）
- [x] `--from <member-name>` を指定して対応 reviewers あり job を resume → `execute()` が 2 を返さない（member→coordinator 写像で成功）
- [x] `--from` 未指定、`resumePoint` なし、`state.step` が pipeline step でない（例: "init"） → `execute()` が 1 を返す（既存 `resume-hard-crash.test.ts:AC2` がカバーするが、exit code が 1 であることも追加アサート）

### T-05c: reopen exit code のテスト

`src/core/command/__tests__/reopen-command.test.ts` に追加、または新規ファイル。

- [x] `--from bogus-step` を指定して reopen → `execute()` が 2 を返す
- [x] `--from regression-gate` を指定して reviewers なし job を reopen → `execute()` が 2 を返す

**Acceptance Criteria**:
- T-05a: resume と reopen の `from` flag で `--from regression-gate` / `--from custom-reviewers` / `--from alice` が FlagParseError を throw しない
- T-05b: 各シナリオで `execute()` の戻り値が設計どおりの exit code になる
- T-05c: reopen での不正 `--from` が exit code 2 になる
- 既存の resume / reopen テスト（`resume-hard-crash.test.ts`, `reopen-command.test.ts`, `command-registry-resume.test.ts`, `command-registry-reopen.test.ts`）が無変更で green
- `typecheck && test` が green
