# Review: cross-boundary-invariants — round-immutable-input

- **reviewer**: cross-boundary-invariants
- **iteration**: 1
- **verdict**: approved

## 観点

diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## 検査した境界

### B1: Pipeline ↔ Executor 境界（executor の in-place クリア除去）

**旧不変条件**: `executor.execute()` が返るとき、渡した `deps.resumePrompt` と `deps.resumeContext` は `undefined` にクリアされている。  
**新挙動**: executor がクリアしなくなった。Pipeline が `effectiveDeps` / `depsWithoutResume` の選択で one-shot を管理する。

検査対象：`executor.execute()` の後に `deps.resumePrompt` が `undefined` であることを前提とする production コードが存在するか。

- `runner.ts`: `deps.resumePrompt` / `deps.resumeContext` をパイプライン起動前に inject するのみ。パイプライン完了後はこれらフィールドを読まない。
- `parallel-review-round.ts`: `roundDeps = { ...deps }` を経由するため、members が受け取るオブジェクトは分離されている。
- `buildStepContext` / `buildResumePrompt`: `executor.execute()` 内部から呼ばれ、受け取った `deps`（= `effectiveDeps`）を読む。後続 unit は `depsWithoutResume` を受け取るため `undefined`。

**判定**: 破れていない。クリアは機構であり、外部契約ではなかった。one-shot の observable behavior（再開 step のみが resume 入力を受ける）は Pipeline レベルで保存されている。

---

### B2: Pipeline ↔ ParallelReviewRound 境界（effectiveDeps の受け渡し）

**旧不変条件**: `round.run()` は orchestration の `deps` をそのまま受け取り、内部 store/runtime 操作にも member 実行にも同一オブジェクトを使っていた。  
**新挙動**: Pipeline が `effectiveDeps`（= `deps` または `depsWithoutResume`）を渡し、round は `roundDeps = { ...effectiveDeps }` を member 実行専用に構築する。round 自身の store/runtime 操作（`captureHeadSha`, `listChangedFiles`, `store.persist`）は受け取った `deps`（= `effectiveDeps`）を使う。

検査対象：round 自身の操作が resume 入力フィールドを参照するか。

- `deps.runtimeStrategy.captureHeadSha(cwd)` — resume フィールドを参照しない。
- `deps.storeFactory(state.jobId).persist(state)` — resume フィールドを参照しない。
- `depsWithoutResume` は `resumePrompt` と `resumeContext` だけを剥がす shallow clone であり、`runtimeStrategy`, `storeFactory` 等は元 `deps` と同一参照。

**判定**: 破れていない。round 自身の操作に必要なフィールドはすべて `depsWithoutResume` にも含まれる。

---

### B3: ResumeCommand ↔ Pipeline 境界（resumeContext gate の変更）

**旧不変条件**: `startStep === resumePoint.step`（strict equality）を満たすときのみ `resumeContext` がセットされる。  
**新挙動**: `mapMemberToCoordinator(resumePoint.step, reviewers)` でマッピング後の値と比較する。

静的 step（reviewer member でない）への影響を検査する。

```
mapMemberToCoordinator("spec-review", [])
→ "spec-review"  // reviewers が空なら写像なし
→ startStep === "spec-review"  // old と完全同値
```

reviewer が存在するジョブで static step を resume する場合も同様：`reviewers.some(r => r.name === "spec-review")` が `false` のため写像されない。

**判定**: 静的 step 経路は old と完全同値。member 経路のみ変化し、その変化は意図した修正（D3）。

---

### B4: `firstUnitExecuted` のループ間持ち越し

Pipeline の `runInternal` は一度のループ進行で `firstUnitExecuted` が `true` になると、以降の全 unit（ループ 2 周目以降も含む）が `depsWithoutResume` を受け取る。

検査対象：resume run 中に 2 周目以降の loop step が resume input を受け取ることを前提とするコードが存在するか。

resume input は「この resume run で再開する最初の実行単位だけに届く」が定義であり、2 周目の loop step（fixer を経由して戻ってきた spec-review iteration 2 など）は resume 対象ではない。

**判定**: 正しい挙動。この持ち越しは仕様通り。

---

### B5: `roundDeps` の shallow clone による保護範囲

`roundDeps = { ...effectiveDeps }` は top-level フィールドの assignment を保護するが、shared nested object への mutation は保護しない。

変更前：members が `deps` を共有しており、この保護はそもそも存在しなかった。  
変更後：top-level assignment（削除された `deps.resumePrompt = undefined`）については保護が追加された。nested object mutation リスクは変更前から存在しており、本 PR で新規に導入されたものではない。

設計書 Risks 節（"round の readonly 保証は executor の非 mutation に依存"）でも認識済み。

**判定**: 既知のリスク、regression なし。新たな不変条件違反ではない。

---

### B6: hard-crash recovery（resumePoint == null）

`resume.ts` の新ロジック:

```typescript
if (!resumePoint) return undefined;
```

旧ロジック:

```typescript
resumeContext: resumePoint && startStep === resumePoint.step ? { resumePoint } : undefined,
```

`resumePoint` が `null` のとき、どちらも `undefined` を返す。

**判定**: 同値。hard-crash fallback（`state.step` からの復元）への影響なし。

---

## ブロッキング所見

なし。

## 情報所見

**[INFO] roundDeps の shallow clone はネスト mutation を保護しない（設計書認識済み）**

上記 B5 の通り。本 PR が対処する top-level クリア mutation については保護が成立しており、pre-existing のリスクは設計書に記録済み。ブロックしない。

---

## 結論

変更していないコードの暗黙の前提（不変条件）を黙って破る箇所は検出されなかった。各境界での相互作用はすべて設計の意図に沿っており、静的 step 経路の挙動は旧実装と完全同値。
