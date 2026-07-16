# Cross-Boundary Invariants Review — assurance-floor — iter 1

- **verdict**: approved

## 観点別チェック結果

### 1. verify-checkpoint の digest 不変条件

**前提**: `verifyCheckpoint` は stored profile の自己整合（`computePolicyDigest(state.profile) === state.profile.policyDigest`）のみを検証する。`STANDARD_PROFILE` 定数との一致は見ない（`src/core/attach/verify-checkpoint.ts:153-169`）。

**検証**: `STANDARD_PROFILE.assurance` が `{}` → `{ testDerivation:"frozen", biteEvidence:"required", specReview:"required" }` に変わっても、R1 で記録済みの checkpoint（`assurance: {}`）は自身の body から hash を計算し自己整合を保つ。`computePolicyDigest` は受け取った profile object の body を hash するだけで STANDARD 定数を参照しないため、影響なし。新規テスト `tests/attach/verify-checkpoint-r1-assurance.test.ts` がこの経路を固定している。

**判定**: 不変条件保持 ✓

---

### 2. getProfile(absent) → STANDARD 不変条件

**前提**: `getProfile(state)` は `state.profile === undefined` のとき `STANDARD_PROFILE` を返す（`src/state/profile.ts:142-144`）。これは "legacy job は最強 assurance を持つ" という暗黙の安全仮定。

**検証**: STANDARD_PROFILE の assurance が最強値（`testDerivation:"frozen", biteEvidence:"required", specReview:"required"`）になったため、`profile: undefined` の legacy job が archive gate Step 3.6 を通る際は `satisfiesFloor(STANDARD_PROFILE.assurance, floor)` が常に `true` を返す。既存の「profile absent = STANDARD」経路で floor が誤って legacy job を止めることはない。

**判定**: 不変条件保持 ✓

---

### 3. Step 3.5 (archive.protectedPaths) の変更なし

**前提**: Step 3.5 の `evaluateProtectedPaths` 呼び出しは byte 単位で不変であること（既存テストが前提とする経路）。

**検証**: Step 3.6 は Step 3.5 の直後に独立ブロックとして追加されており、Step 3.5 の `filesResult` / `decision` 変数は Step 3.6 と共有されていない。Step 3.6 は自前の `listPullRequestFiles` 呼び出しを持つ。`minimumAssurance` 未設定 → ガード `if (minimumAssurance && minimumAssurance.protectedPaths.length > 0)` で即スキップ。既存の protected-paths テストが踏む経路に Step 3.6 のコードは一切介在しない。

**判定**: 不変条件保持 ✓

---

### 4. satisfiesFloor の fail-closed 不変条件

**前提**: assurance フィールドが欠落 / 未知値のとき、floor が constrain するフィールドは fail-closed（`false`）に倒れること。

**検証**: `satisfiesFloor` は `assurance["testDerivation"]` を rank map でルックアップする。未知の文字列（例: `"frozen-plus"`）は `TEST_DERIVATION_RANK` に存在しないため `undefined` → `assuranceRank === undefined` → `false` を返す。index signature `[key: string]: unknown` が原因で TypeScript 型が `unknown` になっても、`typeof assuranceValue === "string"` チェックで non-string は先に `undefined` に倒れる。R1 形式の `assurance: {}` はすべてのフィールドが欠落 → constrain されるフィールドがある floor に対して `false`（fail-closed）。これは `minimumAssurance` 設定時のみ効果を持つ opt-in であり、未設定では影響ゼロ。

**判定**: 不変条件保持 ✓（R1 in-flight job への影響は design.md Risks で文書化済みの意図的挙動）

---

### 5. STANDARD_PROFILE 自己整合の不変条件

**前提**: `STANDARD_PROFILE.policyDigest === computePolicyDigest(STANDARD_PROFILE)` がモジュールロード時に成立すること（新たにハードコードされた定数が古い assurance に対する古い digest を持たないこと）。

