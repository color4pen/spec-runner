# Scale-Tolerance Review: touched-files-propagation

**Reviewer**: scale-tolerance
**Iteration**: 1

## Purpose

時間とともに件数が単調増加する対象（archive・sidecar・issue/PR・コメント・journal）に対して、走査・ロード・API 呼び出しのコストが比例して成長するコードを検出する。

---

## Checked Structures

### 1. `touchedFileMessages: unknown[]`（agent-runner.ts:630）

`run()` スコープで宣言され、main work turn の assistant message を蓄積する配列。

- **ライフサイクル**: `run()` 呼び出し毎に初期化され、`extractTouchedFilesFromMessages` 処理後に GC される（ephemeral）。
- **最大サイズ**: `maxTurns` 上限と同じ — セッション長に比例するが、持続しない。
- **単調増加性**: なし。セッション間で引き継がれない。

### 2. `seen: Set<string>` および `result: string[]`（touched-files-recorder.ts:59–93）

```typescript
if (seen.has(normalized)) continue;
if (result.length >= MAX_TOUCHED_FILES) continue;  // cap 後は seen.add() も呼ばれない
seen.add(normalized);
result.push(normalized);
```

- `result.length >= 100` になると `continue` で抜ける（`seen.add` も実行されない）。
- 結果として `seen` と `result` はどちらも最大 100 件に収まる。
- 単調増加なし。

### 3. `state.touchedFiles: Record<string, string[]>`（types.ts:548）

- **キー**: step 名（pipeline 定義で固定。現在 ~13 ステップ）。
- **バリュー**: 1 step あたり最大 100 件（D4 cap）。
- **最大サイズ**: 13 steps × 100 paths × ≒ 100 bytes = ≒ 130 KB。
- **state.json round-trip**: `stateToStateJson` が素通しするため persist/load のコストは state 全体の I/O と同じ（既存の `biteEvidence`・`synthesizedCommits` と同型）。新規スキャンなし。
- **単調増加性**: step 数は固定。再実行時は置換（append しない、D3）。

### 4. `buildTouchedFilesSection(state, currentStepName)`（touched-files-bundle.ts:23–59）

```typescript
const entries = Object.entries(touchedFiles).filter(
  ([stepName, files]) => stepName !== currentStepName && files.length > 0,
);
```

- `Object.entries` で step 数分（≒ 13）を走査。O(pipeline_size) = O(1) 実質。
- セクション文字列を構築してから 16 KB チェック — 最悪ケースで 13 × 100 paths ≒ 65 KB のバッファを一時的に確保して破棄（超過なら `""`）。一時的なメモリ使用のみ、累積しない。
- GitHub API 呼び出しなし。ファイル I/O なし。

### 5. `validateJobState` の `touchedFiles` 検証（operations.ts:322–333）

```typescript
for (const [, value] of Object.entries(obj["touchedFiles"] as Record<string, unknown>)) {
  if (!Array.isArray(value)) throw ...;
}
```

- state ロード時（resume を含む）に 1 回実行。走査コストは step 数分（≒ 13）。O(1)。

### 6. `commitSuccess` の `touchedFiles` 更新（commit-orchestrator.ts:447–450）

```typescript
const existing = s.touchedFiles ?? {};
s = { ...s, touchedFiles: { ...existing, [step.name]: result.touchedFiles } };
```

- スプレッド操作のコストは step 数（≒ 13）に比例。O(1)。

---

## 単調増加対象との接点確認

| 対象 | 接点 |
|------|------|
| archive 走査 | なし |
| sidecar 走査 | なし |
| GitHub issue/PR/comment API | なし |
| events.jsonl / journal fold | なし |
| state.json 肥大 | あり（bounded: 13 steps × 100 paths × ~100 bytes ≒ 130 KB 上限） |

`state.json` への追加はあるが、pipeline step 数は固定かつ再実行時は置換のため単調増加しない。

---

## Findings

なし。スケール上の問題を検出しなかった。

全ての走査・バッファ・API 呼び出しが以下の有界な上限を持つ:

- `touchedFileMessages`: ephemeral（セッション毎に破棄）
- `seen`/`result`: max 100 件（D4 cap）
- `state.touchedFiles`: max 13 steps × 100 paths（pipeline 固定 × D4 cap）
- `buildTouchedFilesSection`: O(steps × files_per_step) = O(1)、16 KB で fail-open
- `validateJobState`: O(steps) = O(1)

```yaml
result: approved
findings: []
checked: 6
skipped: 0
unverified: 0
```
