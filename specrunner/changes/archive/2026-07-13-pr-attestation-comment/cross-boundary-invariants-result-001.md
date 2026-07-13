# cross-boundary-invariants Review — pr-attestation-comment — iter 1

## Meta

- **verdict**: approved
- **reviewer**: cross-boundary-invariants
- **iteration**: 1

---

## 新経路の列挙

diff が導入した新しい呼び出し経路は以下の 2 本:

1. **journal 読み込み経路**: `pr-create.run()` 内で `fs.readFile(slugEventsPath(slug))` → `fold()` → `buildAttestation()` を呼ぶ
2. **comment 添付経路**: `pr-create.run()` 内で `readUsageFile(usageJsonPath(slug))` → `createIssueComment(owner, repo, result.number, body)` を呼ぶ

いずれも `pr-create-result.md` 書き込みの後、単一の `try/catch` で囲まれた best-effort ブロック内にある。

---

## 不変条件の検証

### INV-A: executor の persist 順序 — events.jsonl に pr-create 自身の record は含まれない

**既存の不変条件**: `executor.runCliStep()` は `step.run()` が返った後に `finalizeStep()` → `store.persist()` を呼び、そこで初めて当該 step の step-attempt record を events.jsonl に追記する。`step.run()` 実行中は当該 step の record はまだ存在しない。

**新経路の影響**: attestation コードは `step.run()` の内部で events.jsonl を読む。したがって journal には pr-create より前の全 step の record は確定しているが、pr-create 自身の record は含まれない。

**判定**: 不変条件は保たれる。これは設計で明示的に意図された挙動（design.md「タイミング上の事実」節）であり、実装もその通りに動く。

---

### INV-B: `runPrCreate` へ渡す PR body が attestation comment body に上書きされないこと

**既存の不変条件**: `const body = renderPrBody(...)` が PR 本文を生成し、`runPrCreate({ ..., body, ... })` に渡される。

**新経路の影響**: `pr-create.ts:98` の `const body = renderAttestationComment(attestation)` が外側スコープの `body`（PR 本文）を内側スコープで shadow する。

**再現手順の試行**: 内側 `body` は `try { if (journalContent) { const body = ... } }` という多重ネストの内側にあり、外側 `body` が `runPrCreate({ ..., body, ... })` に渡された（line 48–57）後にのみ到達できる。したがって `createPullRequest` の引数は常に `renderPrBody` の結果であり、attestation comment body が PR 本文として渡される経路は存在しない。

**判定**: 不変条件は保たれる。ただし「外側 body = PR 本文」「内側 body = attestation comment」という 2 変数の同名が、将来の開発者に混乱を与えるリスクがある（下記 F-1 参照）。

---

### INV-C: `createIssueComment` の呼び出し前提条件

**既存の不変条件**: `createIssueComment(owner, repo, issueNumber, body)` の呼び出しには `owner`・`repo` が文字列、`issueNumber` が number であることが前提。

**新経路の影響**: 新しい呼び出し箇所では `deps.githubClient!`・`deps.owner!`・`deps.repo!` の non-null assertion と `result.number` を使用する。これらの non-null assertion は、関数冒頭（line 39–47）のガード（`if (!deps.githubClient) throw ...` 等）が通過済みの文脈内にあるため安全。`result.number` は `PrCreateResult` の型定義上、`created`/`existing-open` では常に `number` 型。`typeof result.number === "number"` ガード（line 83）は冗長だが防御的に有効。

**判定**: 不変条件は保たれる。

---

### INV-D: `fold()` を store 層以外から呼ぶこと

**既存の不変条件**: `fold()` はこれまで `job-state-store.ts` 内でのみ使用される純関数だった。

**新経路の影響**: `build-attestation.ts` が `fold()` を新たに呼ぶ。`fold()` は副作用なし純関数（I/O なし、グローバル書き込みなし）であるため、store 層の状態に影響を与えない。呼び出しが増えても journal への書き込みは発生しない（appendEventRecord は参照されていない）。

**判定**: 不変条件は保たれる。

---

### INV-E: `readUsageFile` の ENOENT 以外のエラー伝播

**既存の不変条件**: `readUsageFile` は ENOENT を `{ commandInvocations: [] }` に変換し、他のエラーは throw する。

**新経路の影響**: pr-create.ts での呼び出しは外側 `try/catch`（line 84–103）に包まれているため、ENOENT 以外の I/O エラーも catch され `logWarn` に留まる。`run()` の外へ例外は伝播しない。

**判定**: 不変条件は保たれる。pr-create 自体の成否・result file・pipeline 遷移に影響しない。

