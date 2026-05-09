## Design Decisions

### D1: transitionJob の戻り値で state を置き換える

`transitionJob` は純粋関数で `TransitionResult.state` を返す。呼び出し元は戻り値の `state` をそのまま使い、直接代入のスプレッド構文を排除する。

```typescript
// Before:
state = { ...state, status: "awaiting-merge", updatedAt: new Date().toISOString() };

// After:
const result = transitionJob(state, "awaiting-merge", { trigger: "pipeline", reason: "pipeline complete" });
state = result.state;
```

### D2: 永続化は呼び出し元の責務（変更なし）

`transitionJob` は I/O を持たないため、`store.persist()` は従来通り呼び出し元が行う。この設計は Phase 1 から変更しない。

### D3: patch で resumePoint / error を渡す

`running → awaiting-resume` 遷移では `resumePoint` と `error` を同時に設定する必要がある。`transitionJob` の `ctx.patch` を使って一括で渡す。

```typescript
const result = transitionJob(state, "awaiting-resume", {
  trigger: "pipeline",
  reason: "escalation",
  patch: {
    resumePoint: { step, reason, iterationsExhausted },
    error: { code, message, hint },
  },
});
```

### D4: history スプレッド構文を appendHistoryEntry に置換

pipeline.ts L158-170 と L211-223 で `{ ...state, history: [...state.history, entry] }` を使っている。これを `appendHistoryEntry(state, entry)` に置換して `MAX_HISTORY_SIZE` ガードを有効にする。

### D5: handleExhausted のリファクタ

`handleExhausted` は steps の last verdict 更新 + status 遷移 + persist を一括で行っている。steps 更新はそのまま残し、status 遷移部分のみ `transitionJob` に置換する。persist は遷移後に 1 回だけ行う。

### D6: store.fail() は今回触らない

`store.fail()` は `running → failed` の遷移を行うが、Phase 3 の永続化統一まで残す方針（request.md の「スコープ外」）。Pipeline の catch block で `store.fail()` を呼ぶ箇所はそのまま維持する。

### D7: transitionJob が history を自動追記するため二重追記に注意

`transitionJob` は内部で `appendHistoryEntry` を呼び遷移 history を追記する。呼び出し元が遷移前後に別途 history を追記する場合、遷移自体の history とステップの bookkeeping history は別エントリとして共存して問題ない。ただし同一内容の二重追記は避ける。

## Scope

### In

| File | 箇所 | 変更内容 |
|------|------|---------|
| `pipeline.ts` L253-254 | `running → awaiting-merge` | `transitionJob` に置換 |
| `pipeline.ts` L85-101 | catch block `running → awaiting-resume` | `transitionJob` に置換 |
| `pipeline.ts` L260-272 | escalation `running → awaiting-resume` | `transitionJob` に置換 |
| `pipeline.ts` L158-170 | loop entry history スプレッド | `appendHistoryEntry` に置換 |
| `pipeline.ts` L211-223 | loop exit history スプレッド | `appendHistoryEntry` に置換 |
| `pipeline.ts` L393-408 | `handleExhausted` の status 遷移 | `transitionJob` に置換 |
| `executor.ts` L138-142 | timeout `running → awaiting-resume` | `transitionJob` に置換 |

### Out

- `executor.ts` の `store.fail()` 呼び出し（Phase 3）
- `finish/` 層の遷移（Phase 2b）
- `resume` コマンドの遷移（Phase 2c）
