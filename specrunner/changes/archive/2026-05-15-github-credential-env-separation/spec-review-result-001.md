# Spec Review Result: github-credential-env-separation

- **reviewer**: spec-reviewer (Claude)
- **date**: 2026-05-16
- **verdict**: approved

## Summary

request.md / design.md / tasks.md / delta-spec.md の 4 ファイルを通読し、既存コードベースのソースファイル・行番号・既存 spec との整合性を検証した。全体として高品質な仕様であり、ブロッキングな欠陥はない。

## Verification: ソースコード参照の正確性

以下の全参照を実コードと照合し、**全て正確**であることを確認した:

| 参照箇所 | ファイル | 結果 |
|----------|----------|------|
| config.github?.accessToken | src/cli/run.ts:45 | ✅ |
| config.github?.accessToken | src/cli/bootstrap.ts:32 | ✅ |
| rawConfig?.github?.accessToken | src/cli/doctor.ts:90-91 | ✅ |
| config.github!.accessToken (3箇所) | src/adapter/managed-agent/agent-runner.ts:140,381,413 | ✅ |
| config.github = { ... } | src/cli/login.ts:27 | ✅ |
| delete toSave["anthropic"] | src/config/store.ts:98 | ✅ |
| permission warning block | src/config/store.ts:34-45 | ✅ |
| env: opts.env ?? process.env | src/util/spawn.ts:44 | ✅ |
| checkRuntimePrereqs (sync) | src/core/preflight.ts:26-51 | ✅ |
| GithubConfig / SpecRunnerConfig.github / RawConfig.github / checkConfigComplete | src/config/schema.ts | ✅ |

## Verification: 既存 spec との整合性

delta-spec.md が変更する既存 spec 4 件を確認:

- **cli-config-store**: config schema 変更、permission warning 削除、saveConfig strip 追加 — 既存 spec の structure と矛盾なし
- **cli-commands**: doctor check 追加・変更 — 既存 spec の check 定義と整合
- **github-device-flow-auth**: token 保存先変更 — 既存 spec の Device Flow ロジック維持を正しく反映
- **managed-agent-runtime**: コンストラクタ注入 — 既存 spec の token 取得パターンを正しく置き換え

## Findings

### F1: `src/cli/ps.ts:104` の `gh` spawn が Task 7 のスコープから漏れている — Severity: Low

`checkPrMerged()` 関数が `gh pr view` を spawn している。Task 7 の変更ファイル一覧に含まれていない。

現状の実装は try/catch で wrap され、失敗時は `null` を返す defensive パターンのため、token 未注入でも機能喪失は `ps` コマンドの PR merge 状態表示が `null` になるだけ。ただし `specrunner login` を統一 auth 入口とする設計意図に照らすと、ここにも env 注入するのが一貫性の面で望ましい。

**推奨**: Task 7 の変更ファイル一覧に `src/cli/ps.ts` を追加し、`checkPrMerged` の spawn に `GITHUB_TOKEN` env を注入する。または、低優先度として実装ノートに記載する。

### F2: Task 4 と Task 5 で token 解決の canonical point が曖昧 — Severity: Low

- Task 4: `resolveGitHubToken` を **preflight 後に** CLI entry 層で独立に呼ぶ
- Task 5: `PreflightResult` に `githubToken: string` を追加し、下流で再利用可能にする

両方が token を resolve すると二重 I/O になる。設計意図として preflight が resolve → PreflightResult 経由で CLI entry 層に渡すのか、CLI entry 層が独立に resolve するのか、どちらが canonical かを明確にすべき。

**推奨**: Task 5 で preflight が resolve して PreflightResult に含める場合、Task 4 の実装詳細を「PreflightResult.githubToken を使う」に書き換える。逆に Task 4 が独立 resolve する場合、Task 5 から PreflightResult への追加を削除する。

### F3: delta-spec が `cli-commands` の `login` 記述を更新していない — Severity: Informational

`cli-commands/spec.md` は login の概要として「saves token to config」と記述している。delta-spec は `github-device-flow-auth` セクションで保存先変更を記述しているが、`cli-commands` セクションには login の変更が含まれていない。`cli-commands` の login 記述はハイレベルな概要のため、auth spec 側の変更で十分カバーされるとも言えるが、厳密には delta-spec に含めるのが網羅的。

### F4: request.md の requirement 10 が `src/cli/managed.ts` を列挙しているが config.github 参照なし — Severity: Informational

request.md は CLI entry 層のファイルとして `src/cli/managed.ts` を列挙しているが、grep で確認したところ `config.github` / `createGitHubClient` / `accessToken` への参照は存在しない。design.md と tasks.md では正しく除外されている。request.md の記述が不正確だが、下流の design/tasks が正しいため実害なし。

## Security Review

### S1: credentials file の保護 — OK

- 0600 permission での atomic write（`atomicWriteJson`）
- 読み込み時の permission warning（0600 より緩い場合）
- config に secret が残らない invariant（saveConfig での strip）

既存の PR #238 パターンと一貫しており、適切。

### S2: token の env 注入による漏洩リスク — OK

`GITHUB_TOKEN` は subprocess の env に注入されるが、これは `gh` CLI の公式推奨パターン（`gh` 自体が `GITHUB_TOKEN` env var を読む設計）。parent process の env ではなく subprocess 固有の env として渡すため、他のプロセスへの漏洩リスクは低い。

### S3: stdout への secret 出力防止 — OK

delta-spec で `anthropic.apiKey` と credentials file 内の token の stdout 出力禁止を明示。既存の secret masking パターンを維持。

### S4: credentials file の場所 — Acceptable

`XDG_CONFIG_HOME` 配下（config と同ディレクトリ）に配置。`XDG_RUNTIME_DIR` や OS keychain の方がセキュリティ上は望ましいが、これらはスコープ外として明示されており、0600 permission + warning で十分な保護。

## Design Quality

- **PR #238 との symmetric 設計**: Anthropic = env var only、GitHub = credentials file + env var fallback。パターンは異なるが「config に secret を残さない」原則は統一されており合理的
- **Provider-keyed JSON**: ~5 行のコストで forward-compat insurance。過剰な抽象化をせず構造のみ準備する判断は適切
- **tokenObtainedAt / scopes の drop**: 実用されていないメタデータを credentials file に持ち込まない判断は正しい。必要になったら API 動的取得で対応可能
- **コンストラクタ注入パターン**: adapter が process.env / config を直読みしない設計はテスタビリティと将来の secret manager 対応に有利
- **Task dependency graph**: 正確。Task 1 → 2 の順序依存と 3〜8 の並行可能性が明確

## Conclusion

ブロッキング欠陥なし。F1（ps.ts の漏れ）と F2（token resolve の canonical point）は実装時に解決可能な minor issue。仕様としての網羅性・整合性・セキュリティ設計はいずれも十分。
