# cross-boundary-invariants Review Result

**Change**: touched-files-propagation
**Iteration**: 1
**Reviewer purpose**: diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する

---

## Scope Verified

- `src/adapter/claude-code/touched-files-recorder.ts` — 記録・正規化ロジック
- `src/adapter/shared/touched-files-bundle.ts` — 注入セクション builder
- `src/adapter/claude-code/agent-runner.ts` — 記録配線・prompt 組成
- `src/adapter/codex/agent-runner.ts` — prompt 組成配線
- `src/core/step/commit-orchestrator.ts` — state 書き込み経路
- `src/core/step/executor.ts` — touchedFiles 透過
- `src/core/port/agent-runner.ts` — AgentRunResult.touchedFiles 定義
- `src/state/schema/types.ts` — JobState.touchedFiles 型定義
- `src/state/schema/operations.ts` — validateJobState 検証
- `src/store/job-state-projection.ts` — stateToStateJson / composeSplitLayoutFromContent
- `src/store/job-state-store.ts` — update / persist / appendHistory
- `src/store/job-journal.ts` — persist 実装（write 1 / write 2 タイミング）

---

## Confirmed Invariants (no violation)

| Invariant | 検証結果 |
|-----------|----------|
| `stateToStateJson` は `history` / `steps` 以外を素通しする | `touchedFiles` は slug mode でも stripped されない ✅ |
| `pushStepResult` は `...state` spread → 既存フィールド保持 | touchedFiles は pushStepResult 呼び出しで消えない ✅ |
| `commitRound` は `...state` spread → 既存 top-level フィールド保持 | 並列 round 後も touchedFiles は保持される ✅ |
| `store.update` は `...state` spread + patch | touchedFiles は update で消えない ✅ |
| codex adapter は `touchedFiles` を返さない（undefined） | commitSuccess が state を触らない経路が保たれる ✅ |
| managed adapter は `touchedFiles` を返さない | 同上 ✅ |
| `validateJobState` は `touchedFiles` 不在の legacy state を受理する | 後方互換性が維持される ✅ |
| プロンプト byte 同一性（記録なし時） | touchedFilesSection が "" のとき baseFullPrompt は従来と byte 同一 ✅ |
| 注入セクション順序（claude-code / codex 共通） | `artifactSection` → `touchedFilesSection` → `resumeSection` の順序が両 adapter で統一 ✅ |
| `extractTouchedFilesFromMessages` は `content_block_start` を無視 | `type !== "assistant"` でスキップ ✅ |
| specrunner/changes-archive/ が誤除外されない | trailing slash 必須判定（D4）で回避 ✅ |
| 100 件 cap がプロンプト肥大を防ぐ | cap + 16KB guard の二重防護 ✅ |

---

## Findings

### F-001: `commitSuccess` と `buildTouchedFilesSection` の型キャストが冗長（低リスク）

**Severity**: low
**Resolution**: fixable
**File**: `src/core/step/commit-orchestrator.ts:448-449`, `src/adapter/shared/touched-files-bundle.ts:27`

`JobState.touchedFiles` は `types.ts` に正式型定義済み（`Record<string, string[]> | undefined`）にもかかわらず、両箇所で `as unknown as { touchedFiles?: Record<string, string[]> }` キャストを使用している。

```typescript
// commit-orchestrator.ts:448-449
const existing = (s as unknown as { touchedFiles?: Record<string, string[]> }).touchedFiles ?? {};
s = { ...s, touchedFiles: { ...existing, [step.name]: result.touchedFiles } } as JobState;

// touched-files-bundle.ts:27
const touchedFiles = (state as unknown as { touchedFiles?: Record<string, string[]> }).touchedFiles;
```

キャストによって TypeScript の構造的型チェックが部分的にバイパスされる。将来 `JobState.touchedFiles` の型が変更された場合、キャストが型の不整合をマスクし得る。現在は機能的な問題はないが、型安全性の観点で不要なリスクを持ち込んでいる。

---

### F-002: `validateJobState` の `touchedFiles` 要素型検証が浅い

**Severity**: low
**Resolution**: fixable
**File**: `src/state/schema/operations.ts:324-333`

```typescript
if ("touchedFiles" in obj && obj["touchedFiles"] !== null && obj["touchedFiles"] !== undefined) {
  if (typeof obj["touchedFiles"] !== "object" || Array.isArray(obj["touchedFiles"])) {
    throw new Error("touchedFiles must be a non-array object when present.");
  }
  for (const [, value] of Object.entries(obj["touchedFiles"] as Record<string, unknown>)) {
    if (!Array.isArray(value)) {
      throw new Error("touchedFiles values must be arrays when present.");
    }
    // 配列要素が string であることはチェックしない
  }
}
```

