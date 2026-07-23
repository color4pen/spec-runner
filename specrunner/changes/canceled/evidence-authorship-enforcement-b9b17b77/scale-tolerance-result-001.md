# Scale-Tolerance Review: evidence-authorship-enforcement

- **reviewer**: scale-tolerance
- **iteration**: 1
- **verdict**: approved

## 対象スコープ

diff stat: 52 files changed, 6851 insertions(+), 53 deletions(-)

新規主要コンポーネント:
- `src/store/journal-anchor.ts` — `JournalAnchorHolder` (in-process accumulator) + `computeJournalDigest` + `evaluateAnchorPresence`
- `src/git/evidence-anchor-ref.ts` — durable anchor の git plumbing
- `src/store/job-journal.ts` — anchor holder 統合
- `src/core/runtime/local.ts` — `verifyNodeJournalAuthorship` / `restoreJournalToAnchor` / `commitFinalState` anchor push
- `src/core/step/commit-push.ts` — `commitJournalArtifacts` (per-node pipeline journal commit)
- `src/core/resume/verify-journal-authenticity.ts` — resume 経路の authenticity 検査
- `src/core/pipeline/parallel-review-round.ts` — round 後 journal sweep

## スケール対象ディメンション別評価

スケール観点のターゲット: archive 件数・sidecar 件数・issue/PR 件数・コメント件数・journal イベント件数。

### archive 件数

新規コードに archive フォルダのスキャン・ロードは一切ない。`JournalAnchorHolder` は `createRuntime()` (factory.ts:39) で job ごとに新規生成され、実行完了時に破棄される。archive 件数が増えてもコストは変化しない。

**→ 非該当（コスト増加なし）**

### sidecar 件数

新規コードは `.specrunner/local/<slug>/` を参照しない。既存 sidecar 経路に変更なし。

**→ 非該当（コスト増加なし）**

### issue/PR 件数・コメント件数

GitHub API 呼び出しは新規コードに存在しない。

**→ 非該当（コスト増加なし）**

### journal イベント件数（events.jsonl サイズ）

これが唯一の成長ディメンション。以下の3箇所でコストが発生する。

#### (A) `JournalAnchorHolder.eventsAccum` — インメモリ文字列蓄積

```typescript
appendEvents(line: string): void {
  this.eventsAccum = (this.eventsAccum ?? "") + line;
}
```

各 `appendEvents` 呼び出しで文字列連結。N イベントに対して合計 O(N × avg_line_size) のメモリ使用。
V8 の文字列連結最適化により各操作は amortized O(1) だが、最終的に events.jsonl と等サイズの文字列が1つメモリに存在する。

**バウンド**: 単一 job の events.jsonl サイズ（典型: 13 ステップ × 数十イベント ≈ 50–200KB）。archive 件数・歴史的蓄積とは無関係。

#### (B) `verifyNodeJournalAuthorship` — per-node の events.jsonl 全読み

```typescript
const [eventsBytes, stateBytes] = await Promise.all([
  fs.readFile(eventsPath, "utf-8"),
  fs.readFile(statePath, "utf-8"),
]);
onDiskDigest = computeJournalDigest(eventsBytes, stateBytes);
```

sequential ノードごとに events.jsonl の全 bytes を読んで SHA-256 ハッシュを計算する。
ノード k 時点のジャーナルサイズを |J_k| とすると、N ノードでの合計 I/O コストは:
`Σ|J_k| (k=1..N) ≈ O(N² × avg_event_size)`

ただし N ≤ 20（標準 pipeline は 13 ステップ + custom reviewer 数件）かつ |J_max| ≈ 200KB 程度のため、実測コストは 20 × 200KB = 4MB の disk read/run。無視できる範囲。

**バウンド**: O(N²) in per-job step count × per-job journal size。archive 件数に比例しない。

#### (C) `computeJournalDigest` — payload 文字列構築

```typescript
const payload =
  `events:${eventsBytes.length}:${eventsBytes}\n` +
  `state:${stateBytes.length}:${stateBytes}`;
```

events + state の約2倍のサイズの文字列をヒープに一時確保してから SHA-256。
各ノードで O(|events| + |state|) のメモリ一時使用。大きい job でも数百KB。許容範囲。

**バウンド**: 単一 job の journal サイズに比例（archive 件数と無関係）。

### per-node git push 追加

`commitJournalArtifacts` が sequential ノードごとに `git add` + `git commit` + `git push` を1回追加する（round 後も1回）。13 ステップ pipeline では最大 13 回の追加 push。これは job 長さに比例するが、archive 件数・historical accumulation とは無関係。

`pushEvidenceAnchor` は `commitFinalState`（terminal 遷移）でのみ呼ばれ、job 当たり O(1)。
`readEvidenceAnchor`（git fetch）は resume/attach ごとに O(1)。

**→ 全て per-job の O(1) または per-job の O(N) で archive 件数非依存。**

## Findings

なし。

## Observations

### [low] per-node events.jsonl 全読みは O(N²) in job events（許容範囲）

- **file**: `src/core/runtime/local.ts`
- **line**: 907
- **rationale**: `verifyNodeJournalAuthorship` が sequential ノードごとに events.jsonl の全 bytes を disk から読む。N ノードで O(N²) の disk I/O。N ≤ 20 かつ |J| ≤ 数百KB の想定のため実用上は無視できる。ただし、長大な debug log をジャーナルに大量 append するような改修が将来入る場合は in-process anchor の digest（既にメモリ上に保持）との比較専用 path を設けることで disk read を省ける余地がある。現状は問題なし。

### [low] `eventsAccum` の文字列連結はジャーナルサイズ分のメモリを消費する

- **file**: `src/store/journal-anchor.ts`
- **line**: 72
- **rationale**: `appendEvents` が毎回 `str = str + line` で文字列を伸長し、最終的に events.jsonl と等サイズの文字列がヒープに残る。典型的なジョブ（13 ステップ）では 200KB 以下で許容範囲。ジョブが大量の retry を繰り返して events.jsonl が MB 規模に成長するエッジケースでは逐次ハッシュ（streaming SHA-256）に切り替えると改善できるが、現行設計では復元用に full bytes も要るため単純な変更ではない。現状は問題なし。
