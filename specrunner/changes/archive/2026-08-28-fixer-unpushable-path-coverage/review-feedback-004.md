# Code Review Feedback — iteration 004

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 1. 変更スコープの把握

`git diff main...HEAD --stat` で 28 ファイル変更を確認。ソースコード変更は以下 5 ファイル:
- `src/core/step/fixer-helpers.ts` (+23 lines)
- `src/core/step/code-fixer.ts` (+27 / -0 lines)
- `src/core/step/spec-fixer.ts` (+21 / -0 lines)
- `src/core/step/executor.ts` (+30 / -0 lines)
- `src/core/step/__tests__/fixer-push-capability.test.ts` (+758 新規)
- `tests/unit/step/unpushable-path-escalation.test.ts` (+103 lines)

### 2. 受け入れ基準の確認

| 基準 | 確認方法 | 結果 |
|---|---|---|
| code-fixer / spec-fixer prompt に capability notice | 実装読取 + テスト実行 | ✅ |
| unpushable path 変更時に follow-up（outputContracts 宣言） | 実装読取 + テスト実行 | ✅ |
| follow-up 後も違反残る → UNPUSHABLE_PATH_BLOCKED → awaiting-resume | executor.ts 読取 + テスト | ✅ |
| implementer / request-review 既存挙動に変更なし | `git diff main` = 0 行 | ✅ |
| typecheck / test / architecture tests green | `bun run typecheck` + `bun run test` | ✅ |

### 3. 実装ファイル読取

**`fixer-helpers.ts`**: `buildUnpushablePathContracts` を追加確認。
- `deps.pushCapability` が null / パターン空の場合 `[]` を返す
- patterns がある場合 `{ kind: "unpushable-path", path: "", policy: "follow-up", patterns }` を 1 件返す
- `import type` で `OutputContract` を取り込み（runtime オーバーヘッドなし）
- 循環 import リスク: `output-contract.ts` は純粋な DTO で逆向き依存なし

**`code-fixer.ts`**: buildMessage の 8 つの return path すべてに `+ capabilityNotice` が付加されていることを diff grep で確認:
1. conformance continuation
2. conformance initial
3. coordinator loop continuation
4. coordinator loop aggregated-findings initial
5. coordinator loop fallback (no members)
6. normal continuation
7. normal with-findings initial
8. normal findingsPath fallback

**`spec-fixer.ts`**: buildMessage の 5 return path すべてを確認:
1. conformance continuation
2. conformance initial
3. normal continuation
4. normal with-findings initial
5. fallback (buildSpecFixerInitialMessage + capabilityNotice)

**`executor.ts`** (D6 retrospective): 
- gate が `buildAllOutputContracts(...).filter((c) => c.kind !== "unpushable-path")` でフィルタ
- フィルタ直上にコメントでプリ mixed-reset false-positive リスクを説明
- `UnpushablePathBlockedError` キャッチ → `makeUnpushablePathHalt` → `awaiting-resume` halt の配線を確認

### 4. テスト実行結果

```
src/core/step/__tests__/fixer-push-capability.test.ts: 29 tests passed
tests/unit/step/unpushable-path-escalation.test.ts: 25 tests passed
Full suite: 12599 passed | 1 skipped | 2 todo
bun run typecheck: exit 0
```

### 5. TC カバレッジ確認

test-cases.md の全 23 TC（must: 22, should: 1）を照合:
- TC-001〜TC-014: fixer-push-capability.test.ts で直接カバー
- TC-015: 4 サブアサーションで Layer 1→Layer 2 チェーンを検証
- TC-016: code-fixer conformance branch カバー（今回追加）
- TC-017: coordinator loop branch カバー（前 iteration で missing → 今回追加）
- TC-018〜TC-021: gate TC — typecheck / test suite / diff = 0 の確認で充足
- TC-022〜TC-023: spec-fixer conformance branch カバー

### 6. 前 iteration からの解消確認

- **エスカレーション finding（design.md / tasks.md 文書化）**: operator-apply commit 5332905a で D6 と T-06 を追加確認。bundled artifacts で D6 セクション・T-06 タスクを直接読取。
- **TC-017（coordinator loop）**: テストファイル内に `makeCodeFixerCoordinatorState()` フィクスチャと 2 つのテストが追加されていることを確認。

### 7. スコープ外確認

- `implementer.ts`: `git diff main` = 0 行 ✅
- `request-review.ts`: `git diff main` = 0 行 ✅
- `step-context-builder.ts`: `git diff main` = 0 行 ✅
- `output-verify.ts`: `git diff main` = 0 行 ✅
- `commit-push.ts`: `git diff main` = 0 行 ✅

## 検証できなかった項目

None — すべての受け入れ基準を機械的に確認済み。

## Findings 詳細

指摘なし。すべての受け入れ基準を充足しており、実装は正確かつ完全。