値が配列であることは確認するが、配列要素が `string` であることを確認しない。手動編集や外部ツールで `{"code-fixer": [123, null]}` のような state.json が作られた場合、バリデーションを通過し `buildTouchedFilesSection` が `- 123`, `- null` という非文字列ヒントを生成する。

既存の `synthesizedCommits` も要素検証を行っていない（一貫性はある）。`reviewerStatuses` は各エントリの型を厳密に検査しており、フィールドによって検証深度が異なる。

---

### F-003: 注入層は変更フォルダパスの再除外を行わない（単層防護）

**Severity**: medium
**Resolution**: decision-needed
**File**: `src/adapter/shared/touched-files-bundle.ts:30-34`

記録層（`normalizeTouchedFilePath`）は `specrunner/changes/` 配下のパスを除外するが、注入層（`buildTouchedFilesSection`）は `state.touchedFiles` をそのままプロンプトに展開し、パスのフィルタリングを一切行わない。

TC-022 のテストフィクスチャが `"design": ["specrunner/changes/resume-test/design.md"]` を `touchedFiles` に含めていることからも、この設計判断が意図的であることが確認できる（テストは通過する）。

現在の唯一の書き込み経路（`ClaudeCodeRunner.run()` → `extractTouchedFilesFromMessages()` → `normalizeTouchedFilePath()` → `CommitOrchestrator.commitSuccess()`）では変更フォルダパスが除外されるため現時点でのバグはない。しかし、単一の防護壁であり多層防護になっていない。

将来のコードパスで `state.touchedFiles` に変更フォルダパスが直接書き込まれた場合、注入層でも artifact bundle でも同じパスが injected され二重注入となる（機能的には問題なし、ノイズのみ）。

**検討オプション**:
- A: 現状維持。記録層の単層防護で十分、注入層への再除外は不要な複雑性。
- B: `buildTouchedFilesSection` に変更フォルダパスの除外ロジックを追加し、多層防護とする。注入層が自立して安全性を保証できる形。

---

### F-004: `commitSuccess` 内の write 1 と write 2 の間に `touchedFiles` 不在窓がある

**Severity**: low
**Resolution**: decision-needed
**File**: `src/core/step/commit-orchestrator.ts:396-453`

`commitSuccess` の処理順序:

```
write 1: store.appendHistory(s, verdictHistoryEntry(...))
         → events.jsonl に StepRun + verdict history が書かれる
         → state.json に写された s には現 step の touchedFiles なし
↓
touchedFiles を s に適用: s = { ...s, touchedFiles: { ...existing, [step.name]: files } }
↓
write 2: store.persist(s)
         → state.json に touchedFiles を含む完全な s が書かれる
```

write 1 と write 2 の間でプロセスがクラッシュした場合:

- events.jsonl: StepRun と verdict history は永続化済み（step は完了と判定される）
- state.json: 現 step の `touchedFiles` エントリなし（write 1 の時点では未適用）

resume 時は events.jsonl をアンカーとして state を再構成するため、step は完了済みとして次 step に進む。しかし現 step の `touchedFiles` ヒントが失われる。

仕様要件「resume 経路で記録が保持されること」は CLEAN persist → load を前提にしており、write 途中のクラッシュシナリオをスコープとしていないが、この窓は明示的には文書化されていない。

`touchedFiles` は fail-open なヒント（なければ従来 prompt）であり機能劣化に留まるが、要件 6 の文言と現実のギャップとして記録する。

**検討オプション**:
- A: 現状維持。ヒントの消失は機能劣化に留まり、fail-open 設計で許容範囲。文書化のみ追加。
- B: `appendHistory` の呼び出し前に `touchedFiles` を適用することで write 1 時点で含める（ただし `appendHistory` が一部の副作用を先行させる設計意図に反する可能性がある）。

---

## Observations

- `runMainWorkTurn` の transient retry 時、複数回の `runQuery` が同一 `touchedFileMessages` accumulator に蓄積される。failed attempt 中に touch されたファイルも含まれる可能性があるが、D6 で明示的に許容されており dedup で実害なし。
- `commitRound` 経路（並列 reviewer）は `touchedFiles` を write しないが `...state` spread で先行 sequential step の記録を保持する。round member が claude-code を使う場合でも `AgentRunResult.touchedFiles` は silently drop されるが、D6 で意図的に許容。
- `specrunner/changes/archive/` 配下のパスも除外対象となるが、archive は artifact bundle 対象外。agents が archive を読んだ場合に hint に現れない。機能的な影響は軽微。

---

## Evidence

- checked: 14（主要ファイル全件 + 書き込み/読み込み経路の追跡）
- skipped: 0
- unverified: 0
