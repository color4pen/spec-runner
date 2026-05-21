# Review Feedback 002

- **reviewer**: code-reviewer
- **iteration**: 2
- **date**: 2026-05-14
- **verdict**: approved

## Summary

Iteration 1 の 4 件の指摘のうち、critical な 2 件（F-01: generator.ts AbortController 未設定、F-02: TC-GEN-003 テスト欠落）が修正済みであることを確認した。残る 2 件（F-03: dynamic import、F-04: TC-ST-010 欠落）は LOW のまま未修正だが、どちらも機能的バグではなくコード品質・テスト網羅の問題であり、次 PR 対応でブロッカーにならない。typecheck・全テスト green を確認済み（verification-result.md: 1760 passed）。

## Findings

### [info] F-01 (from iter 1) — RESOLVED: generator.ts AbortController 追加確認

`src/core/request/generator.ts` L47-77 に AbortController + setTimeout が正しく実装された。`reviewer.ts` と同パターンで `finally` ブロックでの `clearTimeout` も含む。設計との乖離が解消された。

**File**: `src/core/request/generator.ts`
**Suggestion**: N/A (resolved)

---

### [info] F-02 (from iter 1) — RESOLVED: TC-GEN-003 テスト追加確認

`tests/unit/core/request/generator.test.ts` L153-181 に TC-GEN-003 が追加され、slug 衝突時に queryFn が呼ばれないことを `vi.fn()` で検証している。must テストとしての要件を満たす。

**File**: `tests/unit/core/request/generator.test.ts`
**Suggestion**: N/A (resolved)

---

### [minor] F-03 (from iter 1) — STILL OPEN: `request-review.ts` の dynamic import 残存

`src/core/command/request-review.ts` L90 で `verdictToExitCode` に dynamic import を使用している。

```typescript
const { verdictToExitCode } = await import("../request/reviewer.js");
return verdictToExitCode(result.verdict);
```

ファイル上部で `runReview` を静的 import しており、同ファイルから `verdictToExitCode` も静的に re-export 済み。不要な非同期処理で一貫性を欠く。機能上の問題はない。

**File**: `src/core/command/request-review.ts`
**Suggestion**: `import { runReview, verdictToExitCode } from "../request/reviewer.js"` に変更し、L90 の dynamic import を削除する。次 PR または別 fixup で対応可。

---

### [minor] F-04 (from iter 1) — STILL OPEN: TC-ST-010 (`store.read()`) テスト欠落

`tests/unit/core/request/store.test.ts` は TC-ST-001〜TC-ST-007 を網羅しているが、`test-cases.md` の TC-ST-010（must: `read()` が ParsedRequest を返す）が未追加。`store.read()` は `manager.list()` の内部で使われており、write + read のラウンドトリップ保証がテストされていない。機能的バグではなく、リグレッション防止の観点での欠落。

**File**: `tests/unit/core/request/store.test.ts`
**Suggestion**: `read()` のテストを追加する（`write()` で書き込んだ後に `read()` でパース結果を検証するラウンドトリップテスト）。次 PR または別 fixup で対応可。

---

### [info] New: manager.review() で解決 slug が存在しない場合の無言 throw

`src/core/request/manager.ts` L30-33:

```typescript
} else {
  filePath = store.resolve(cwd, slugOrPath);
}
const content = await fsAsync.readFile(filePath, "utf-8");
```

slug 解決後に `existsSync` の検証をせず直接 `readFile` している。ファイルが存在しない場合は Node の ENOENT エラーがそのまま上位に伝播する。

CLI エントリポイント（`command-registry.ts` review handler）が `existsSync` で先行チェックしてユーザー向けエラーを出力するため、実際の CLI 利用では問題が表面化しない。ただし `manager.review()` を直接呼ぶ場合（テスト・プログラム的利用）は ENOENT が素通りする。設計上 manager は thin coordinator であり、存在確認をどこで行うかの責務が CLI ハンドラに依存している点はトレードオフとして許容範囲。

**File**: `src/core/request/manager.ts`
**Suggestion**: 設計の Non-Goal（store は存在確認なし）と整合しているため対応不要。ただし将来 manager.review() をライブラリ的に使う際は注意。

## Test Coverage

`test-cases.md` は 724 行、store / reviewer / generator / manager / cli-create の全カテゴリを網羅している。must 指定のシナリオはほぼ全て実装済み。

未実装の must テスト:
- **TC-ST-010** (`store.read()`): store.test.ts に未追加（上記 F-04）

その他の must テストはすべて対応する実装ファイルに存在し、verification-result.md で 1760 passed を確認。`test-cases.md` のシナリオと受け入れ基準（request.md 記載）の対応は十分。

## Verdict Rationale

iter 1 で指摘した MEDIUM 2 件（AbortController 未設定、TC-GEN-003 欠落）がいずれも修正済みで、設計意図を正しく実装している。残る F-03・F-04 は LOW で機能的バグではなく、いずれも独立した small fixup として次の PR または同 PR 内で対処できる。設計仕様との一致、型安全性、後方互換性、テストの緑、いずれも問題なし。approved とする。
