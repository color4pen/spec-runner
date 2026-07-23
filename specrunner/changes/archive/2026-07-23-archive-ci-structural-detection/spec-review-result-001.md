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
- `tasks.md` — T-01〜T-05 の実装タスクと受け入れ基準
- `src/core/archive/merge-then-archive.ts`（L1〜L655）— 現状の wait loop 実装
- `src/core/archive/__tests__/merge-then-archive.test.ts`（全体）— 既存テスト群
- `src/util/spawn.ts` — SpawnFn 型定義の確認

### 確認した要件トレーサビリティ

| spec.md Scenario | 対応タスク |
|---|---|
| Scenario: push/pull_request workflow → wait + escalation | T-04 (a) |
| Scenario: no workflow → merge | T-04 (b) |
| Scenario: schedule-only workflow → CI-less → merge | T-04 (c) |
| **Scenario: unreadable archive commit → fail-closed** | T-01 `inspection-failed` のみ（後述） |
| Scenario: detection uses local git only | T-01 受け入れ基準（構造的保証） |
| Scenario: no new package dependency | T-05 |

### 既存テストへの影響分析

`TBG-05`（none-grace → CI-less → merge regression）は `makeSpawn()` が全 spawn 呼び出しに対し `{ exitCode: 0, stdout: "", stderr: "" }` を返す。新実装で grace 超過時に `git ls-tree` が呼ばれると、空の stdout → blob なし → `no-workflows` → CI-less → merge となり、TBG-05 は変更なしで通過する。T-04 もこの前提を明示している。

### セキュリティ確認

- **コマンドインジェクション**: `archiveSha` は `archiveRecordResult.headSha`（git 由来の commit SHA）。`spawn(cmd, args, opts)` の array 引数として渡されるため、シェル展開なし。インジェクションリスクなし。
- **任意パス読み取り**: `git cat-file -p <sha>` は git オブジェクトストア内の blob を読む。ユーザー制御のファイルパスを直接 fs で開かない。
- **新規依存**: T-05・request 要件とも package.json `dependencies` 無変更を明示。YAML parser 追加なし。
- **OWASP A3 Injection**: spawn に array args を使うため shell interpolation なし。

### Regex パターン検証

推奨パターン `/(?:^|[\s,[{'"])push(?:[\s,:\]}'"]|$)|(?:^|[\s,[{'"])pull_request/m` を代表的な YAML 構文でトレース:

| 入力 | 結果 |
|---|---|
| `on: push` | ✓ match（space + push + EOL） |
| `on: [push, pull_request]` | ✓ match（`[` + push + `,`、space + pull_request + `]`） |
| `on:\n  push:\n` | ✓ match（spaces + push + `:`） |
| `push-image:` (job name) | ✓ no-match（push 後が `-` → suffix class 外） |
| `docker push image` (step run) | ⚠ false positive（space + push + space）→ fail-closed に倒れるため仕様上許容 |
| `pull_request_target` | ✓ match（prefix マッチ → 意図的） |
| `PUSH_API_KEY` | ✓ no-match（大文字、case sensitive） |

### `null` timeout の挙動確認

`effectiveTimeoutMs === null`（無期限）+ CI-present の場合、ループは無期限継続。design.md Risks セクションに明記済み。spec.md の「期限超過時は escalation」要件は有限 timeout 時のみ適用される。設計上の既知トレードオフ。

### D5（archiveSha === undefined）のコード経路確認

- `archiveSha = archiveRecordResult.headSha`（L290）
- `archiveRecordResult.exitCode !== 0` の場合 L285-287 で早期 return → `archiveSha` の undefined は archive 成功後の git rev-parse 失敗時のみ
- L519: `archiveSha !== undefined && headSha !== archiveSha` のガードで、`archiveSha === undefined` 時は headSha 一致待ちをスキップ
- D5 の「treat as CI-present」は grace 超過時の CI 判定コードで実装される（T-02 の gate）

## 検証できなかった項目

