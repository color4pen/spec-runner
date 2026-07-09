# Regression Gate Result — Iteration 002

- **change**: design-topic-emission
- **iteration**: 2
- **verdict**: approved

## Findings Verification

### TC-016: resolver の topicEmission:false → false が単体テストで未確認

- **File**: tests/unit/config/design-layer-config.test.ts
- **Status**: fixed
- **Evidence**: `TC-DL-CONFIG-006 (TC-016)` (lines 119–129) が追加されており、`designLayer: { topicEmission: false }` を渡した場合に `resolveDesignLayerConfig` が `topicEmission: false` を返すことをアサートしている。regression なし。

### TC-017: --with-merge 経路でのトピック排出が明示的にテストされていない

- **File**: src/core/archive/__tests__/merge-then-archive.test.ts
- **Status**: fixed
- **Evidence**: `TC-017` (lines 404–435) が追加されており、`designLayer: { enabled: true, topicEmission: true, ... }` を `runMergeThenArchive` に渡したとき、`runArchiveOrchestrator` が `expect.objectContaining({ designLayer: resolvedDesignLayer })` で呼び出されることをアサートしている。--with-merge 経路での designLayer 伝播が明示的に確認されている。regression なし。

### TC-019: topicEmission に非 boolean を渡したときのバリデーションエラーが未テスト

- **File**: tests/unit/config/design-layer-config.test.ts
- **Status**: fixed
- **Evidence**: `TC-DL-CONFIG-007 (TC-019)` (lines 131–138) が追加されており、`designLayer: { topicEmission: "yes" }` を `validateConfig` に渡すと `"designLayer"` を含むエラーがスローされることをアサートしている。regression なし。

## Summary

全 3 件の修正を確認した。regression・contradiction ともになし。
