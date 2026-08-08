# Scale-Tolerance Review: touched-files-propagation

**Reviewer**: scale-tolerance
**Iteration**: 2

## Purpose

時間とともに件数が単調増加する対象（archive・sidecar・issue/PR・コメント・journal）に対して、走査・ロード・API 呼び出しのコストが比例して成長するコードを、merge 前に検出する。

---

## Checked Structures

### 1. `touchedFileMessages: unknown[]`（agent-runner.ts:630）

`run()` スコープで宣言され、main work turn の `type: "assistant"` SDK メッセージを push する配列。

- **ライフサイクル**: `run()` 呼び出し毎にリセット（`const touchedFileMessages: unknown[] = []`）、`extractTouchedFilesFromMessages` 呼び出し後に GC される。ephemeral。
- **最大サイズ**: `maxTurns × maxRetries`（ともに設定上限あり）。transient retry 時は同一 accumulator に N 回分が蓄積されるが、dedup はその後の extraction 段で行われ、実害なし（D6 の設計判断と一致）。
- **単調増加性**: なし。ステップ間で引き継がれない。state.json に保存されない。

### 2. `seen: Set<string>` および `result: string[]`（touched-files-recorder.ts:87–91）

```typescript
if (seen.has(normalized)) continue;
if (result.length >= MAX_TOUCHED_FILES) continue;  // cap 到達後は continued
seen.add(normalized);
result.push(normalized);
```

- cap（100 件）到達後は `seen.add()` が呼ばれないため、`seen` は最大 100 エントリに収まる。
- cap 到達後も loop は継続するが、各 block で `seen.has()` → false, `result.length >= 100` → true → `continue` という O(1) の枝のみ実行される。loop コストは messages × blocks per message に比例するが、いずれも `maxTurns` で上限がある。
- cap 後に到達した重複パス（seen に入っていない 101 件目以降）は `seen.has()` で true にならず cap チェックで止まる。意味的には正しく、seen/result は bounded。

### 3. `state.touchedFiles: Record<string, string[]>`（types.ts）

- **キー**: step 名。pipeline の sequential steps（固定 ~13）のみが `commitSuccess` 経由で書き込む。並列 reviewer round（`commitRound`）には配線されていないため、custom reviewer の追加でキーが増加しない。
- **バリュー**: 1 step あたり最大 100 件（D4 cap）。同一 step の再実行は置換（append しない）。
- **最大サイズ**: 13 steps × 100 paths × ≒ 100 bytes ≒ 130 KB。state.json 全体サイズの増加分として固定上限内。
- **単調増加性**: なし。step 数は固定、値は最新 run で置換。

### 4. `buildTouchedFilesSection`（touched-files-bundle.ts:38–77）

```typescript
for (const [stepName, files] of Object.entries(touchedFiles)) {
  if (stepName === currentStepName) continue;
  const filtered = files.filter((f) => !isChangeFolderPath(f));
  if (filtered.length > 0) entries.push([stepName, filtered]);
}
```

- `Object.entries` は step 数分（≒ 13）を走査。O(1) 実質。
- `files.filter` はバリュー配列（最大 100 件）を走査。O(100) per step = O(1) 実質。
- `isChangeFolderPath` 内で `changesDirRel() + "/"` を毎回構築する（定数文字列の連結）。最悪ケース 13 × 100 = 1300 回の短い文字列生成。I/O なし、GC 圧軽微。
- セクション文字列の構築後に `Buffer.byteLength(section, "utf-8") > 16 * 1024` をチェック。超過時は `""` を返し full-open（部分注入なし）。
- GitHub API 呼び出しなし。ファイル I/O なし。

### 5. `validateJobState` の `touchedFiles` 検証（operations.ts:322–340）

```typescript
for (const [stepName, value] of Object.entries(obj["touchedFiles"] as Record<string, unknown>)) {
  if (!Array.isArray(value)) throw new Error(...);
  if (value.every((el) => typeof el === "string")) sanitized[stepName] = value;
}
```

- 走査対象: step 数（≒ 13）。O(1)。
- `value.every()` の走査対象: 各 step の配列（最大 100 件）。O(100) per step = O(1)。
- state ロード時（resume 含む）に 1 回のみ実行。

### 6. `commitSuccess` の touchedFiles 更新（commit-orchestrator.ts:452–455）

```typescript
if (result.touchedFiles !== undefined) {
  const existing = s.touchedFiles ?? {};
  s = { ...s, touchedFiles: { ...existing, [step.name]: result.touchedFiles } } as JobState;
}
```

- スプレッド操作のコスト: step 数（≒ 13）に比例。O(1)。
- `undefined`（codex / managed）の場合は state を触らない（D3 の undefined / [] 区別が有効）。

---

## 単調増加対象との接点確認

| 対象 | 接点 |
|------|------|
| archive 走査 | なし |
| sidecar 走査 | なし |
| GitHub issue/PR/comment API | なし |
| events.jsonl / journal fold | なし |
| state.json 肥大 | あり（bounded: ≒ 13 steps × 100 paths × ~100 bytes ≒ 130 KB 固定上限） |

state.json への追加はあるが、pipeline step 数は固定かつ再実行時は置換のため単調増加しない。

---

## Findings

なし。スケール上の問題を検出しなかった。

すべての走査・バッファ・API 呼び出しが以下の有界な上限を持つ:

- `touchedFileMessages`: ephemeral（step 毎に GC、state.json に保存されない）
- `seen`/`result`: 最大 100 件（D4 cap、cap 到達後は `seen.add()` も停止）
- `state.touchedFiles`: sequential step 数（固定）× 100 paths（D4 cap）、再実行は置換
- `buildTouchedFilesSection`: O(steps × 100 files) = O(1)、16 KB で fail-open
- `isChangeFolderPath` 呼び出し: 最大 ~1300 回の純粋な文字列前置チェック（I/O なし）
- `validateJobState`: O(steps × 100) = O(1)
- `commitSuccess` スプレッド: O(steps) = O(1)

```yaml
result: approved
findings: []
checked: 6
skipped: 0
unverified: 0
```
