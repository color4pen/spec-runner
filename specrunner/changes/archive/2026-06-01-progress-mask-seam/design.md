# Design: progress.ts の出力を mask seam 経由にし B-7 を cli へ拡張する

## Context

B-7（stdout/stderr 出力は `maskSensitive` seam 経由）は `src/core/` に対して full ratchet で enforce 済みだが、`src/cli/` は scan 対象外。

`src/cli/progress.ts` は 16 箇所の `process.stderr.write` で mask seam を bypass している。`p.reason`（error 文字列）等に secret が生で乗る tail risk がある。

現状の B-7 test（`core-invariants.test.ts`）の grep pattern は `process\.(stdout|stderr)\.write\s*\(` で `src/core/` のみを走査する。

`src/cli/` を grep した結果、B-7 違反は `progress.ts` の 16 箇所のみ。他の cli ファイルには `process.(stdout|stderr).write` の直接呼び出しは存在しない。

## Goals / Non-Goals

**Goals**:

- progress.ts の全出力を `maskSensitive` seam 経由にする
- B-7 enforcement scope を `src/cli/` に拡張する
- 実装前の grep で検出された cli/ の B-7 違反を全件解消（or allowlist）する

**Non-Goals**:

- 他 invariant（B-3 / B-8 / single-mutator）の cli 拡張
- `cli/` 以外（adapter 等）への B-7 拡張
- 振る舞い変更（出力内容は同一。mask seam を通すだけ）

## Decisions

### D1: inline `maskSensitive` wrap（新 API 不要）

progress.ts の全 `process.stderr.write(...)` 呼び出しで、引数を `maskSensitive(...)` でラップする。

```
// before
process.stderr.write(`[${p.step}] running...\n`);

// after
process.stderr.write(maskSensitive(`[${p.step}] running...\n`));
```

**Rationale**: progress.ts は heartbeat の `\r` overwrite、`\r\x1b[K` クリア等、newline/carriage-return を自前管理している。logger の既存関数（`stderrWrite` 等）は `\n` を自動付与するため、progress.ts の出力制御と合わない。`maskSensitive` を inline でラップすれば新 API を追加せず、既存の出力制御をそのまま維持できる。

**Alternatives considered**:
- logger/stdout.ts に `\n` を付与しない stderr write 関数を追加する案 → progress.ts 1 ファイルのためだけに API を増やすのは過剰。inline wrap で十分。
- logger の既存関数（`stderrWrite`, `logInfo` 等）に置き換える案 → `\n` 自動付与や log level フィルタの挙動が progress.ts の制御モデルと合わない。

### D2: B-7 seam exemption pattern（B-6 と同構造）

B-7 test を `src/cli/` にも拡張する際、`maskSensitive` を含む行を seam 準拠として除外する。B-6 test が `stripSecrets` を含む行を除外するのと同じパターン。

```typescript
// B-6 の既存パターン
const candidates = allMatches.filter(
  (m) => !m.content.includes("stripSecrets"),
);

// B-7 に同様の seam exemption を追加
const candidates = allMatches.filter(
  (m) => !m.content.includes("maskSensitive"),
);
```

D1 で progress.ts の全 write が `maskSensitive(...)` を含むため、seam exemption により自動的に除外される。

**Rationale**: 既存の B-6 パターンと整合。grep pattern で call-site を検出し、seam keyword で準拠行を除外する二段構成。

### D3: ANSI 制御も maskSensitive を通す（例外分岐不要）

pure ANSI 制御（`"\r\x1b[K"` 等）も `maskSensitive` を通す。`maskSensitive` は token pattern にマッチしない入力をそのまま返すため、制御文字に対しては identity 関数として振る舞う。

**Rationale**: 「制御は例外」ルールに反しない。制御コードを mask しても出力は不変。分岐コードを排除することで、B-7 grep が全 write を一律に検出→ seam exemption で一律除外、という単純な構造を維持できる。

### D4: allowlist 不要（grep 結果に基づく）

`src/cli/` の grep で検出された `process.(stdout|stderr).write` 呼び出しは `progress.ts` の 16 箇所のみ。D1 で全件 `maskSensitive` wrap → D2 の seam exemption で全件解消されるため、新規 allowlist entry は不要。

ただし implementer は実装前に改めて grep を実行し、この設計時点と差分がある場合は request 要件 #3 に従い allowlist に凍結すること。

## Risks / Trade-offs

[Risk] maskSensitive の overhead が heartbeat 描画に影響する → Mitigation: maskSensitive は 3 つの regex replace のみ。heartbeat は 30s 間隔のため、性能影響は無視できる。

[Risk] 既存テストが maskSensitive import の追加で壊れる → Mitigation: テストは `process.stderr.write` を spy しており、maskSensitive は非 secret 文字列に対して identity 関数。出力内容不変のためテスト変更不要。

## Open Questions

なし。
