# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### ドキュメント間の整合性

- **request.md → design.md**: 全要件（要件 1〜6）が D1〜D10 に対応。D1（login 有効性判定）、D2（deprecated flag 捕捉）、D3（credentials set 新設）、D4（dead guidance 置換）、D5（doctor 導線強化）、D6（全対象列挙）、D7（機械検証テスト）、D8（既存テスト更新）、D9（init 無言無視解消）、D10（README 更新）として具体化されている。
- **design.md → spec.md**: D1〜D10 の各設計決定が spec.md のシナリオとして形式化されている。シナリオ数・カバー範囲に欠落なし。
- **spec.md → tasks.md**: T-01〜T-10 が spec.md 全シナリオを実装タスクに対応付けている。タスク単位の Acceptance Criteria も spec シナリオと一致。
- **tasks.md → test-cases.md**: TC-001〜TC-024 が T-01〜T-10 のタスクと spec シナリオを網羅している。

### 実コード照合

以下のファイルを実際に読み、spec が述べる「現状コードの前提」を確認した：

| ファイル | 確認内容 |
|---|---|
| `src/cli/login.ts` | `provider?: "github" \| "claude"` が存在（L14）、`runClaudeLogin` が `readline.question`（echo あり）を使用（L137-138）、Device Flow 前の判定が `loadCredentials` のみ（`gh auth token` 不参照）を確認 |
| `src/cli/flag-parser.ts` | `FlagDef` に `deprecated` フィールドなし（L6-8）を確認 |
| `src/cli/command-registry.ts` | `login.flags.provider` が通常 string flag（L482）、`LOGIN_USAGE` に `--provider` と Claude Code セクション（L279-287）、`credentials` コマンドなし（L463-1103）を確認 |
| `src/cli/init.ts` | `!configExists` ブロック内のみで provider 解決（L79-138）、`Run 'specrunner login'` 無条件出力（L137）を確認 |
| `src/core/doctor/checks/config/managed-key-present.ts` | `login --provider anthropic` dead guidance（L22）を確認 |
| `src/core/doctor/checks/auth/managed-key-valid.ts` | `login --provider anthropic` dead guidance（L22）を確認 |
| `src/core/doctor/checks/agents/environment-provider-alive.ts` | `login --provider anthropic` dead guidance（L22）を確認 |
| `src/core/doctor/checks/agents/agent-provider-alive.ts` | `login --provider anthropic` dead guidance（L33）を確認 |
| `src/core/runtime/prereqs.ts` | `login --provider anthropic` dead guidance（L35）を確認 |
| `src/core/credentials/anthropic.ts` | `ANTHROPIC_KEY_MISSING_HINT` に "future `specrunner login --provider anthropic`"（L13）を確認 |
| `src/core/credentials/claude-code.ts` | `CLAUDE_CODE_TOKEN_MISSING_HINT` に `specrunner login --provider claude`（L12）を確認 |
| `src/core/runtime/provider-readiness.ts` | `PROVIDER_READINESS_HINTS` の `auth-missing`/`auth-invalid` に `specrunner login --provider claude`（L27, L29）を確認 |
| `src/core/doctor/checks/config/claude-code-token-present.ts` | hint に `specrunner login --provider claude`（L28）、`required: false`（warn 相当）を確認 |
| `src/core/doctor/formatter.ts` | `fail==0` 時の "Ready to run." 出力なしを確認 |
| `src/core/doctor/next-steps.ts` | `github-token-present/valid` fail → `specrunner login` の Next steps ロジックを確認 |
| `src/core/credentials/credentials-io.ts` | `saveCredentials` が 0600 deep-merge で保存（L115-134）を確認 |
| `src/core/credentials/github.ts` | `resolveGitHubToken` の解決順（GH_TOKEN → GITHUB_TOKEN → gh → credentials）と source 型（`"env" \| "gh" \| "credentials"`）を確認 |
| `src/core/doctor/checks/auth/github-token-valid.ts` | `verifyTokenScopes()` の戻り値構造（`result.status` == 200/401/その他）を確認 |
| `tests/hint-command-existence.test.ts` | `extractCommandVerbs` が `specrunner (\w+)` でトップレベル verb のみ抽出（L16-18）を確認 |
| `tests/init.test.ts` | 既存テスト "config exists, provider flag is ignored"（L519-542）が config 不変を検証、案内出力は assert していないことを確認 |
| `src/cli/__tests__/login.test.ts` | TC-001/002/015/016/017 が claude login 経路をテスト、D8 で削除対象であることを確認 |
| `src/core/doctor/checks/config/__tests__/claude-code-token-present.test.ts` | L120/129 が `login --provider claude` を assert している（D8 で更新対象）を確認 |
| `README.md` | Quick Start の L20(`npx specrunner login`)、L39(`npx specrunner login`)が無条件案内になっていることを確認 |

