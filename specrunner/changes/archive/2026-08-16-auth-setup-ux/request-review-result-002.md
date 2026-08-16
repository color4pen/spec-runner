# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション検証

**`src/cli/login.ts`**
- Line 14: `provider?: "github" | "claude"` — 確認済み ✓
- Lines 137-138: `readline.createInterface({ input: process.stdin, output: process.stdout })` + `rl.question(...)` — echo される実装を確認 ✓
- Login の既存 token チェックは GH_TOKEN / GITHUB_TOKEN env と `loadCredentials()` のみ。`gh auth token` subprocess は呼ばない — 確認済み ✓

**`src/core/credentials/github.ts`**
- 実行時の解決順: GH_TOKEN → GITHUB_TOKEN → `gh auth token`(subprocess) → credentials.json — 確認済み ✓

**dead guidance 5 箇所（`specrunner login --provider anthropic`）**
- `src/core/doctor/checks/config/managed-key-present.ts:22` ✓
- `src/core/doctor/checks/auth/managed-key-valid.ts:22` ✓
- `src/core/doctor/checks/agents/environment-provider-alive.ts:22` ✓
- `src/core/doctor/checks/agents/agent-provider-alive.ts:33` ✓
- `src/core/runtime/prereqs.ts:35` ✓

**"future login --provider anthropic" コメント**
- `src/core/credentials/anthropic.ts:13`: `"Save an API key to credentials with a future 'specrunner login --provider anthropic', ..."` — 確認済み ✓

**`src/cli/init.ts`**
- `resolveInitProvider` は `if (!configExists)` ブロック内でのみ呼ばれる。configExists = true の場合、`--provider` は無言で無視される — 確認済み ✓

**`README.md:19-20`**
- Quick Start が無条件で `npx specrunner init` → `npx specrunner login` を案内 — 確認済み ✓

**`src/cli/flag-parser.ts`**
- Unknown flag は handler 到達前に `FlagParseError: Unknown flag(s): --{flagName}` で落とす (line 94) — 確認済み ✓
- `provider` が `login` command の flag def から削除されると、`--provider` は handler に届かない。migration メッセージは handler 側では出せない — 設計課題を正確に把握 ✓

**`src/cli/command-registry.ts`**
- `login` の flag def: `{ force: boolean, provider: string values:["github","claude"] }` — 確認済み ✓
- `credentials` コマンドは存在しない（新設対象）— 確認済み ✓

**`src/core/doctor/runner.ts` / `doctor.ts`**
- Doctor の exit code: `results.some(r => r.status === "fail") ? 1 : 0` — warn のみなら exit 0 — 確認済み ✓

**`src/core/doctor/checks/config/claude-code-token-present.ts`**
- `required: false`、token 未設定で `status: "warn"` を返す — 確認済み ✓
- ただし hint が `specrunner login --provider claude` を案内している（dead guidance）— 確認済み ✓

**`src/core/doctor/formatter.ts`**
- fail が 0 件の場合に "Ready to run." や次の一歩を表示しない（現状）— 確認済み ✓

### スコープ確認

- `credentials` サブコマンドは存在しない → 新設
- Doctor formatter に readiness 通知なし → 追加
- Login で token 有効性確認をしない（token の存在のみチェック）→ 変更対象

## 検証できなかった項目

None。request の全コードアサーションを実コードで確認した。

## Findings 詳細

指摘なし。全コードアサーションが正確であり、要件・受け入れ基準は明確かつテスト可能。設計上の open question（`--provider` migration の捕捉方式）は request が明示的に design step へ委ねており適切。