- 実際の `git ls-tree <ref> -- .github/workflows/` の出力フォーマット再現（design.md は「empirically confirmed」と記載、手元での実行不可）
- `typecheck && test` の実行（実行環境なし）
- `git cat-file` の null exitCode（ENOENT 等 spawn error 時）時の挙動 — `SpawnResult.exitCode: number | null` で null が `!== 0` を満たすため fail-closed 動作は成立するが、tasks が「exit ≠ 0」を null 込みで明示していない

## Findings 詳細

### F-1: spec.md Scenario 4 の一部がテストタスク未カバー（LOW）

**spec.md Scenario 4**:
```
Given an unmerged, non-BLOCKED PR for which the archive commit SHA is unavailable,
or the archive commit's tree cannot be inspected with local git
Then it treats the repo as CI-present and continues waiting (fail-closed)
```

この Scenario には 2 つのケースが含まれる:
- **ケース A**: archive commit SHA が unavailable（`archiveSha === undefined`）
- **ケース B**: tree が inspectable でない（git call 失敗 → `inspection-failed`）

ケース B は T-01 の unit test "Returns `present: true, reason: "inspection-failed"` when `git ls-tree` or `git cat-file` exits non-zero" でカバーされている。

ケース A（`archiveSha === undefined`）は T-02 の実装仕様として記述されているが、T-04 の wait-loop 統合テストにケース A 専用のテストが存在しない。`archiveSha === undefined` → detector を呼ばずに CI-present として wait 継続 → mergeWaitTimeoutMs 超過で escalation、という経路が自動化テストで固定されていない。

**影響**: `archiveSha === undefined` は archiving 成功後の git rev-parse 失敗という異常経路であり、実装は単純な null ガードであるため実装誤りリスクは低い。ただし、spec.md が 4 つ目の Scenario として明示しているにもかかわらず対応するテストタスクがないことは、当 spec review でフラグを立てるべき gap である。

**提案**: T-04 に「`runArchiveOrchestrator` が `headSha: undefined` を返した場合、grace 超過後に merge に進まず escalation または wait 継続すること」のテストケースを追加する。

---

### F-2: キャッシュ不変条件「1 回のみ評価」がテストで固定されていない（LOW）

spec.md Requirement 1 は "The structural decision MUST be computed at most once per run and reused across poll iterations" と SHALL で要求している。T-02 もキャッシュ変数の追加を指定している。しかし T-04 のどのテストも「複数 poll iteration にわたって detector（spawn 呼び出し）が 1 回しか呼ばれない」ことを assert していない。

**影響**: 正確性には影響しない（決定論的な結果が繰り返し呼ばれても correctness は維持される）。ただし MUST として明記された仕様的不変条件がテストで保護されていない。CI-present かつ poll が複数回まわる scenario（新テスト (a)）は既存の `mergeWaitTimeoutMs` タイムアウト escalation テストとして追加されるが、その中で spawn call 回数を assert しなければキャッシュの実装が抜けていても気づけない。

**提案**: T-04 (a) のテストで、`spawn` が `git ls-tree` を 1 回しか呼んでいないことを `expect(spawnMock).toHaveBeenCalledTimes(n)` 等で検証する、または T-01 の unit test にキャッシュ統合テストを追加することを検討する（必須ではないが仕様 MUST の歯化として有効）。

---

### INFO: Regex パターンの精度は実装者に委ねられている

design.md D2 は `Recommended pattern (implementer may refine while preserving the fail-closed bias and the three acceptance cases in D4)` と記述し、具体的な実装パターンを確定していない。T-04 の 3 つの acceptance case がテストハーネスとして機能し、bias（false positive 許容・false negative 不許容）が正しい側に倒れることを保護している。運用上の問題なし。

---

### INFO: `SpawnResult.exitCode: number | null` の null 扱い

tasks が "exit ≠ 0" と記述しているが、spawn error（ENOENT 等）時は `exitCode = null`。`null !== 0` は JavaScript で `true` のため fail-closed 動作は自動的に正しく動作する。ただし TypeScript 実装では `exitCode !== 0` の型ガードが `number | null` に対して正しく動作することを実装者は確認する必要がある（型エラーとはならないが、意図を comment で明記することが望ましい）。