### dead guidance の全件 grep 確認

`src/` 配下の `login --provider` 全出現箇所をグレップし、D6 に列挙された 9 箇所（anthropic 5 + 構想コメント 1 + claude 4）との整合を確認した。過不足なし。`src/cli/__tests__/login.test.ts` と `src/core/doctor/checks/config/__tests__/claude-code-token-present.test.ts` のテストファイルも `src/` 下に含まれるが、これらは D8/T-09 で更新対象として明示されている。

### セキュリティ観点

- **secret echo 問題**: 現行 `promptLine`（`readline.question`）は stdout に echo される。D3 が `readSecret`（raw mode TTY / stdin 非 TTY）で解決。入力値を output stream に書かない要件が TC-011 でテスト固定される。設計上適切。
- **credentials.json 0600**: `saveCredentials` が `atomicWriteJson(credPath, merged, { mode: 0o600 })` で保存（credentials-io.ts L133）。`credentials set` 経由の保存も同一経路を使うため問題なし。
- **deprecated flag → parser throw**: D2 の実装では `provider` が flagDefs に残る（deprecated marker として）。`Unknown flag(s)` ではなく `FlagParseError(deprecated.message)` を throw することで非 0 終了 + 案内を両立。registry に "通常 flag として残す" 形ではない。design 要件を満たす。

## 検証できなかった項目

- **runtime 実行**: `typecheck && test` 結果（実装前のため実行不能）。
- **readSecret の TTY raw mode 実際の動作**: TTY セッション外のため手動検証不能。

## Findings 詳細

### F1: TC-014 の説明がサブコマンドチェック範囲を省略している（medium / fixable）

**場所**: `test-cases.md` TC-014 の説明文

**内容**: TC-014 の Source 参照先 spec.md シナリオは "every referenced command **(and subcommand)** exists in the registry" と明記している。一方 TC-014 の本文には「`specrunner <verb>` がすべて registry 登録済みコマンド」とのみ記載され、subcommand チェックに触れていない。

T-10 は「`specrunner <verb> [<sub>]` が `COMMANDS`（parent の subcommand 含む）に実在することを検証する」と正確に記述しており、実装指針は正しい。リスクは **implementer が TC-014 テキストを根拠にサブコマンドチェックを省略すること**。

**対処**: 実装者は TC-014 説明ではなく spec.md シナリオ + T-10 に従う。テスト実装時に `credentials set` の subcommand 存在まで検証すること。

---

### F2: PROVIDER_READINESS_HINTS の hint-existence テストがサブコマンドを検証しない（medium / fixable）

**場所**: `tests/hint-command-existence.test.ts`（既存の TC-005 ブロック）

**内容**: T-05 後、`PROVIDER_READINESS_HINTS` の `auth-missing` / `auth-invalid` は `specrunner credentials set claude-code` を含む文言に更新される。しかし `extractCommandVerbs` が正規表現 `specrunner (\w+)` でトップレベル verb しか抽出しないため、更新後の `credentials` が登録済みかは確認できるが `set` サブコマンドの存在は確認されない。

TC-014 の拡張（T-10 による doctor hint のサブコマンドチェック）は `src/core/doctor/**` スコープであり、`src/core/runtime/provider-readiness.ts` は対象外。そのため `credentials foo`（不正サブコマンド）を誤記しても既存テストは通過してしまう。

**対処**: T-10 の hint-existence 拡張と合わせて、TC-005 の `PROVIDER_READINESS_HINTS` テストもサブコマンド検証を含める形に拡張することを推奨。あるいは T-10 の scope を `src/core/runtime/provider-readiness.ts` にも広げる。
