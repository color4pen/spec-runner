# Code Review Feedback — iteration 001

## 検証した項目

### Diff scope
30 ファイル変更（+4213 行）。実装ファイル 6、テストファイル 5、設計/spec/state ファイル 14、vitest 設定 1、arch allowlist 1。

### FSM 変更 (`src/state/lifecycle.ts`)
- `REOPEN_TRANSITIONS` を `VALID_TRANSITIONS` と分離して宣言済み。`canTransition` は変更なし（`awaiting-archive → running` は引き続き `false`）。
- `transitionJob` の第 4 引数 `opts?: { allowReopen?: boolean }` はオプショナルで、既存呼び出し元への影響ゼロ。
- `VALID_TRANSITIONS` 未変更を `lifecycle-reopen.test.ts` (TC-002-a, TC-017-c) が 2 重にピン留め。

### OperatorEventRecord / fold (`src/store/event-journal.ts`, `job-journal.ts`)
- `OperatorEventRecord` 型定義・`EventRecord` union への追加・`fold()` での収集を確認。
- `FoldResult.operatorEvents` は `?: OperatorEventRecord[]` とオプショナル宣言（後方互換）だが `fold()` は必ず配列を返す。ドキュメント上は意図的なトレードオフ。
- ENOENT ブランチの手書き `FoldResult` リテラルに `operatorEvents: []` が追加済み（`job-journal.ts:148`）。
- `JobJournal.appendOperatorEvent` → `JobStateStore.appendOperatorEvent` の委譲チェーンを確認。

### ReopenCommand.prepare() (`src/core/command/reopen.ts`)
- Gate 順序: worktree guard → status gate → PR absent → no client → getPullRequest エラー → MERGED 拒否 → CLOSED 拒否 → step 解決 → request.md parse → store 構築 → operator event append → transitionJob → persist。
- 各 reject が独立メッセージ + PrepareError(1) を throw することを確認。worktree guard は PrepareError(2)。
- operator event を `transitionJob` 呼び出し前に `store.appendOperatorEvent` で書き込む（D6）。
- transition patch: `{ error: null, resumePoint: null, mainCheckoutDrift: null, pid: process.pid }` — `steps/reviewerStatuses/decisions/biteEvidence` は不含（D4）。

### CLI エントリ (`src/cli/reopen.ts`)
- `resume.ts` を鏡写しにした構造。`resolveGitHubToken` → `createGitHubClient` で GitHub client を構築してコマンドへ注入。
- トークン取得失敗時は `githubClient: null` を渡し、PR gate が fail-closed で弾く。
- `resolveRepoRoot` を `src/cli/reopen.ts` では呼び出していない（`RESOLVE_REPO_ROOT_ALLOWED_FILES` への追加不要）。`src/core/command/reopen.ts` 内の config ロード前呼び出しは `resume.ts` と同一パターン。

### コマンドレジストリ (`src/cli/command-registry.ts`)
- `guardedSubcommands` に `"reopen"` 追加済み（TC-010-a）。
- `from` フラグ: `values: [...AGENT_STEP_NAMES, ...CLI_STEP_NAMES]` で動的に設定。
- `reason` フラグ: 欠如時に `EXIT_CODE.ARG_ERROR` で exit（TC-004-c, TC-019-a）。
- `REOPEN_USAGE` 文字列あり。

### Arch allowlist (`tests/unit/architecture/arch-allowlist.ts`)
- `src/cli/reopen.ts` (CWD-reopen-cli-di-default) と `src/core/command/reopen.ts` (CWD-core-reopen-di-default) を追加。パターンはいずれも `cwd ?? process.cwd()` の DI デフォルト。

### テストカバレッジ (test-cases.md 照合)
24 テストケース全件がテスト実装にマッピング済み。

