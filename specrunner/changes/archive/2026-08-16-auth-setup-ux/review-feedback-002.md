# Code Review Feedback — iteration 002

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 読んだファイル・確認したコード

**実装ファイル**
- `src/cli/login.ts` — GitHub-only + validity-based Decision Flow 実装
- `src/cli/credentials.ts` — `credentials set <name>` ハンドラ
- `src/util/secret-input.ts` — TTY/non-TTY silent secret reader
- `src/cli/command-registry.ts` — `login.provider` deprecated flag 設定、`credentials` ParentCommandDef 登録
- `src/cli/flag-parser.ts` — deprecated flag 機構（value-routed FlagParseError）
- `src/cli/init.ts` — existing config + --provider フラグ時の notice 出力
- `src/core/doctor/formatter.ts` — fail==0 → "Ready to run." 判定
- `src/core/doctor/checks/config/claude-code-token-present.ts` — required: false, warn
- `src/core/doctor/checks/config/managed-key-present.ts` — dead guidance 置換確認
- `src/core/doctor/checks/auth/managed-key-valid.ts` — dead guidance 置換確認
- `src/core/doctor/checks/agents/agent-provider-alive.ts` — dead guidance 置換確認
- `src/core/doctor/checks/agents/environment-provider-alive.ts` — dead guidance 置換確認
- `src/core/runtime/prereqs.ts` — dead guidance 置換確認
- `src/core/runtime/provider-readiness.ts` — PROVIDER_READINESS_HINTS（credentials set claude-code 参照）
- `src/core/credentials/anthropic.ts` — saveSpecRunnerApiKey
- `src/core/credentials/claude-code.ts` — saveClaudeCodeOAuthToken
- `src/core/doctor/checks/index.ts` — commonChecks / managedChecks / localChecks 分類確認
- `README.md` — Quick Start doctor 中心導線確認

**テストファイル**
- `src/cli/__tests__/login.test.ts` — TC-001〜TC-008
- `tests/unit/cli/login.test.ts` — TC-LOGIN-001〜TC-LOGIN-015
- `tests/credentials.test.ts` — TC-009〜TC-012, TC-020〜TC-021, SIGTERM テスト
- `tests/dead-guidance.test.ts` — TC-013
- `tests/hint-command-existence.test.ts` — TC-014, TC-005
- `tests/doctor-readiness.test.ts` — TC-015〜TC-017
- `tests/init-provider-notice.test.ts` — TC-018
- `tests/readme-quickstart.test.ts` — TC-019
- `tests/unit/cli/removed-commands.test.ts` — login --provider migration messages per value

**実行確認**
- `bun run typecheck` → clean（エラーなし）
- `bun run test` → 779 files, 11443 pass, 0 fail

### 受け入れ基準 × 実装の照合

| AC | 確認内容 | 結果 |
|----|---------|------|
| --provider 非公開 + migration 捕捉 | LOGIN_USAGE に --provider なし、deprecated flag が FlagParseError を投げる | ✅ |
| 有効 token → Device Flow スキップ | HTTP 200 → source 表示 + exit 0 | ✅ |
| 無効 env/gh token → non-0 + Device Flow なし | HTTP 401 + env/gh → logError + return 1 | ✅ |
| 無効 credentials token → Device Flow | HTTP 401 + credentials → fall-through | ✅ |
| credentials set → 0600 保存 | saveCredentials が 0o600 で書く | ✅ |
| echo しない | readSecret が output stream に secret を書かない | ✅ |
| login --provider anthropic が src/ に存在しない | 5 箇所すべて置換済み | ✅ |
| doctor hint → 実在コマンドのみ | verb + subcommand 両方チェック | ✅ |
| headless Claude → warn + cron note | required: false, status: "warn" | ✅ |
| readiness = fail==0 | formatHuman が fail==0 で "Ready to run." | ✅ |
| init + existing config + --provider → notice | logInfo で Note 出力 | ✅ |
| README Quick Start doctor 中心 | doctor 2 回、login は conditional のみ | ✅ |
| typecheck && test green | tsc --noEmit clean, 11443 pass | ✅ |

### test-cases.md 21件の網羅確認

TC-001〜TC-021 すべてが対応するテストファイルでカバー済み（詳細は Findings 詳細を参照）。

## 検証できなかった項目

None — 全受け入れ基準を実行 + コード読取で確認済み。

## Findings 詳細

指摘なし。

---

### 補足観察（non-blocking）

**OBS-1: `doctor repair` がインライン positional で処理されている**  
pre-existing。`COMMANDS["doctor"]` は `ParentCommandDef` でなく `CommandDef` で、`repair` はハンドラ内で positional として分岐する。hint-command-existence の scan 対象外だが、どの hint も `specrunner doctor repair` を参照していないため問題なし。

**OBS-2: `prereqs.ts` の hint が TC-014 の doctor scan 対象外**  
TC-014 は `src/core/doctor/**` を走査。`src/core/runtime/prereqs.ts` の hint は別スコープだが、dead-guidance.test.ts（TC-013）が旧文字列の消去を保証しており、置換後の hint は実在コマンド（`credentials set anthropic-api-key`, `runtime setup`）を参照している。

**OBS-3: `vi.mocked` が `bun test <file>` 直接起動では動作しない**  
`bun test src/cli/__tests__/login.test.ts` 単独で実行すると `vi.mocked is not a function` エラー。vitest runner 経由（`bun run test`）では全件 pass。既知の Bun/Vitest 互換挙動。修正不要。
