# Code Review Feedback — iteration 007

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 前回 iteration からの変更点

iteration 006 の F-4（TC-018 の `ChangedFilesCapability` 記載漏れ）は operator commit により修正済み。
`test-cases.md:212` の TC-018 が `ProviderReadinessCapability & JobBootstrapCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder & ChangedFilesCapability` の intersection を正確に記述するようになった。✅

---

## 検証した項目

### 1. 受け入れ条件の再確認

**production に `RuntimeStrategy & PipelineDepsBuilder` が0件**
- TC-008 ratchet で防衛中。`src/` 配下の production source に 0件。✅

**`CommandRunner` とsubclassがfull `RuntimeStrategy` に依存しない**
- `runner.ts:91`: `ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder` を受け取る。
- `pipeline-run.ts`: `RuntimeFacade` を受け取る。
- `resume.ts`: `RuntimeFacade` を受け取る。
- `RuntimeStrategy` の import が runner.ts / pipeline-run.ts / resume.ts に存在しない。✅

**productionのrequired lifecycle処理にoptional call/存在確認がない**
- `canDeriveChangedFiles?.` が production src に 0件（ratchet 防衛中）。✅
- runner.ts / pipeline-run.ts / scope-check.ts の直接呼び出しを iteration 006 で確認済み。✅

**`RealRuntimeStrategy` が0件**
- TC-009 / TC-031 ratchet で防衛中。✅

**`Pick` ベースの導出shimが0件**
- TC-010 / TC-011 ratchet で防衛中。✅

**`as unknown as RuntimeStrategy` が0件（acceptance criteria）**
- TC-012 は literal `as unknown as RuntimeStrategy` を検索。該当 0件。
- **但し**: `tests/unit/step/unpushable-path-contract.test.ts:403` に修飾 import 形式 `as unknown as import("...").RuntimeStrategy` が残存。詳細は F-1 参照。

**Local/Managed contract test**
- `src/core/runtime/__tests__/command-lifecycle-contract.test.ts` が TC-027〜TC-030 を Local / Managed 双方について実装。✅

**Architecture ratchet**
- `src/core/port/__tests__/runtime-strategy-ratchet.test.ts` が TC-008〜TC-012、TC-031〜TC-032 を定義。✅

**RuntimeFacade の構造的充足**
- `runtime-facade.ts`: 6 capability (`ProviderReadinessCapability & JobBootstrapCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder & ChangedFilesCapability`) の intersection。
- TC-013 / TC-014 がコンパイル時 assertion で Local / Managed 双方を検証。✅

**TC-018 修正確認**
- `test-cases.md:212` が `ChangedFilesCapability` を含む 6 capability intersection を正確に記述。✅

---

### 2. 読んだファイル（iteration 007）

- `specrunner/changes/runtime-strategy-convergence/test-cases.md` — TC-018 修正確認
- `src/core/runtime-facade.ts` — 6 capability intersection 確認
- `src/core/port/__tests__/runtime-strategy-ratchet.test.ts` — TC-012 ratchet パターン（literal only）確認
- `tests/unit/step/unpushable-path-contract.test.ts:395-424` — F-1 qualified import cast 残存確認
- `src/core/runtime/__tests__/managed-runtime-capabilities.test.ts:267-290` — F-3 double optional chaining 残存確認
- `specrunner/changes/runtime-strategy-convergence/review-feedback-006.md` — 前回 findings の引継ぎ

---

## 検証できなかった項目

- **TC-016（ユーザー向け挙動に差分がない）**: manual テストのため検証不可。振る舞い不変条件はコードレビューで iteration 006 に確認済み。

---

## Findings 詳細

### F-1: `as unknown as import("...").RuntimeStrategy` が TC-012 ratchet の検索対象外

**ファイル**: `tests/unit/step/unpushable-path-contract.test.ts:403`

```typescript
const strategy = makePipelineDeps({ pushCapability: declaringCapability }).stepIo!
  as unknown as import("../../../src/core/port/runtime-strategy.js").RuntimeStrategy;
vi.spyOn(strategy, "validateStepOutputs").mockResolvedValue({ violations: [] });

const deps = makePipelineDeps({
  pushCapability: declaringCapability,
  stepIo: strategy as never,    // <-- as never で capability slot へ再キャスト
});
```

TC-012 ratchet は `as unknown as RuntimeStrategy` というリテラル文字列を `findOccurrences()` で検索する。このコードは修飾 import 形式 `as unknown as import("...").RuntimeStrategy` を使っており、ratchet がヒットしない。

さらに `strategy as never` による再キャストも存在し、これは design D6 が除去を求めた回避パターンに相当する。

受け入れ条件「`as unknown as RuntimeStrategy` が0件」の実質的な違反であり、形式が異なるだけで意味的には同等である。ratchet は文字列一致のため現状では CI で検出されない。

ratchet 修正例（TC-012 に追加）:
```typescript
const qualifiedHits = await findOccurrences(testFiles, "as unknown as import(");
// RuntimeStrategy への cast かどうかを content で絞り込む
```

あるいは、このテストで `validateStepOutputs` を spyOn する目的で `RuntimeStrategy` full-port への cast が必要になっているなら、`stepIo` slot の型を `{ validateStepOutputs: ... }` という最小 interface に変更する方が根本解決となる。

**severity**: medium — 受け入れ条件の実質的な違反（形式のみ異なる）かつ ratchet gap。step-layer テストに閉じており production コードへの影響はない。

---

### F-2: `tests/unit/step/` でのモノリシック fake パターン継続と ratchet 空白

**ファイル**:
- `tests/unit/step/unpushable-path-contract.test.ts:203`（`makeRuntimeStrategy()` の型が `RuntimeStrategy & PipelineDepsBuilder`）
- `tests/unit/step/executor-input-validation.test.ts:88`
- `tests/unit/step/executor-lifecycle-ordering.test.ts:340`
- `tests/attach/attach-resume-e2e.test.ts:154`
- `tests/unit/core/step/executor-cli-entry-oid.test.ts:83`
- `tests/unit/core/step/verification-phase-outcome-executor.test.ts:87`

TC-032 ratchet のスコープは `tests/unit/core/command/`・`tests/core/`・`tests/unit/core/runtime/` に限定されており、step-layer テストは対象外。R2c のスコープは Command 層であるため意図的な除外の可能性が高いが、ratchet の空白により将来 step-layer テストがモノリシック fake を再拡大するリスクが残る。

**severity**: low — R2c スコープ外の step-layer テストに限定。production コードの健全性には影響しない。

---

### F-3: `managed-runtime-capabilities.test.ts:290` でのダブル optional chaining

**ファイル**: `src/core/runtime/__tests__/managed-runtime-capabilities.test.ts:290`

```typescript
expect(deps.changedFiles?.canDeriveChangedFiles?.()).toBe(false);
```

`canDeriveChangedFiles` は `ChangedFilesCapability` 上で required（D5 で `?` 除去済）。外側の `deps.changedFiles?.` は `PipelineDeps.changedFiles` が optional なので正当だが、`canDeriveChangedFiles?.()` の `?.` は不要であり、メソッドが再び optional かのような誤解を招く。正しくは `deps.changedFiles?.canDeriveChangedFiles()` であるべき。ratchet のスコープは production source のみのため CI では検出されない。

**severity**: low — コスメティックな問題。テスト動作は正しく、production への影響なし。