**検証**: 実装は `const _standardBody = { ... assurance: { testDerivation: "frozen", ... } };` を先に定義し、`policyDigest: computePolicyDigest(_standardBody)` を同一式で計算する（`src/state/profile.ts:112-133`）。定数を手書きした digest は存在しない。既存テスト `profile.test.ts:22-23` および新規テスト `satisfies-floor.test.ts:155-156` が動的計算で自己整合を固定。

**判定**: 不変条件保持 ✓

---

### 6. jobAssurance の定値割り当て不変条件

**前提**: Step 3.6 で `jobAssurance` を使う前に必ず割り当て済みであること（undefined アクセスが起きないこと）。

**検証**:

```typescript
let jobAssurance: ProfileAssurance;
try {
  // ...
  jobAssurance = getProfile(state).assurance;
} catch (err) {
  return { exitCode: 2, message };  // ← 必ず return
}
// ここに到達 = try block が完了 = jobAssurance 割り当て済み
// Step 3.6:
if (!satisfiesFloor(jobAssurance, floor)) { ... }
```

TypeScript の definite-assignment 解析: catch が常に `return` するため、try-catch の後で `jobAssurance` が未割り当ての制御フローは存在しない。`typecheck` フェーズ green が確認済み。

**判定**: 不変条件保持 ✓

---

### 7. 新経路の組み合わせ（Step 3.5 + Step 3.6 の連続実行）

**前提**: 両ゲートを有効化した場合、Step 3.5 → Step 3.6 の順で独立して動作すること。

**検証**: Step 3.5 が blocked → その時点で `return` するため Step 3.6 は実行されない。Step 3.5 が passed → Step 3.6 が独立してファイルリストを取得・評価。この組み合わせをテストするケースは `merge-then-archive-floor.test.ts` に含まれる（protectedPaths 未設定 or 別パターンで Step 3.5 をスキップ、Step 3.6 のみ動かすシナリオ）。`listPullRequestFiles` の二重呼び出しは opt-in の floor 設定時のみ発生し、out-of-loop archive でのレート制限影響は許容範囲（design.md D4 Risks 文書化済み）。

**判定**: 不変条件保持 ✓

---

## Observations

### Obs-1: 空 floor（level フィールド全欠落）での assurance チェックは常に通過

`minimumAssurance: { protectedPaths: ["src/**"] }` のように level フィールドを一切設定しない場合、destructuring で `floor = {}` となり `satisfiesFloor(any, {})` は vacuously `true` を返す。この設定では truncated だけが fail-closed になり、assurance 不足は通過する。config の意図としては「assurance 制約なしで path だけ監視」という使い方になるが、期待と齟齬が出やすい。ただし `satisfiesFloor` の docstring で空 floor を vacuously true と明示しているため仕様上は正しい。

**影響なし**（観察のみ、不変条件の破れはない）

---

## 経路の完全列挙

| 経路 | Step 3.5 状態 | Step 3.6 状態 | 結果 |
|------|-------------|-------------|------|
| minimumAssurance 未設定 | (独立動作) | スキップ | 既存挙動保存 ✓ |
| minimumAssurance あり、PR がfloor path を touch せず | (独立動作) | floorDecision.blocked=false → 通過 | accepted ✓ |
| minimumAssurance あり、PR がfloor path を touch、assurance ≥ floor | (独立動作) | floorDecision.blocked=true, satisfiesFloor=true → 通過 | accepted ✓ |
| minimumAssurance あり、PR がfloor path を touch、assurance < floor | (独立動作) | floorDecision.blocked=true, satisfiesFloor=false → fail-closed | blocked ✓ |
| minimumAssurance あり、ファイルリスト truncated | (独立動作) | floorDecision.reason="truncated" → fail-closed | blocked ✓ |
| archive.protectedPaths が blocked → Step 3.5 で return | Step 3.5 return | 実行されない | 既存挙動保存 ✓ |
