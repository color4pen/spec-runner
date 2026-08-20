# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### 1. CLI 静的 enum の存在確認

- `src/cli/command-registry.ts:1061`（resume）: `from: { type: "string", values: [...AGENT_STEP_NAMES, ...CLI_STEP_NAMES] as const }` — 記述通り確認
- `src/cli/command-registry.ts:1197`（reopen）: `from: { type: "string", values: [...AGENT_STEP_NAMES, ...CLI_STEP_NAMES] as const }` — 記述通り確認
- `src/cli/flag-parser.ts:163-166`: enum 制約違反は `FlagParseError` を throw → `bin/specrunner.ts:98-102` で catch し `process.exit(2)` — enum 拒否が exit 2 になる経路を確認

### 2. core の検証ロジック確認

- `src/core/resume/resolve-step.ts:19-22`: `LEGACY_STEP_ALIASES` に `"build-fixer"` / `"test-materialize"` → `STEP_NAMES.IMPLEMENTER` — 記述通り確認
- `src/core/resume/resolve-step.ts:32-44`: `buildAllowedStepSet(reviewers)` — reviewers 非空のとき `REGRESSION_GATE_STEP_NAME` / `CUSTOM_REVIEWERS_STEP_NAME` / 各 `r.name` を集合に追加 — 記述通り確認
- `src/core/resume/resolve-step.ts:60-67`: `mapMemberToCoordinator` — reviewer member 名を `CUSTOM_REVIEWERS_STEP_NAME` へ写像 — 記述通り確認

### 3. catch ブロックと exit code 経路

- `src/core/command/resume.ts:262-267`: `resolveResumeStep` の throw を catch し `PrepareError(1, "Failed to resolve resume step")` に包む — 記述通り確認（現在は `--from` 指定有無に関わらず一律 exit 1）
- `src/core/command/reopen.ts:222-227`: 同形で `PrepareError(1, "Failed to resolve reopen step")` — 記述通り確認
- `ResumeCommand.execute()` (resume.ts:124-133): `PrepareError` を catch して `err.exitCode` を返す経路を確認 — exit code 2 への拡張が機能する構造になっている
- `runResumeCore` (resume.ts:80-92): `ResumeCommand.execute()` の戻り値をそのまま return → CLI が `process.exit(code)` する経路を確認

### 4. usage text 確認

- `src/cli/command-registry.ts:368-373`（resume usage）: `--from <step>` の説明に「composite steps (custom-reviewers fan-out, regression-gate) are not valid --from targets and are not listed above.」の記述あり — 記述通り確認
- `src/cli/command-registry.ts:500`（reopen usage）: `Valid steps: ${[...AGENT_STEP_NAMES, ...CLI_STEP_NAMES].join(", ")}` のみで動的ステップの言及なし — 記述通り確認

### 5. `--from-issue` 経路への影響

- `command-registry.ts:1127-1145`: `--from-issue` 分岐では `parsed.flags["from"]` をそのまま `runResumeFromIssue` に渡す — CLI parser 段で `values` 制約が外れれば `--from-issue` 経路にも自動適用される

### 6. 既存テストの確認

- `src/cli/__tests__/command-registry-resume.test.ts`: `--prompt` 注入警告テスト。`--from` の enum 制約をテストしていない — 無変更で green 維持できる
- `src/cli/__tests__/command-registry-reopen.test.ts`: `--from "spec-review"` / `--reason` の有無テスト。`spec-review` は静的 enum に含まれており、`values` 制約を外しても通る — 無変更で green 維持できる
- `src/core/resume/__tests__/resolve-step.test.ts` / `tests/unit/core/resume/resolve-step.test.ts`: core の検証ロジックは変更なし — 影響なし

## 検証できなかった項目

None

## Findings 詳細

None
