# Scale-Tolerance Review — dedup-verified-safe — iter 001

**Reviewer**: scale-tolerance  
**Purpose**: 時間とともに件数が単調増加する対象（archive・sidecar・issue/PR・コメント・journal）に対して、走査・ロード・API 呼び出しのコストが比例して成長するコードを merge 前に検出する。

---

## Summary

本 change は全 8 カテゴリの重複コード統合（C1–C8）であり、行動変更を意図しない純粋なリファクタリング。  
スケール観点で注目すべき変更ポイントを全件精査した。新たな単調増加 O(N) パスは導入されていない。

---

## Checked Items

| # | 対象 | 確認内容 | 結果 |
|---|------|---------|------|
| 1 | `job-journal.ts` `_writeAllToJournal` | fresh write 時にのみ呼ばれ、全 history + step runs を 1 件ずつ append（O(job events)）。delta 経路とは別パス。変更前後で計算量同一。 | 問題なし |
| 2 | `job-journal.ts` `persist()` delta ループ | 新規イベント分のみ append（O(Δevents)）。増分書き込みで全件走査なし。 | 問題なし |
| 3 | `job-journal.ts` `fold()` 呼び出し | events.jsonl 全体を読む。fast path（stored counters が in-memory を cover）のときは完全スキップ。fast path miss 時のみ発動。この挙動はリファクタ前から不変。 | 既存挙動／変更なし |
| 4 | `job-journal.ts` `_appendRecord` | `this.resolver.getEventsPath()` を record ごとに呼ぶ（変更前は `eventsPath` を 1 回キャプチャして再利用）。`getEventsPath()` は `path.join` の O(1) 文字列演算なので定数コスト。negligible。 | 問題なし（後述 Obs-1） |
| 5 | `resolve-worktree-path.ts` | sidecar 1 ファイルを 1 回読むだけ。O(1)。sidecar 全件スキャンなし。 | 問題なし |
| 6 | `config/store.ts` loadConfig 委譲 | `loadConfigWithSourceMetadata` に委譲（config ファイル 0〜2 件読み取り）。O(1)。 | 問題なし |
| 7 | `runner.ts` `finalizeVerificationRun` | phase 数（〜7 件）に対してのみループ。phases は runtime bounded。issue/PR・archive 件数に依存しない。 | 問題なし |
| 8 | `glob-match.ts` `globMatch` / `matchesGlob` | 呼び出しごとに RegExp をコンパイル（変更前から同一）。`protected-paths.ts`（changedFiles × patterns）・`changed-line-coverage.ts` で使用されるが、changedFiles は 1 PR あたりの変更ファイル数に bounded（GitHub API cap 3000 件）。本 change で新規導入なし。 | 既存挙動／変更なし（後述 Obs-2） |

---

## Observations（非ブロッキング）

### Obs-1: `_appendRecord` が record ごとに `getEventsPath()` を再評価

**対象**: `src/store/job-journal.ts`  
**内容**: リファクタ前の `writeAllToJournal` は `eventsPath` を引数で 1 回受け取り、ループ内で再評価なし。リファクタ後は `_appendRecord` 内で `this.resolver.getEventsPath()` を毎回呼ぶ。  
**実影響**: `getEventsPath()` は `path.join(...)` の O(1) 文字列演算のみ。定数コスト増。  
**評価**: negligible。パフォーマンスに実測影響なし。

### Obs-2: `globMatch` / `matchesGlob` が呼び出しごとに RegExp を再コンパイル

**対象**: `src/util/glob-match.ts`、`src/core/archive/protected-paths.ts`、`src/core/verification/changed-line-coverage.ts`  
**内容**: 両関数は per-call で `new RegExp(...)` を生成する。`globMatch` のコメントにも「Compiled once per call; callers that need high-volume matching should cache」と明記されている。  
**実影響**: `changedFiles`（最大 3000 件）×`patterns`（設定依存、通常数件）の積で RegExp compile が走る。  
**評価**: 本 change で導入・悪化したものではなく、main から継続する既存挙動。キャッシュ化は将来課題として設計者が認識済み（コメントに明示）。今回の merge を妨げない。

---

## 結論

本 change はスケール観点の新規リスクを導入していない。  
単調増加対象（archive・sidecar・issue/PR・コメント・journal）に対してコスト比例成長するコードパスは確認されなかった。  
既存の `fold()` / `globMatch` RegExp 再コンパイルはリファクタ前から存在し、本 change での変化なし。

**ブロッキング所見: 0 件**
