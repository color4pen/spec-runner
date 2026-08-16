# Code Review Feedback — iteration 001

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### スコープ確認
- `git diff main...HEAD --stat` で差分範囲を確認: 45 ファイル、src/ 側は login.ts / credentials.ts / command-registry.ts / flag-parser.ts / init.ts / doctor checks 一式 / credentials-io.ts / secret-input.ts (新規) が主な変更
- verification-result.md を確認: build / typecheck / test / lint / changed-line-coverage 全フェーズ passed
- `bun run test` (vitest) で 11438 テスト全 pass を独自確認
- `bun run typecheck` (tsc --noEmit) でエラーなしを独自確認

### 受け入れ基準ごとの検証

| 基準 | 対応 TC | 確認内容 |
|------|---------|---------|
| `--provider` が login help surface に存在しない | TC-001 | `LOGIN_USAGE` に `--provider` 記載なし ✓ |
| `login --provider claude` が migration 捕捉されて非 0 終了 | TC-002 | flag-parser に `deprecated: { message }` 概念追加、`COMMANDS.login.flags.provider.deprecated` に設定 ✓ |
| 有効 token 確認時に Device Flow スキップ(出所表示) | TC-003 | `login.ts`: verifyTokenScopes 200 → logInfo + return 0、Device Flow 呼ばず ✓ |
| 無効 env/gh token → Device Flow なし・非 0 | TC-004 | `login.ts`: resolvedSource ∈ {env,gh} かつ 401 → logError + return 1 ✓ |
| 無効 credentials.json token → Device Flow へ | TC-005 | `login.ts`: resolvedSource === "credentials" かつ 401 → fall through ✓ |
| token なし → Device Flow | TC-006 | resolveGitHubToken throw → Device Flow ✓ |
| 未知 verify 結果 → 非 0 | TC-007 | status ≠ 200/401 → logError + return 1 ✓ |
| --force → 常に Device Flow | TC-008 | force=true → verify スキップ、Device Flow 実行 ✓ |
| credentials set claude-code が 0600 保存 | TC-009 | credentials-io.ts atomicWriteJson + mode 0o600、テストで stat 確認 ✓ |
| credentials set anthropic-api-key が 0600 保存 | TC-010 | 同上 ✓ |
| secret が output に出力されない | TC-011 | TTY: raw mode + 文字非 echo、非 TTY: stdin 読み取りのみ。両経路テスト ✓ |
| 他 credential が保持される | TC-012 | saveCredentials が deep merge ✓ |
| src/ に dead guidance なし | TC-013 | dead-guidance.test.ts が src/ 全 .ts を grep ✓ |
| doctor hint の CLI コマンドが registry に実在 | TC-014 | hint-command-existence.test.ts が src/core/doctor 全 .ts を走査、verb + subcommand 両方確認 ✓ |
| headless Claude 未設定 = warn + cron/inbox 注記 | TC-015 | claudeCodeTokenPresentCheck が warn を返し hint に "cron/inbox" を含む ✓ |
| fail=0 → Ready + 次の一歩 | TC-016 | formatHuman で fail=0 かつ warn あり → "Ready to run." + request new 案内 ✓ |
| fail>0 → Ready 非表示 | TC-017 | fail>0 では Ready 行出力なし ✓ |
| 既存 config + --provider → 案内出力 | TC-018 | init.ts: configExists && flagProvider → logInfo で notice 出力、config 無変更 ✓ |
| README Quick Start が doctor 中心 | TC-019 | "specrunner doctor" が Quick Start に含まれる、無条件 "npx specrunner login" 行なし ✓ |
| 未知 credential name → 非 0 | TC-020 | VALID_NAMES チェックで非 0 ✓ |
| 空 input → 非 0、credentials.json 書かず | TC-021 | secret.length === 0 チェック ✓ |

### 実装詳細の確認

**login.ts**: `resolveGitHubToken` を runtime と同じ優先順序(GH_TOKEN → GITHUB_TOKEN → `gh auth token` → credentials.json)で呼び出している。`describeSource` で出所の文字列表現が一致する(env は GH_TOKEN/GITHUB_TOKEN を実際の env 値で判定、gh は "gh auth token"、credentials は "credentials.json")。

**credentials.ts**: `runCredentialsSet` は VALID_NAMES で受け入れ名を制限。TTY 判定を `isTTY` seam で注入可能にしており、テスタブル。

**secret-input.ts**: TTY 時 setRawMode(true) → 文字単位読み取り・非 echo → Enter/EOT で確定、Ctrl-C で abort。非 TTY 時は stdin を EOF まで読み trim。どちらも output には secret を書かない。

**flag-parser.ts**: `deprecated?: { message: string }` フィールドを FlagDef に追加。`--provider` 遭遇時に FlagParseError(deprecated.message) を throw し、handler に到達させない設計。これにより command-registry の通常 flags に `deprecated` として定義でき、Unknown flag(s) ではなく migration メッセージが出る。

**formatter.ts**: `fail === 0` 判定で "Ready to run." を出力。warn が残っていても Ready を表示し、次の一歩 (`specrunner request new <slug>`) を案内。

**claude-code-token-present.ts**: `required: false`、status は warn 固定。hint に "cron / inbox (headless) runs" の限定注記と `credentials set claude-code` の誘導を含む。

## 検証できなかった項目

`tests/credentials.test.ts` で `EventEmitter` を `node:stream` からインポートしている。`bun test` 単体では `Export named 'EventEmitter' not found in module 'node:stream'` エラーが出る(EventEmitter は通常 node:events から)。ただし `bun run test`(vitest 経由)では全テスト pass する。vitest のモジュール解決が node:stream を透過的に扱っているためと推測されるが、長期的な互換性は未検証。

## Findings 詳細

### F-001: `EventEmitter` の非標準インポート(low・fixable)

`tests/credentials.test.ts:14` で `import { EventEmitter, Readable, Writable } from "node:stream"` とある。Node.js 標準では `EventEmitter` は `node:events` から export される。vitest(bundler 経由)では動作するが bun の直接実行では失敗する。修正は `import { EventEmitter } from "node:events"` を 1 行追加するだけ。現時点では CI(vitest)が green なので機能的ブロックではない。
