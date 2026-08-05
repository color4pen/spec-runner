# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### コード参照の正確性（request.md / design.md）

| 参照 | 検証結果 |
|------|---------|
| `commit-push.ts:619-631` — file-count guard | ✓ 実測で一致（`if (stagePaths.length > limit)` ブロック） |
| `commit-push.ts:113-170` — `getWorktreeChangedPaths` | ✓ 実測で一致（関数定義 113〜170） |
| `commit-push.ts:912-934` — `pushOnly` | ✓ 実測で一致（1 retry / 5s） |
| `errors.ts:532-550` — `stagingLimitExceededError` | ✓ 実測で一致（hint + message + code） |
| `errors.ts:134` — `STAGING_LIMIT_EXCEEDED` in `ERROR_CODES` | ✓ 実測で一致 |
| `staging-containment.ts` — `DEFAULT_MAX_STAGED_FILES = 2000`、resolver 群 :39-59 | ✓（定数は line 28、resolver 群は :39-59） |
| `config/schema/types.ts:247-262` — `PipelineConfig` | ✓（`maxStagedFiles` は line 262） |
| `config/schema/validation.ts:241-252` — `maxStagedFiles` 検証 | ✓（`optional(number(...).check(int(...), gte(1,...)))` パターン確認） |
| `prompts/fragments.ts:16-20` — `COMMIT_DISCIPLINE` | ✓（git operations 禁止のみ、衛生規律は未追加が現状） |
| `executor.ts:102` — `CommitPushInfra` 構築（`statFn` なし） | ✓（`{ spawnFn, sleepFn, events }` のみ） |
| `STAGING_LIMIT_EXCEEDED` が `EXIT_CODE_MAP` に不在 | ✓ 実測で不在を確認 |

### `COMMIT_DISCIPLINE` の共有範囲

`src/prompts/` 配下を grep した結果、`COMMIT_DISCIPLINE` は以下の 6 ファイルでインポート・利用される：
`implementer-system.ts`、`build-fixer-system.ts`、`code-fixer-system.ts`、`test-materialize-system.ts`、`spec-fixer-system.ts`、`adr-gen-system.ts`。
design.md・tasks.md の記述（6 producer prompts）と一致する。

### 既存テストとの互換性

- `commit-push-guarded-staging.test.ts` の `makeInfra` は `statFn` を設定しない（実測確認）
- 偽 CWD（`/tmp/fake-repo-guarded-staging-test`）では全パスが ENOENT → 0 バイト → 合計 0 → 50 MiB 未満 → バイトガード不発火
- 既存 TC-001〜TC-020 は無修正のまま green を維持できる（論拠は設計 Risks 節と一致）

### docs/configuration.md の Guarded staging 節

line 411-438 が "Guarded staging containment" 節であることを実測確認。T-10 の追記対象として正しい。

### 設計決定の内部整合性（design.md ↔ spec.md ↔ tasks.md）

| 決定 | 整合先 | 評価 |
|------|--------|------|
| D1: バイトガード位置（file-count 直後・git add 前） | spec.md 要件 / T-03 | ✓ |
| D2: `lstat` 非圧縮バイト測定 | spec.md 要件 2 / T-01 | ✓ |
| D3: ENOENT → 0、他エラー → fail-closed 再 throw | spec.md 要件 2 シナリオ / T-01 / T-03 | ✓ |
| D4: `STAGED_BYTES_LIMIT_EXCEEDED` distinct error | spec.md 要件 3 / T-02 | ✓ |
| D5: `statFn?` optional injectable probe | T-03 / executor.ts 無変更 | ✓ |
| D6: config schema mirror（validation / types） | spec.md 要件 4 / T-04 | ✓ |
| D7: `COMMIT_DISCIPLINE` 単一編集点 | spec.md 要件 5 / T-05 | ✓ |

### セキュリティ観点

- **Path traversal**: `lstat(pathJoin(cwd, p))` の `p` は `git status --porcelain` 出力由来。git は `..` や絶対パスを status に出力しないため path traversal は発生しない
- **入力バリデーション**: `maxStagedBytes` は `int + gte(1)` で正の整数に限定。型強制不可
- **TOCTOU**: lstat 後〜git add 前のファイル書き換えは理論上存在するが、CLI ローカル実行の文脈で許容範囲。fail-closed 側に倒れるため安全

### テストカバレッジの対応表

| 受け入れ基準 | TC | タスク |
|------------|-----|--------|
| file 数以下 × バイト超過 → halt、add/commit/push 不実行 | TC-030 | T-07 |
| バイト以下（file 数も以下）→ commit + push 進行 | TC-031 | T-07 |
| 削除予定 path → 0 バイト扱い、誤発火なし | TC-032 | T-07 |
| halt メッセージに総バイト・閾値・内訳・対処含む | TC-034 (unit) | T-06 |
| `maxStagedBytes` schema validation | TC-038/TC-039 | T-08 |
| `COMMIT_DISCIPLINE` 衛生規律文言存在 | TC-040 | T-09 |
| 独立性（バイト超過 → bytes halt、file-count guard 不発火） | TC-041 | T-07 |
| 既存テスト無変更 green | TC-001〜TC-020 | T-11 |

## 検証できなかった項目

- `bun run typecheck && bun run test` の実行（実行環境なし）
- `docs/configuration.md` 追記後の Markdown 整合性（未実装のため）
- 合成済み `IMPLEMENTER_SYSTEM_PROMPT` 等の文字列（実行時生成のため静的ファイルなし）

## Findings 詳細

### F-001: TC-034 が T-06（unit）と T-07（integration）で重複使用されている

**severity**: low  
**resolution**: fixable  
**file**: `specrunner/changes/staging-containment-followups/tasks.md`

T-06（line 163）と T-07（line 188）の両方に TC-034 が割り当てられている。T-06 の TC-034 は `stagedBytesLimitExceededError` の unit 構築テスト、T-07 の TC-034 は over-byte 時の統合メッセージ確認テストで内容は別物。TC ID 重複はテスト実行レポートで衝突し、どちらが合否かの特定が困難になる。T-07 の integration 版を TC-042 等の別 ID に変更することで解消する。

### F-002: TC-033（測定失敗 → fail-closed）が `git add` 不実行の assertion を欠く

**severity**: low  
**resolution**: fixable  
**file**: `specrunner/changes/staging-containment-followups/tasks.md`

TC-030 の destructive confirmation は「`subcommands` contains NEITHER `add` NOR `commit` NOR `push`」と明示しており、request.md の受け入れ基準「git add / commit / push が一切実行されずに halt する（TC-004 と同型）」に対応する。TC-033（line 184）は「subcommands contains NEITHER `commit` NOR `push`」のみで `add` が欠けている。バイト測定失敗は `git add` 呼び出し前に throw するため、`add` も不実行であることの assert を追加すべきである。
