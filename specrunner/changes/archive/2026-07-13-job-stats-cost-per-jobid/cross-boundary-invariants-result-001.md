# Cross-Boundary Invariants Review — job-stats-cost-per-jobid — iter 1

- **verdict**: approved

## 観点

変更が**変更していない**コードの暗黙の前提（不変条件）を黙って破っていないか。テストが green のまま既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## Findings

### CBI-001 [Medium] `view-commands-worktree-guard.test.ts` モックが `listWithSourceDirs` を露出していない

**所在**: `src/cli/__tests__/view-commands-worktree-guard.test.ts` L22–27

```js
vi.mock("../../store/job-state-store.js", () => ({
  JobStateStore: {
    list: vi.fn().mockResolvedValue([]),
    resolveId: vi.fn(),
  },
}));
```

`runJobStats` は変更後に `JobStateStore.listWithSourceDirs()` を呼ぶが、このモックには `listWithSourceDirs` が含まれない。

**現在テストが green な理由**: worktree-guard テスト群はすべて `detectSpecrunnerWorktree` が `{ isSpecrunnerWorktree: true }` を返す設定で動いており、`runJobStats` が `listWithSourceDirs` に到達する前に exit code 2 で早期リターンする。したがって `listWithSourceDirs is not a function` エラーは発生しない。

**副作用として生じた空振り assertion**: L100–103 の `"runJobStats does not call JobStateStore.list"` は今後も常に pass するが、それは worktree guard が機能しているからではなく「`runJobStats` が `list` をそもそも呼ばなくなったから」という別理由による。ガードが壊れても同じ assertion が pass するため、guard の健全性を asserting していない。実際のガード動作（exit code 2）は L95–98 の別 assertion で引き続き担保されているため、機能的なリグレッションはない。

**潜在リスク**: このファイルに `isSpecrunnerWorktree: false` での `runJobStats` 正常系テストを追加した場合、mock に `listWithSourceDirs` が存在せず `TypeError` で失敗する。現時点では該当テストケースは存在しないためブロッキングではない。

**推奨対応**: モックに `listWithSourceDirs: vi.fn().mockResolvedValue([])` を追加し、assertion を `"does not call listWithSourceDirs"` に更新する。ただし本変更のスコープ外でよい（後続 fix-up または別 issue）。

---

### CBI-002 [Info] `list()` → `listWithSourceDirs()` 委譲後の既存 caller への波及

`list()` が `listWithSourceDirs(opts).then(entries => entries.map(e => e.state))` に書き換わった。全既存 caller（ps, archive, cancel, resume, finish, exit-guard, inbox, job-show 等）への影響を確認した。

- 返り値の型 `JobState[]` は変わらない
- dedup ロジック（`tryMerge` の `updatedAt` 比較）は等価：旧 `new Date(state.updatedAt) > new Date(existing.updatedAt)` → 新 `new Date(state.updatedAt) > new Date(existing.state.updatedAt)`（同一）
- スキャンセクション順序（1 → 1b → 2 → 3 → 4）は保持されている
- `resolveId()` が内部で `list()` を呼ぶ箇所も正しく動作する

**不変条件維持**。既存 caller への波及なし。

---

### CBI-003 [Info] `resolveChangeDir` 返値 null ガード削除の安全性

旧コード:
```ts
const changeDir = await resolveChangeDir(slug, cwd);
if (changeDir) {
  const usagePath = path.join(changeDir, "usage.json");
  const read = await readUsageFile(usagePath);
  ...
}
```

新コード（`if (changeDir)` ガードなし）:
```ts
const usagePath = path.join(sourceChangeDir, "usage.json");
const read = await readUsageFile(usagePath);
...
```

`sourceChangeDir` は `listWithSourceDirs()` の各スキャンセクションで `path.join(...)` で構成されるため null にはならない。`readUsageFile` は ENOENT を `{ commandInvocations: [] }` として返すことが確認されており（`src/core/usage/store.ts` L31–33）、usage.json が存在しない行の `costUsd` が null になる従来動作は保持される。

非 ENOENT エラーは `readUsageFile` が throw し、外側の `try/catch` が捕捉して `usageFile = null` のまま行を継続する動作も変わらない。

**不変条件維持**。

---

## 総評

production コードの動作に関わる cross-boundary 不変条件の破損は検出されなかった。CBI-001 はテストインフラの gap（assertion が空振りになる）であり、現在の全テストは green。worktree guard の実際の挙動（exit code 2）は別の assertion で引き続き担保されている。

CBI-001 は追跡課題として記録し、次回テスト追加時に併せて修正することを推奨する。
