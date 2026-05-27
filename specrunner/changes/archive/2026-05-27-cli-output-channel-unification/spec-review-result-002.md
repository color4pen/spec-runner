# Spec Review Result

- **verdict**: needs-fix
- **reviewer**: spec-review agent
- **date**: 2026-05-27

---

## Summary

前回 (spec-review-result-001) の Critical 指摘 F-1 は修正済み。pipeline-orchestrator delta spec に `## Removed` セクションが追加され、衝突する baseline 要件が正しく削除対象に指定されている。

cli-commands delta spec の修正試行 (前回 F-2 対応) は技術的に正しい意図を持つが、非正規のセクションヘッダー `## Modified` を使用している。delta merge tool が `## Modified` セクションを処理しない場合、baseline の誤った scenarios（stdout → stderr）が更新されないまま残る。これが本レビューの唯一の Critical 指摘。

---

## Previous Findings Status

| ID | 前回評価 | 今回ステータス |
|---|---|---|
| F-1 | Critical | **FIXED** — pipeline-orchestrator delta spec に `## Removed` セクション追加済み |
| F-2 | Advisory | **要継続確認** — 修正試みあり、ただし形式問題により F-4 として再分類 |
| F-3 | Advisory | **未対応 (低優先)** — request.md の受け入れ基準と delta spec の例外記述が不一致のまま |

---

## Critical Findings

### F-4: `cli-commands` delta spec が非正規セクションヘッダー `## Modified` を使用している

**問題**

`specrunner/changes/cli-output-channel-unification/specs/cli-commands/spec.md` の冒頭セクションは以下の構造になっている:

```
## Modified

### Requirement: `specrunner job start` の preflight は GitHub token 取得元を info ログに出力する
...（stderr シナリオに修正済み）

## Requirements

### Requirement: CLI 出力チャネル規約
...（新規追加）
```

rules.md の「使用するセクションヘッダー」で正規とされているのは:
- `## Requirements` — 変更・追加する Requirement をすべて記載（ADDED/MODIFIED の区別なし）
- `## Removed` — 削除する Requirement 名リスト
- `## Renamed` — リネームする場合

`## Modified` は正規ヘッダーではない。delta merge tool が `## Requirements` セクションのみを処理する場合、`## Modified` 配下の要件は無視され、baseline の以下のシナリオが誤ったまま残る:

```
#### Scenario: preflight 成功時に取得元が stdout に出る
- THEN stdout に `GitHub token source: credentials` の info ログが 1 行出力される
```

この `logInfo` は本 change で stderr に変更されるため、baseline シナリオが stdout を参照し続けることは実装と乖離した spec corpus になる。

**修正方法**

`## Modified` セクション配下の要件を `## Requirements` セクションに移動する。`## Requirements` セクション内で baseline と同一の要件ヘッダー名を使用すれば、tool が自動的に MODIFIED として分類する。

修正後の構造:

```
## Requirements

### Requirement: `specrunner job start` の preflight は GitHub token 取得元を info ログに出力する

`runPreflight` 実行時、`resolveGitHubToken` が成功した直後に MUST 取得元を info ログに 1 行出力する。

- credentials.json 由来: `GitHub token source: credentials`
- env var 由来: `GitHub token source: env`

#### Scenario: preflight 成功時に取得元が stderr に出る

- **WHEN** `specrunner run` を起動し、preflight の token resolve が credentials.json で成功する
- **THEN** stderr に `GitHub token source: credentials` の info ログが 1 行出力される (stdout には出力されない)

#### Scenario: env var 経由でも取得元が表示される

- **WHEN** `specrunner run` を起動し、preflight の token resolve が `GITHUB_TOKEN` env var で成功する
- **THEN** stderr に `GitHub token source: env` の info ログが 1 行出力される (stdout には出力されない)

### Requirement: CLI 出力チャネル規約
...（既存の新規要件）
```

---

## Advisory Findings

### F-3: request.md 受け入れ基準と delta spec の例外記述が引き続き不一致

前回 F-3 と同内容。request.md の受け入れ基準は「`logger/stdout.ts` 内の最終出力点を除く」としているが、delta spec (`cli-commands/spec.md`) は `progress.ts` も例外として明示している。実装の正は delta spec であり、実装への影響はないが、request.md を受け入れ基準として参照する際の混乱を避けるには更新が望ましい。本レビューでは修正を強制しない。

---

## Security Review

前回レビューの security 評価に変更なし:

- `stdoutWrite` / `logResult` への `maskSensitive` 適用は正当な改善。
- EventPayloadMap のペイロード (`step: string`, `iteration: number`, `verdict: string`) はセンシティブデータを含まず、progress.ts の直接 `process.stderr.write` 使用は合理的。
- 入力バリデーション・認証・認可ロジックへの変更なし。OWASP Top 10 非該当。

---

## Required Fix

**F-4 のみ必須修正。**

`specrunner/changes/cli-output-channel-unification/specs/cli-commands/spec.md` を以下のように変更する:

1. `## Modified` セクションヘッダーを削除する
2. その配下にある `### Requirement: \`specrunner job start\` の preflight は GitHub token 取得元を info ログに出力する` を `## Requirements` セクションの先頭に移動する
3. `## Requirements` セクションは既存の `### Requirement: CLI 出力チャネル規約` の前にこの要件を持つ形にする

これにより delta merge tool が baseline の当該要件を MODIFIED として正しく上書きし、stdout → stderr の変更が baseline に反映される。
