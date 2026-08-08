# Code Review Feedback — touched-files-propagation — iter 1

## 検証した項目

- `git diff main...HEAD --stat` でスコープ確認（31 ファイル、3582 行追加）
- 実装ファイル全読み:
  - `src/adapter/claude-code/touched-files-recorder.ts`（記録ロジック）
  - `src/adapter/shared/touched-files-bundle.ts`（注入ビルダー）
  - `src/core/port/agent-runner.ts`（`AgentRunResult.touchedFiles` 追加）
  - `src/state/schema/types.ts`（`JobState.touchedFiles` 追加、index signature 追加）
  - `src/state/schema/operations.ts`（`validateJobState` 検証ブロック追加）
  - `src/core/step/commit-orchestrator.ts`（`touchedFiles` state 書き込み）
  - `src/core/step/executor.ts`（`runAgentStep` 透過）
  - `src/store/job-state-store.ts`（`NormalizedJobState` 型定義変更）
  - `src/store/job-state-projection.ts`（`stateToStateJson` の素通し確認）
  - `src/adapter/claude-code/agent-runner.ts`（記録配線・注入配線 diff）
  - `src/adapter/codex/agent-runner.ts`（注入配線 diff）
- テストファイル全読み（TC-001〜TC-025 全 25 ケース）
- design.md / tasks.md / spec.md / test-cases.md を参照し仕様と実装の一致を確認
- verification-result.md にて typecheck && test && lint && changed-line-coverage の全フェーズ green を確認

## 検証できなかった項目

None — スコープ内の全要素を確認した。

## Findings 詳細

### F-01: `JobState` と `AgentRunResult` への index signature 追加（medium / fixable）

**該当箇所**:
- `src/state/schema/types.ts` l.555: `[key: string]: unknown`
- `src/core/port/agent-runner.ts` l.319: `[key: string]: unknown`

**背景**: テストコードが `(result as Record<string, unknown>)["touchedFiles"]` 形式のキャストを使用しており、コンパイルを通すために両インターフェースに index signature を追加した。

**問題点**:

1. `touchedFiles` は今回の変更で両インターフェースに **名前付き typed フィールドとして追加済み**。`state.touchedFiles`、`result.touchedFiles` で直接アクセス可能であり、`as Record<string, unknown>` キャスト自体が不要になっている。index signature はその解消手段として必要以上に広い。

2. `JobState` への index signature 追加が `NormalizedJobState` 型定義の変更（`Omit<JobState, "steps"> → JobState &`）を必要とした。`Omit` は index signature を削除するため、index signature がある型に `Omit` を使うと index signature が失われるという TypeScript の挙動が原因。

3. 任意のプロパティを `JobState` や `AgentRunResult` に追加しても TypeScript が警告しなくなる（型の縛りが弱まる）。将来の誤った追加を見逃すリスクがある。

**修正案**: テストの `(state as Record<string, unknown>)["touchedFiles"]` を `state.touchedFiles` に修正し、index signature を除去する。`NormalizedJobState` も元の `Omit<JobState, "steps"> & { steps: ... }` 形式に戻せる。

---

### F-02: `buildTouchedFilesSection` の不要な `as unknown as` キャスト（low / fixable）

**該当箇所**: `src/adapter/shared/touched-files-bundle.ts` l.27

```ts
const touchedFiles = (state as unknown as { touchedFiles?: Record<string, string[]> }).touchedFiles;
```

`JobState.touchedFiles` が T-01 で typed optional field として追加されたため、このキャストは冗長。`state.touchedFiles` で直接アクセスできる。

**修正案**:
```ts
const touchedFiles = state.touchedFiles;
```

---

### F-03: cap 到達後に `seen.add` を行わない（low / observation）

**該当箇所**: `src/adapter/claude-code/touched-files-recorder.ts` l.89–93

```ts
if (seen.has(normalized)) continue;
if (result.length >= MAX_TOUCHED_FILES) continue;  // seen に追加されないまま continue
seen.add(normalized);
result.push(normalized);
```

100 件 cap に達した後に同一パスが複数回現れると、`seen` チェックを毎回パスして cap チェックまで到達する。結果は正しいが冗長な処理が発生する。バグではなく効率の問題。

**修正案（オプション）**:
```ts
if (seen.has(normalized)) continue;
seen.add(normalized);  // cap 到達後もデデュープは `seen` で担保
if (result.length >= MAX_TOUCHED_FILES) continue;
result.push(normalized);
```

---

### F-04: `validateJobState` は配列の要素型を検証しない（low / observation）

**該当箇所**: `src/state/schema/operations.ts` l.328–333

`touchedFiles` の value は `!Array.isArray(value)` のみチェックし、配列要素が string かを検証しない。非 string 要素（数値、null 等）がバリデーションを通過する。

design.md D2 が「軽量検証」と明記しており、既存の `biteEvidence` 等と同方針のため設計上の選択として受け入れられる。将来的に strict 検証が必要になった場合の拡張ポイントとして認識。

---

## Test Coverage

全 27 TC が対応テストにマッピング済みで green。

| TC | 優先度 | 対応ファイル | 状態 |
|----|--------|------------|------|
| TC-001〜TC-008 | must/should | `claude-code/__tests__/touched-files-recorder.test.ts` | ✅ |
| TC-009〜TC-012 | must | `core/step/__tests__/commit-orchestrator-touched-files.test.ts` | ✅ |
| TC-013〜TC-016 | must | `adapter/shared/__tests__/touched-files-bundle.test.ts` | ✅ |
| TC-017〜TC-018 | must | `claude-code/__tests__/touched-files-injection.test.ts` | ✅ |
| TC-019〜TC-021 | must/should | `state/__tests__/touched-files-schema.test.ts` | ✅ |
| TC-022〜TC-023 | must | `store/__tests__/touched-files-resume.test.ts` | ✅ |
| TC-024〜TC-025 | must | `codex/__tests__/touched-files-injection.test.ts` | ✅ |
| TC-026〜TC-027 | gate | verification-result.md（passed） | ✅ |