---

### INV-F: journal append-only 原則

**既存の不変条件**: events.jsonl はすべての書き込みが `appendEventRecord`（`fs.appendFile`）経由で行われる append-only ファイル。step の `run()` メソッドは journal を書かない。

**新経路の影響**: attestation コードは `fs.readFile` で journal を読むのみで、書き込みはしない。`appendEventRecord` は呼ばれていない。

**判定**: 不変条件は保たれる。

---

## Findings

### F-1: `body` 変数の shadow（severity: low）

**場所**: `src/core/step/pr-create.ts` line 37（外側）と line 98（内側）

**内容**: 外側スコープの `const body = renderPrBody(...)` が、内側の `if (journalContent)` ブロック内の `const body = renderAttestationComment(attestation)` に shadow される。現在の実装では外側 `body` は `runPrCreate({ ..., body, ... })`（line 48–57）に消費済みで、内側宣言には届かないため機能上の問題はない。しかし将来の開発者がこのブロック付近を修正する際に、どちらの `body` を参照しているかを誤解するリスクがある。

**再現シナリオ**: 現在は再現できない（external `body` は既に消費済みで内側 body に取り替わる機会がない）。ただし将来、attestation ブロック内で PR body が必要になったとき（例: attestation に PR body hash を含めるなど）、開発者が誤って内側 `body`（attestation comment）を外側 `body`（PR body）と取り違える可能性がある。

**推奨**: 内側変数を `const attestationBody = renderAttestationComment(attestation)` と改名すると shadow が消え意図が明確になる。ただし現在の動作に影響はないため非ブロッキング。

---

### F-2: `totalCostUsd` と `sum(perStep[].costUsd)` の非一致（severity: low）

**場所**: `src/core/attestation/build-attestation.ts` line 181–188

**内容**: あるステップが「価格既知の model invocation」と「価格未知の model invocation」を両方持つ場合（例: 同一 step が 2 回試行され、attempt 1 は既知 model、attempt 2 は未知 model）:

- `totalCostAccumulator` には attempt 1 の cost が加算される（line 183）
- しかし `stepHasUnpriced = true` により `stepCostUsd = null` にリセットされる（line 188）
- 結果: `cost.totalCostUsd > 0` だが `sum(cost.perStep[].costUsd 非 null 値)` は当該 step を除いた合算になる

**再現手順**:
1. step "implementer" の invocation が 2 件ある usage.json を用意する
2. invocation-1: `modelUsage = { "claude-sonnet-4-6": { inputTokens: 1000, ... } }` → cost = 計算可能
3. invocation-2: `modelUsage = { "unknown-future-model": { ... } }` → cost = null
4. `buildAttestation` 実行 → `perStep["implementer"].costUsd === null` だが `cost.totalCostUsd > 0`

これは design D5（"価格が取れた invocation の合算"）の意図通りではあるが、`totalCostUsd = sum(perStep[].costUsd)` という直感的な不変条件を満たさない。attestation を消費する将来のツール（A-3 verify 等）がこの非一致に遭遇し、データ整合性エラーと誤判断する可能性がある。現時点では attestation を読む既存コードは存在しないため、機能上のバグは発生しない。

**推奨**: 設計コメント（types.ts または build-attestation.ts）に「`totalCostUsd` は price 計算できた invocation の合算であり、`sum(perStep[].costUsd)` とは一致しない場合がある」と明記する。非ブロッキング。

---

### F-3: ゲートソートキーの仕様との差異（severity: info）

**場所**: `src/core/attestation/build-attestation.ts` line 99–103

**内容**: design D4 は「`(startedAt, endedAt, step, attempt)` の辞書順で安定ソート」と定義しているが、実装は `startedAt` のみをキーとし、同値時は挿入順（JavaScript の stable sort）に委ねる。

**実害**: 本 pipeline では step が直列実行されるため `startedAt` の衝突は実質起きない。テストも green。現在の実装で観測可能なバグは生じない。

**推奨**: 記録のため、テストが D4 の tie-break ケースを踏んでいないことを把握する。タイムスタンプ衝突が起きうる将来のシナリオ（test mocking 等）では挙動が spec と異なる可能性がある。非ブロッキング。

---

## まとめ

全ての新経路について、変更されていない隣接機構（executor の persist 順序、journal append-only 原則、PR body の引き渡し、createIssueComment の前提条件）の不変条件が保たれることを確認した。F-1〜F-3 は現在の実行列において不変条件を破る具体的なシナリオを構成できないため、いずれも非ブロッキング。

- **verdict**: approved
