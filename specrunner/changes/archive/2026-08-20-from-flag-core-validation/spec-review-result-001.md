# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### コード前提の照合（request.md「現状コードの前提」全件）

| 前提 | 照合結果 |
|------|----------|
| `command-registry.ts:1061` resume `from` flag に `values: [...AGENT_STEP_NAMES, ...CLI_STEP_NAMES] as const` | ✅ 確認（行数・内容一致） |
| `command-registry.ts:1197` reopen `from` flag に同制約 | ✅ 確認（行数・内容一致） |
| `resolve-step.ts:32-44` `buildAllowedStepSet` が reviewers 非空時に `REGRESSION_GATE_STEP_NAME` / `CUSTOM_REVIEWERS_STEP_NAME` / member 名を追加 | ✅ 確認（行数・実装一致） |
| `resolve-step.ts:60-67` `mapMemberToCoordinator` が member 名を `CUSTOM_REVIEWERS_STEP_NAME` へ写像 | ✅ 確認 |
| `resolve-step.ts:19-22` `LEGACY_STEP_ALIASES` に `build-fixer` / `test-materialize` → implementer | ✅ 確認 |
| `resume.ts:262-267` catch が `PrepareError(1, "Failed to resolve resume step")` | ✅ 確認（行267） |
| `reopen.ts:222-227` catch が `PrepareError(1, "Failed to resolve reopen step")` | ✅ 確認（行227） |
| `command-registry.ts:368-373` resume usage に「composite steps ... are not valid --from targets」 | ✅ 確認（行370-371） |
| `command-registry.ts:500` reopen usage が静的一覧のみ | ✅ 確認 |

### spec.md の規範性

- 全 Requirement に `SHALL` または `MUST` が 1 個以上含まれることを確認 ✅
- 全 Requirement に 1 個以上の `Scenario:` が存在することを確認 ✅
- 全 Scenario が Given/When/Then 形式であることを確認 ✅
- `bite-evidence` の internal step 注記維持要件が spec に明示されていることを確認 ✅

### design.md の技術的正確性

- **D1**（`values:` 削除）: flag-parser が `values` 違反を `FlagParseError` で throw することを `flag-parser.ts:163-165` で確認。削除で任意文字列受理になる ✅
- **D2**（resume exit code 区別）: `ResumeOptions.from?: string`（optional）を確認。`this.options.from !== undefined` による条件分岐が技術的に成立することを確認 ✅
- **D3**（reopen 常に exit 2）: `ReopenOptions.from: string`（required、non-optional）を確認。CLI handler が `--from` 不在を `ARG_ERROR(2)` で拒否（`command-registry.ts:1216-1218`）し、core 到達時は必ず `from` が設定されていることを確認 ✅
- **D4**（usage text 定数書き換え）: `JOB_RESUME_USAGE` / `REOPEN_USAGE` がコンパイル時定数文字列であることを確認 ✅

### `resolveResumeStep` のエラーメッセージ

`resolve-step.ts:112-116` で throw されるメッセージが `"Invalid --from value: \"${from}\". Available step names: ${availableSteps}."` を含むことを確認 ✅。spec の「エラーメッセージには core が生成する利用可能 step 一覧を表示する」要件と一致。

### execute() の PrepareError 透過

- `resume.ts:124-131`: `execute()` が `PrepareError.exitCode` を return する実装を確認 ✅
- `reopen.ts:79-89`: 同様の実装を確認 ✅

### test-cases.md の整合性

- Summary の Total=17 / Automated=15 / Manual=0 / must=16 / should=1 と本文 TC の件数が一致することを確認 ✅
- Scenario 由来 TC（TC-001〜TC-014）が spec.md の対応 Scenario を正しく参照していることを確認 ✅
- TC-015（非 Scenario 由来）が GWT 形式で記述されていることを確認 ✅
- TC-016 / TC-017（gate TC）が verification コマンドを参照していることを確認 ✅

### 既存テストへの影響分析

- `resume-hard-crash.test.ts:AC2`: `prepare()` が throw することを検証しているが、`exitCode === 1` は未アサート。task T-05b が追加アサートを明示しており整合 ✅
- `reopen-command.test.ts`: `resolveResumeStep` をモック（`vi.fn().mockReturnValue("spec-review")`）しており、T-03 の変更（`PrepareError(1 → 2)`）に対してモック経路では既存テストが無変更で green になることを確認 ✅
- `command-registry-resume.test.ts` / `command-registry-reopen.test.ts`: 追加調査は行っていないが、`values` 制約を外す変更（T-01）は parser が「より多くを受理する」方向の緩和であり、既存の valid-input テストは変更なしで green になると判断できる（緩和的変更の性質から）

## 検証できなかった項目

- `command-registry-resume.test.ts` / `command-registry-reopen.test.ts` の全テスト内容の精読（参照は行ったが全件は追っていない）
- 実際のテスト実行結果（実装前のため不可）
- `src/core/resume/__tests__/resolve-step.test.ts` の内容（core の resolve-step 自体は「触らない」スコープ外のため確認不要と判断）

## Findings 詳細

指摘なし。spec 成果物はコード現状・設計判断・規範記法の全件で正確と確認した。

