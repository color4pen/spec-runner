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
| 1 | LOW | Test coverage | tasks.md T-05 | `saveConfig` が `github` を strip しないことを直接検証するユニットテストが T-05 に列挙されていない。`tests/config/store.test.ts` は `loadConfig` オーバーレイのテストが中心で、`saveConfig` の strip 挙動を扱うテストがない。spec.md の "GHES config survives saveConfig" シナリオは init/login の E2E 経由で間接カバーされるが、T-01 の acceptance criteria が要求する「saveConfig への直接呼び出しで github フィールドが保持される」テストがない | T-05 に `tests/config/store.test.ts` への `saveConfig` 単体テストを追加する。ただし実装担当者の判断で E2E カバレッジに委ねても可（非ブロッキング） |
| 2 | LOW | Redundant I/O | tasks.md T-03 | `login.ts` はデバイスフロー前に `loadConfig()` を呼んで githubHost を取得する（line 60）。T-03 が提案する `fs.access` による存在チェックはこの結果を再利用せず独立したファイルアクセスを追加する。機能的な誤りではないが、最初の `loadConfig()` の成否でそのまま「config 存在」判断ができる | 実装時に最初の `loadConfig()` 結果（成功 = config あり、ENOENT throw = config なし）を変数で持ち越すことで `fs.access` を省略できる。tasks.md の記述は参考方針であり厳密な制約ではないため実装者判断で可 |

## Verification Notes

コードとの照合結果（全主張を確認）:

- `src/config/store.ts:213` — `delete toSave["github"];` と stale コメント `// removed in github-credential-env-separation (secrets moved to credentials.json)` が実在。`SpecRunnerConfig` の `github` フィールドは `GitHubHostConfig`（`host?: string; apiBaseUrl?: string`）であり非 secret が確認済み。`agent` / `timeout` / `anthropic` の strip は旧 schema 防御として正当。
- `src/cli/init.ts:33-61` — `loadConfig()` → `newConfig` 組み立て → `saveConfig()` の無条件 round-trip と、`delete runtime` / `delete anthropic`（lines 58-59）を確認。
- `src/cli/login.ts:75-87` — `loadConfig()` / catch でスキャフォールド → `saveConfig(config)` の無条件 round-trip と、line 86 の stale コメントを確認。
- `src/config/store.ts:226` — `saveProjectConfig` の呼び出し元ゼロを確認。スコープ外扱いは適切。

## Security Review

- **ファイルパーミッション**: `CONFIG_MODE = 0o600` が `atomicWriteJson` に渡されており適切。変更後も維持される。
- **アトミック書き込み**: `atomicWriteJson` による書き込みで中途半端な状態が残らない。
- **機密データの分離**: token は `credentials.json` のみ、config には保存しない設計はこの変更後も維持・強化される。
- **パストラバーサル**: `getConfigPath()`（XDG ベース）を使用しており、ユーザー入力はパス解決に介在しない。
- **TOCTOU**: D2/D3 の `fs.access` → scaffold 生成の間に短い窓があるが、ユーザーローカルな config ファイルへの操作でセキュリティ境界を越えるリスクはない。
- **OWASP Top 10 該当なし**: 入力検証は既存 `validateConfig` / `applyMigration` が担っており、新規の入力経路は追加されない。

## Summary

仕様書（request.md / design.md / tasks.md / spec.md）は一貫しており、バグの原因・影響・修正方針・スコープ外の境界がすべて明確。受け入れ基準は自動テスト可能で要件を過不足なく網羅している。設計の選択（「create-only」セマンティクス）は request.md で architect 評価済みであり、スペックに矛盾はない。実装上の注意点は上記 LOW 2 件のみで、ブロッキング問題はない。
