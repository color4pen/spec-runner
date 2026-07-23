# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだファイル
- `request.md` — 背景・要件・スコープ外・受け入れ基準・architect 評価
- `design.md` — D1〜D5 の設計判断、Detection contract、Risks/Trade-offs
- `spec.md` — 2 Requirement + 5 Scenario（Given/When/Then）
- `tasks.md` — T-01〜T-05 の実装タスクと受け入れ基準（attempt 2 版）
- `spec-review-result-001.md` — 前回 attempt の findings（F-1: archiveSha===undefined テスト欠落、F-2: キャッシュ不変条件テスト欠落）
- `src/core/archive/merge-then-archive.ts`（L1-L100、L155-L220、L275-L310、L590-L650）— 現状の wait loop 実装

### 前回 findings の解消確認

| finding (attempt 1) | 対応箇所（attempt 2 tasks.md） | 状態 |
|---|---|---|
| F-1: spec.md Scenario 4 の `archiveSha === undefined` ケースにテストがない | T-04 (d) 追加 + Acceptance Criteria 追加 | ✅ 解消 |
| F-2: 「1 回のみ評価」キャッシュ不変条件（spec.md MUST）がテストで固定されていない | T-04 (a) に `git ls-tree` call count = 1 アサーション追加 + Acceptance Criteria 追加 | ✅ 解消 |

### 要件トレーサビリティ

| request.md 受け入れ基準 | spec.md Scenario | tasks.md |
|---|---|---|
| push/pull_request workflow → grace 超過後も merge に進まず timeout escalation | Scenario 1 | T-04 (a) |
| workflow 定義なし → grace 超過後 merge | Scenario 2 | T-04 (b) |
| schedule のみ → CI-less → merge | Scenario 3 | T-04 (c) |
| archiveSha===undefined → fail-closed（Scenario 4 case A） | Scenario 4 | T-04 (d) |
| inspection 失敗 → fail-closed（Scenario 4 case B） | Scenario 4 | T-01 acceptance criteria |
| local git のみ（GitHub API 追加呼び出しなし） | Scenario 5 | T-01 acceptance criteria |
| 新規 package 依存なし | Scenario 6 | T-05 |

### キャッシュ不変条件の保護確認

spec.md Requirement 1 "MUST be computed at most once per run and reused across poll iterations" は T-04 (a) に「keyed `spawn` が `git ls-tree` 呼び出しを記録し、全 poll iteration にわたって count = 1 であることを assert」と明記されており、Acceptance Criteria にも「The at-most-once detection invariant (spec.md Requirement 1) is fixed by a spawn call-count assertion.」と記載されている。歯化済み。

### セキュリティ確認

- **コマンドインジェクション**: `archiveSha` は git 由来の commit SHA。`spawn(cmd, args, opts)` の array 引数として渡されるためシェル展開なし。インジェクションリスクなし。
- **任意パス読み取り**: `git cat-file -p <blobSha>` は git オブジェクトストア内の blob を読む。ユーザー制御のファイルパスを直接 fs で開かない。
- **OWASP A3 Injection**: spawn に array args を使うため shell interpolation なし。
- **新規依存**: T-05 および request 要件とも `package.json` `dependencies` 無変更を明示。YAML parser 追加なし。

### Regex パターン検証

推奨パターン `/(?:^|[\s,[{'"])push(?:[\s,:\]}'"]|$)|(?:^|[\s,[{'"])pull_request/m` を代表的な YAML 構文でトレース：

| 入力 | 結果 |
|---|---|
| `on: push` | ✓ match（space + push + EOL） |
| `on: [push, pull_request]` | ✓ match |
| `on:\n  push:\n` | ✓ match（spaces + push + `:`） |
| `push-image:` (job name) | ✓ no-match（`-` はサフィックスクラス外） |
| `pull_request_target` | ✓ match（prefix マッチ → 意図的） |
| `docker push image` (step run) | ⚠ false positive → fail-closed 側に倒れるため設計上許容 |

### D5（archiveSha === undefined）のコード経路確認

- L290: `archiveSha = archiveRecordResult.headSha`（型 `string | undefined`）
- L285-287: `archiveRecordResult.exitCode !== 0` で早期 return → `archiveSha === undefined` は archive 成功後の git rev-parse 失敗時のみ
- T-02: `if archiveSha === undefined → treat as CI-present (fail-closed, D5)` と明記
- T-04 (d): 統合テストで経路を歯化

### `null` timeout の挙動確認

`effectiveTimeoutMs === null`（無期限）+ CI-present の場合、ループは無期限継続。design.md Risks セクションに明記済み。spec.md の「期限超過時は escalation」要件は有限 timeout 時のみ適用される。設計上の既知トレードオフで spec との矛盾なし。

## 検証できなかった項目

- 実際の `git ls-tree <ref> -- .github/workflows/` の出力フォーマット再現（design.md は「empirically confirmed」と記載）
- `typecheck && test` の実行（実行環境なし）

## Findings 詳細

なし。前回 attempt の F-1・F-2 は tasks.md の更新により解消済み。
