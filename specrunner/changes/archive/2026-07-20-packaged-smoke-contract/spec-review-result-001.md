# Spec Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:    specification is complete, consistent, and ready for implementation
  - needs-fix:   specification has issues that must be resolved before implementation
  - escalation:  unresolvable conflicts, missing context, or requires human judgment
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | File | Description | How to Fix
- Valid Severity values (uppercase): CRITICAL | HIGH | MEDIUM | LOW
  - CRITICAL: production outage, data loss, security breach
  - HIGH:     functional failure, clear bug, no workaround — blocks approval
  - MEDIUM:   quality degradation, maintainability issue, future risk
  - LOW:      informational, style, minor improvement
- If no findings, write a table row with "None" or omit the table body.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | correctness | design.md / tasks.md | S4 で `request new` に `< /dev/null` を渡すことを必須扱いしているが、`request new` は対話プロンプトを一切持たない（type は `"new-feature"` にデフォルト、positional slug のみ）。`< /dev/null` は harmless だが冗長。 | 実装上は問題ないため修正不要。コメントに "防御的に付与" と記しておけば実装者の混乱を避けられる。 |
| 2 | LOW | completeness | spec.md | S2 の "stdout contains a created item report for the scaffold" という文言は any of the 4 logResult lines を指すが、どの項目（`specrunner/drafts: created` 等）をサンプルとして示すか明記されていない。実装時に判定文字列の選択ミスが起きる可能性は低い。 | 実装者への補足として tasks.md T-03 に記載済みの例（`specrunner/drafts: created`）を spec にも追記すると親切。 |

## Review Notes

以下の設計判断をソースコードで一次検証した。すべて仕様と一致している。

**`logResult` → stdout**（`src/logger/stdout.ts:240`）: S2/T2 の "stdout に created 報告" アサーションは正確。`logInfo`/`logError` は stderr に書くため JSON パースへの干渉はない。

**`getConfigPath()` の XDG 尊重**（`src/util/xdg.ts:8-19`）: `XDG_CONFIG_HOME` が設定されていれば `os.homedir()` を使わない。S3 の隔離 XDG 契約は確実に機能する。

**doctor `--json` stdout 出力**（`src/cli/doctor.ts:221-222`）: `formatJson` 結果は `stdoutWrite` 経由で stdout のみに書かれる。起動ログ等は stderr に分離されているため node ワンライナーでの JSON parse は安全。

**`config-file-exists` check の XDG 参照**（`src/core/doctor/checks/config/file-exists.ts:16`）: `ctx.configPath`（= `getConfigPath()` 経由）を stat する。隔離 XDG で init 後、0o600 で書かれた config が存在すれば `pass` を返す（`src/config/store.ts:205-214` の `saveConfig` は 0o600 で atomic write）。

**`GIT_CEILING_DIRECTORIES` の伝播**（`src/util/env-filter.ts:12-25`）: `stripSecrets` は `_TOKEN` / `_API_KEY` / `_SECRET` パターンのみを除去。`GIT_CEILING_DIRECTORIES` は対象外のため `spawnCommand` 経由の git subprocess に確実に伝わる。S1 の上位 repo 誤認リスクは正しく対処されている。

**`request new` の `ctx.repoRoot` 使用**（`src/cli/command-registry.ts:358-359`）: subdirectory cwd でも `ctx!.repoRoot!`（git 解決済み）を `executeNew` の cwd として渡す。S4 の "root 着地" 契約は製品コード側で担保済み。

**optional SDK と `--omit=optional`**（`tsup.config.ts:10`、`src/core/doctor/checks/index.ts`）: optional SDK はすべて external。doctor/init/request new の実行経路（`claudeCodeTokenPresentCheck` は env 参照のみ、`codexCliCheck` は CLI binary 呼び出しのみ）は optional SDK を動的ロードしない。`--omit=optional` での起動は安全。

**セキュリティ評価**: 本 change はローカル shell スクリプトによる CI ゲート拡張。外部入力を受け取らず固定 slug を使用しており injection 経路はない。`XDG_CONFIG_HOME`/`HOME` 隔離により実運用 credential への読み書きが防止されている。認証系経路は明示的にスコープ外とされており、CI への長期 token 追加リスクもない。OWASP Top 10 の適用対象外。