| TC | ファイル | 確認 |
|----|---------|------|
| TC-001 | reopen-command.test.ts | ✅ |
| TC-002 | lifecycle-reopen.test.ts | ✅ |
| TC-003 | reopen-command.test.ts | ✅ |
| TC-004 | command-registry-reopen.test.ts | ✅ |
| TC-005 | reopen-command.test.ts | ✅ |
| TC-006 | reopen-command.test.ts | ✅ |
| TC-007 | reopen-command.test.ts | ✅ |
| TC-008 | reopen-command.test.ts | ✅ |
| TC-009 | event-journal-operator-event.test.ts | ✅ |
| TC-010 | command-registry-reopen.test.ts | ✅ |
| TC-011 | reopen-approval-invalidation.test.ts | ✅ |
| TC-012 | reopen-approval-invalidation.test.ts | ✅ |
| TC-013 | reopen-command.test.ts | ✅ |
| TC-014 | reopen-command.test.ts | ✅ |
| TC-015 | reopen-command.test.ts | ✅ |
| TC-016 | lifecycle-reopen.test.ts | ✅ |
| TC-017 | lifecycle-reopen.test.ts | ✅ |
| TC-018 | reopen-command.test.ts | ✅ |
| TC-019 | command-registry-reopen.test.ts | ✅ |
| TC-020 | reopen-command.test.ts | ✅ |
| TC-021 | reopen-command.test.ts | ✅ |
| TC-022 | event-journal-operator-event.test.ts | ✅ |
| TC-023 | event-journal-operator-event.test.ts | ✅ |
| TC-024 | command-registry-reopen.test.ts / event-journal-operator-event.test.ts | ✅ |

### 承認失効の経路確認 (D5, T-06)
- `selectPendingMembers`（`reviewer-status.ts`）: `approvedAtCommit !== baselineCommit` の場合 pending 扱い。`null` approvedAtCommit も fail-closed で pending。
- `conformanceApprovedForVerifiedRevision`（`reverification.ts`）: conformance commitOid ≠ verification commitOid → false。absence の場合も false（fail-closed）。
- reopen 後に HEAD が進めば両関数が自動的に旧承認を除外する。investigationで追加失効ロジックが不要と判断されており、その結論をピン留めするテスト (TC-011, TC-012) も存在する。

### verificationresult 確認
- build / typecheck / test / lint / changed-line-coverage の全フェーズが exit 0（8625 passed / 1 skipped）。

## 検証できなかった項目

None — 全アクセプタンス基準とテストケースを静的コード解析で確認した。

## Findings 詳細

### F-1: `REOPEN_USAGE` が step リストを動的式でなくリテラルで定義している

`command-registry.ts:293–295`:
```typescript
Valid steps: ${[...["request-review", "design", "spec-review", ...]].join(", ")}
```
`AGENT_STEP_NAMES`/`CLI_STEP_NAMES` の動的展開ではなく、冗長な spread + リテラル配列を使用。`--from` フラグのバリデーション自体は動的配列で正しいため機能上の問題はないが、将来のステップ追加でヘルプテキストが追従しなくなるメンテナンスリスク。

影響: ヘルプテキストのみ。機能に影響なし。

### F-2: `FoldResult.operatorEvents` がオプショナル型だが `fold()` は必ず配列を返す

`event-journal.ts:185`:
```typescript
operatorEvents?: OperatorEventRecord[];
```
`fold()` の返却オブジェクトには常に `operatorEvents: operatorEventRecords` が含まれるが、インターフェースがオプショナルなため、型システム上は呼び出し元が `undefined` ガードを書く必要がある。コメントで「backward compat」と明示されており意図的なトレードオフ。型精度の低下として記録する。

影響: 型安全性の軽微な低下。ランタイム挙動に影響なし。

### F-3: `store` が null のとき operator event が無言でスキップされる

`core/command/reopen.ts:239–243`:
```typescript
if (store) {
  await store.appendOperatorEvent({...});
}
```
`resolveStateStoreByJobId` が null を返す降格シナリオ（sidecar 欠損）では、operator event が events.jsonl に書き込まれず D6 の durability 保証が成立しない。その後の `persist` もスキップされるため、ディスク上の状態は `awaiting-archive` のままパイプラインが `running` として走る。

`resume.ts` の `if (runStore) await runStore.persist(transitioned)` と同一パターンであり、新たな regression ではない。ただし resume には journal 先書き要件がなく、reopen には D6 の明示的な durability 要件がある点が異なる。

発生条件: sidecar が存在しない極めて稀な降格状態（PR gate を通過した job で実用上は非常に低確率）。影響: 運用上の問題は低いが D6 の保証が成立しない。

