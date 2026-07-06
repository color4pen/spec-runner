# Cross-Boundary Invariants Review Result

<!-- Reviewer: cross-boundary-invariants — Iteration 1 -->

- **verdict**: approved

## Summary

変更後も既存機構の不変条件は維持されている。全テスト green・静的解析 clean を確認したうえで、境界横断の暗黙結合を 1 件（low）と設計上の既知非対称を 1 件（info）記録する。いずれも現在の挙動を壊していない。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | implicit-coupling | `src/config/schema.ts:1196` | `resolvePipelineForbiddenSurfaces` が `pipelineId === "fast"` のマジックストリングを使い、`PIPELINE_IDS.FAST` 定数（`src/kernel/pipeline-ids.ts`）を参照していない。`config/migrate.ts` が既に `kernel/step-names.js` を import しているため `config → kernel` の import edge は許容済みだが、`schema.ts` は定数を使わなかった。`PIPELINE_IDS.FAST` がリネームされた場合、resolver が黙って `[]` を返し breach 検出がサイレントに消える。現状は `"fast" === PIPELINE_IDS.FAST` のため動作は正しく、かつ `applyScopeConfig(FAST_DESCRIPTOR, config)` の統合テストがドリフトを補足するため現時点でのバグではない。 | `schema.ts` に `import { PIPELINE_IDS } from "../kernel/pipeline-ids.js"` を追加し、`pipelineId === "fast"` を `pipelineId === PIPELINE_IDS.FAST` に置き換える。同時に `resolve-scope.test.ts` の `resolvePipelineForbiddenSurfaces(config, "fast")` 呼び出しも `PIPELINE_IDS.FAST` に統一すると定数レベルでも drift を防げる。 |
| 2 | INFO | by-design asymmetry | `src/core/command/pipeline-run.ts:98-111` | preflight は `getPipelineDescriptor(pipelineId)` を取得した後 `applyScopeConfig` を呼ばずに `composeReviewerDescriptor` → `validateDescriptorInputCompleteness` へ渡す（static descriptor / `forbidden: []` のまま）。これは設計 D5 の意図であり、`assertRuntimeSupportsScope` は presence のみ参照、`validateDescriptorInputCompleteness` は `permissionScope.forbidden` を読まないため現状は無害。ただし将来 preflight で `forbidden` を参照する検査を追加した場合、`[]` ベースで評価されるという潜在的落とし穴がある。 | 現状は対応不要（D5 の根拠が成立している間は）。将来 preflight が `forbidden` を参照する要件が生じた場合、`assertRuntimeSupportsScope` 呼び出しの前後に `applyScopeConfig` を挿入するかを design で明示的に判断すること。`design.md` Open Questions に既に記録済み。 |

## Invariant Walkthrough

### 1. 静的 registry の純粋性（D4 不変条件）

`FAST_DESCRIPTOR` は `forbidden: []` の静的定数として維持されている（`registry.ts:160`）。`getPipelineDescriptor` は config を受け取らない純関数のまま。 **✓ 維持**

### 2. permissionScope の presence 不変条件（要件 3 / 設計判断 "scope presence 維持"）

`FAST_DESCRIPTOR.permissionScope` は `{ checkpoint: "conformance", forbidden: [] }` として定義されており、`applyScopeConfig` が config 有無にかかわらず spread で `permissionScope: { checkpoint, forbidden }` を返す。`assertRuntimeSupportsScope` の presence チェックは config の有無に関係なく常に発火する。 **✓ 維持**

### 3. composeReviewerDescriptor による permissionScope 保持（既存不変条件）

`composeReviewerDescriptor` は `{ ...base, steps, transitions, loopNames, loopFixerPairs, roles, maxIterationsByStep, parallelReview }` をスプレッドで返し、`permissionScope` を明示上書きしない。`applyScopeConfig` を先に適用し、スコープ解決済みの descriptor を渡す順序（`run.ts:94-95`, `run.ts:134-135`）が両実行経路で維持されている。 **✓ 維持**

### 4. runtime 実行経路の完全性（T-06 対象）

`buildPipelineForJob`（`run.ts:88-97`）と `runPipeline`（`run.ts:127-138`）の両経路で `applyScopeConfig(base, deps.config)` が `getPipelineDescriptor` の直後に挿入されている。`createStandardPipeline` / `runDesignPipeline` は `STANDARD_DESCRIPTOR` / `DESIGN_ONLY_DESCRIPTOR`（`permissionScope` 不在）を直接渡しており、`applyScopeConfig` の no-op 契約（presence 不在 → 参照同一返却）と整合する。 **✓ 維持**

### 5. config deep-merge × forbiddenSurfaces array 置換

`deepMergeConfig` は array を overlay で丸ごと置換する（`merge.ts:68`）。user global に `forbiddenSurfaces` があり project local にも宣言があれば、project local が user global を置換する。この仕様は `docs/configuration.md` に明記されており、挙動と文書が整合している。`archive.protectedPaths` が同じ規則を先例として確立している。 **✓ 維持**

### 6. config validation の厳格性

zod schema が `id: minLength(1)` / `paths: array(string, "must be an array.")` を強制しており、不正 config は `CONFIG_INVALID` として早期拒否される。`id` 欠落・`paths` 非配列・`forbiddenSurfaces` 非配列の全パターンがテストで固定されている（`resolve-scope.test.ts`）。 **✓ 維持**

### 7. dogfooding の連続性（D6 不変条件）

`FAST_DESCRIPTOR.permissionScope.forbidden` のリテラル撤去（T-04）と `.specrunner/config.json` への 3 面追加（T-07）が同一 PR に含まれており、中間状態で spec-runner 自身の breach 検出が無防備になるウィンドウが存在しない。 **✓ 維持**

## Conclusion

実装は全境界で設計意図と整合しており、変更していないコードの暗黙前提を破るパスは確認できなかった。F-01（低）はリファクタリング推奨だが現在の動作を壊しておらず、ブロッキング指摘ではない。
