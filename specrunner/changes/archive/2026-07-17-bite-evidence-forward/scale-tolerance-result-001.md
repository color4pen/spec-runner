# Scale-Tolerance Review: bite-evidence-forward

- **reviewer**: scale-tolerance
- **iteration**: 1
- **verdict**: approved

## 観点

時間とともに件数が単調増加する対象（archive・sidecar・issue/PR・コメント・journal）に対して、走査・ロード・API 呼び出しのコストが比例して成長するコードを検出する。

---

## 調査対象ファイル

| ファイル | 変更内容 |
|---|---|
| `src/core/step/bite-evidence/step.ts` | gate の entrypoint（events.jsonl 読み取り、gate 呼び出し、result 書き出し） |
| `src/core/step/bite-evidence/gate.ts` | 判定ロジック（ファイル列挙・test 実行委譲） |
| `src/core/step/bite-evidence/tamper.ts` | lineage から frozen hash を検索 |
| `src/core/step/bite-evidence/oids.ts` | state から base/candidate OID を解決 |
| `src/core/runtime/local.ts` | `listCommitChangedFiles` / `runTestsAtCommit` 実装 |
| `src/store/event-journal.ts` | `fold()` / `stepRunToRecord()` / `appendEventRecord()` |
| `src/state/schema/operations.ts` | `validateJobState` — `biteEvidence` 配列バリデーション |
| `src/core/step/commit-orchestrator.ts` | `biteEvidence` を state へ反映 |

---

## 単調増加対象ごとの検査

### archive（`specrunner/changes/archive/`）

gate・step・runtime の実装はアーカイブディレクトリを一切走査しない。`step.ts` が読むのは `slugEventsPath(slug)` と `changeFolderPath(slug)/test-cases.md` の 2 ファイルのみ（slug 固定、ジョブ固有パス）。

**問題なし。**

### sidecar（`.specrunner/local/<slug>/`）

sidecar ディレクトリへの読み書きはなし。gate が参照するのはジョブの branch-borne state（`state.steps`）と `events.jsonl` のみ。

**問題なし。**

### issue / PR / コメント（GitHub API）

gate 系コード（`gate.ts`, `step.ts`, `tamper.ts`, `oids.ts`）は GitHub API を一切呼ばない。`biteEvidence` は branch-borne（`state.json`）に保存される。

**問題なし。**

### journal（`events.jsonl`）

`step.ts` は gate 実行のたびに `fold(eventsContent)` を呼ぶ:

```typescript
eventsContent = await fs.readFile(eventsPath, "utf-8");
const foldResult = fold(eventsContent);
```

`fold()` は O(N)（N = 行数）。`events.jsonl` のサイズは 1 ジョブ固有であり、パイプラインのステップ数（通常 ~13 ステップ × 数回ループ）に比例する。数百行が上限であり、ジョブ間でファイルは共有されない。gate 実行は 1 ジョブ 1 回（実装 re-loop のたびに再実行されるが、そのたび journal は +1〜2 行増える程度）。

**問題なし。**

### lineage 配列の逆順走査（`tamper.ts`）

```typescript
const testCaseGenRecord = [...lineage].reverse().find((r) => r.step === "test-case-gen");
```

spread + reverse でコピーを生成して線形探索。lineage はジョブの全ステップ数（~13 ＋ re-loop 数）に比例するが、通常 10〜40 要素程度。bounded。

**問題なし。**

---

## 近接観察（non-blocking）

### 連続ファイル単位 subprocess 実行（`runTestsAtCommit`）

```typescript
for (const testFile of testFiles) {
  const testResult = await this.spawnFn("bun", ["test", testFile], { cwd: tmpBase });
  results.push({ file: testFile, passed: testResult.exitCode === 0 });
}
```

materialized test file ごとに `bun test <file>` を逐次 spawn し、base + candidate の 2 OID ぶん実行する（合計 2N spawn）。N は test-materialize コミットが追加したファイル数であり、ジョブ間で単調増加する値ではない（1 コミットの差分は bounded）。ただし N が大きい場合は bun 起動オーバーヘッドが N 倍になる。

設計上「materialized test のみに限定」（要件 5・設計 D8）が守られており、full-suite 二重実行は回避されている。将来的に `bun test <file1> <file2> ...` へのバッチ化で起動コストを削減できるが、現状は per-file 結果を得るための合理的な実装であり、スケール問題ではない。

### `validateJobState` での `biteEvidence` 配列反復

```typescript
for (const be of obj["biteEvidence"] as unknown[]) { ... }
```

O(N)（N = materialized test ファイル数）。gate 実行ごとに配列を置換（蓄積しない）するため、時間経過で無限に増えない。state ロードのたびに呼ばれるが N が bounded なので問題なし。

---

## まとめ

| 対象 | コスト成長 | 判定 |
|---|---|---|
| archive ディレクトリ走査 | なし | ✅ |
| sidecar ディレクトリ走査 | なし | ✅ |
| GitHub API 呼び出し | なし | ✅ |
| events.jsonl ロード（fold） | per-job・bounded | ✅ |
| lineage 配列走査（tamper） | per-job・bounded | ✅ |
| biteEvidence バリデーション | per-gate-run・bounded | ✅ |
| subprocess 連続実行 | per-commit-diff・bounded、非蓄積 | ✅（観察のみ） |

単調増加するコレクション（archive・sidecar・journal 全ジョブ横断・issue/PR/コメント）に対してコストが比例成長するコードは存在しない。merge ブロッカーとなるスケール問題は検出されなかった。
