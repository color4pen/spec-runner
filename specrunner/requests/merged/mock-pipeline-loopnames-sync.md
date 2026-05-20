# buildMockPipeline の loopNames を実装 (run.ts) と同期させ test と実装の挙動乖離を解消する

## Meta

- **type**: bug-fix
- **slug**: mock-pipeline-loopnames-sync
- **base-branch**: main
- **date**: 2026-05-17
- **author**: color4pen
- **issue**: #278

## 背景

`tests/core/pipeline/pipeline.test.ts:265-266` の `buildMockPipeline` テストヘルパが `loopNames` に `delta-spec-validation` を含めたまま:

```typescript
loopNames: ["spec-review", "verification", "code-review", "delta-spec-validation"],
loopFixerPairs: { "delta-spec-validation": "delta-spec-fixer" },
```

一方、本番設定 `src/core/pipeline/run.ts:65` (PR #274 マージ後) では:

```typescript
loopNames: [STEP_NAMES.SPEC_REVIEW, STEP_NAMES.VERIFICATION, STEP_NAMES.CODE_REVIEW],  // dsv 含まない
loopFixerPairs: {
  [STEP_NAMES.CODE_REVIEW]: STEP_NAMES.CODE_FIXER,
  [STEP_NAMES.SPEC_REVIEW]: STEP_NAMES.SPEC_FIXER,
  [STEP_NAMES.VERIFICATION]: STEP_NAMES.BUILD_FIXER,
  [STEP_NAMES.DELTA_SPEC_VALIDATION]: STEP_NAMES.DELTA_SPEC_FIXER,
},
```

### 経緯

PR #274 (`delta-spec-path-validation-hook`) の rebase 競合解消時に:

- 実装側 (`run.ts`): dsv を loopNames から削除 (= dsv が approved 素通り時に loopIters カウントされない構造)
- テスト helper (`buildMockPipeline`): 修正漏れで dsv を loopNames に含めたまま
- TC-063 等の個別テストは `loopNames` 引数を override して dsv 除外で構成し直したため pass しているが、helper の既定値は乖離したまま

### 影響

1. **実装挙動の網羅性低下**: `buildMockPipeline` を default で使うテスト (TC-060〜TC-066 等) は「dsv が loop step として扱われる挙動」を検証しており、本番経路 (= dsv が non-loop deterministic step) を網羅していない
2. **将来の test 失敗 / 誤検知リスク**: 実装側で loop 関連の挙動を変更したとき、test helper のミスマッチで実装と乖離した結果になる
3. **既存テストの意義減退**: dsv exhaust path / approved path / loop path を本番経路と同じ前提でテストできていない可能性

関連 issue: #278

## 目的

`buildMockPipeline` の `loopNames` / `loopFixerPairs` 既定値を `run.ts` (本番設定) と一致させ、全テストを本番経路と同じ前提で実行する。test helper と実装の乖離を解消し、将来の挙動変更時のミスマッチリスクを除く。

## 設計判断

1. **helper 既定値を本番 (run.ts) ミラーする**:
   - `loopNames`: `["spec-review", "verification", "code-review"]` (dsv 除外)
   - `loopFixerPairs`: 4 entries (code-review/spec-review/verification + delta-spec-validation の fixer ペア全部)
2. **個別 test の override は維持**: 特定シナリオで loopNames を意図的に変える test (例: TC-069 = pair 不在の exhaustion 検証) は override 引数で対応 (= 既に override してれば残す)
3. **TC-063 等の余分な override 削除**: 元々 #274 rebase の応急処置として個別 override で本番経路に揃えたテストがあれば、helper 既定値が一致した後は override 削除
4. **test 期待値の見直し**: helper を本番に揃えることで、既存 test の期待値が実態と乖離する可能性あり (= dsv が loopNames に含まれる前提だった TC は期待値変更必要)。個別 TC で再検証
5. **`loopName` (= primary loop) の挙動も維持**: `loopName: STEP_NAMES.SPEC_REVIEW` は変更しない

## 要件

### 1. `buildMockPipeline` の既定値修正 (= run.ts 定数を直接 import)

`tests/core/pipeline/pipeline.test.ts:265-266` 周辺の `buildMockPipeline` ヘルパ実装を、`run.ts` で export された `STANDARD_LOOP_NAMES` / `STANDARD_LOOP_FIXER_PAIRS` (要件 5 で export 追加) を**直接 import して既定値に使う**形に変更する (= approach ②、Review #1 指摘で採用):

```typescript
import { STANDARD_LOOP_NAMES, STANDARD_LOOP_FIXER_PAIRS } from "../../../src/core/pipeline/run.js";

// buildMockPipeline 内部
const pipeline = new Pipeline({
  steps,
  transitions: STANDARD_TRANSITIONS,
  maxIterations: opts.maxIterations ?? 2,
  executor: mockExecutor,
  events,
  loopName: "spec-review",
  loopNames: STANDARD_LOOP_NAMES,
  loopFixerPairs: STANDARD_LOOP_FIXER_PAIRS,
});
```

これにより:
- helper 既定値が **structural に** 本番 (`run.ts`) と sync (= 片方変更時の drift が型/import レベルで catch される)
- 要件 4 の sanity check も「同一定数の identity 比較」で十分検証できる

`buildMockPipeline` の `opts` 型に `loopNames` / `loopFixerPairs` パラメータは現状存在しない。本 request では新規追加しない (= 個別 TC は引き続き `buildMockPipeline` を経由せず `new Pipeline({ ... })` を直接構築する経路 (= TC-063 等) を使う)。

### 2. `buildMockPipeline` を使う既存テストの検証

`grep -rn "buildMockPipeline" tests/` で全使用箇所を列挙し、新既定値で test 期待値が崩れないか確認:

- TC-060 (code-review needs-fix → code-fixer → approved): 影響なし想定
- TC-061 (code-review exhausted): 影響なし想定 (元 spec-review/code-review 経路)
- TC-062〜TC-066 (#269 bypass テスト群): 影響なし想定
- TC-068 (stdout iter format): 影響なし想定 (= loopName = spec-review は維持)
- TC-069 (no paired fixer): 既に独立構築 (= `new Pipeline({ ... })` 直接) なので影響なし
- TC-063 (`pipeline.test.ts:410-422`): `buildMockPipeline` を経由せず `new Pipeline({ ... })` で構築している (= helper 既定値変更の影響なし)。ただし L418-421 のコメント「The standard pipeline (createStandardPipeline) includes dsv in loopNames which causes dsv to exhaust first when spec-review keeps failing」は PR #274 以降 stale なため、本 request で同時に書き換える

崩れる TC があれば期待値修正 (= 本番経路に合わせる)。

### 3. 個別構築テストの stale コメント整理

`buildMockPipeline` を経由せず直接 `new Pipeline({ ... })` を構築している TC (= 現状 TC-063 等) のコメントが PR #274 以降の本番設定 (= dsv 除外) と齟齬がないか確認:

- TC-063 (`pipeline.test.ts:410-422`): L418-421 のコメント「The standard pipeline (createStandardPipeline) includes dsv in loopNames」は stale → 本 request で「standard pipeline は dsv を loopNames に含まない (PR #274 以降)」等に書き換え
- 他 TC で同様の stale コメントがあれば併せて修正

(従来要件にあった「TC-063 が `buildMockPipeline` 呼出時に override してる」は事実誤認のため削除。`buildMockPipeline` の opts 型に `loopNames` / `loopFixerPairs` パラメータは存在しない。)

### 4. test (sanity check)

新規 TC 追加は不要 (= helper 修正は既存 TC を本番経路で再実行することに意味がある)。要件 1 で `STANDARD_LOOP_NAMES` / `STANDARD_LOOP_FIXER_PAIRS` を helper が直接 import する形にしたため、sync は structural に保証される (= 同一 identity を参照)。

念のため、`tests/unit/core/pipeline/buildMockPipeline.test.ts` (新規) で以下を assert:

- TC: `buildMockPipeline()` 経由で構築された `Pipeline` の `loopNames` が `STANDARD_LOOP_NAMES` と identity 等価 (= `===` で同一参照)
- TC: 同 `loopFixerPairs` が `STANDARD_LOOP_FIXER_PAIRS` と identity 等価

これで helper と本番の同期が test で保証され、将来の片方更新忘れが catch される。

### 5. run.ts の export 追加 (必要に応じて)

要件 4 の sanity check 実装のため、`run.ts` の `loopNames` / `loopFixerPairs` 定数を export する必要があれば追加:

```typescript
// src/core/pipeline/run.ts
export const STANDARD_LOOP_NAMES: readonly string[] = [STEP_NAMES.SPEC_REVIEW, STEP_NAMES.VERIFICATION, STEP_NAMES.CODE_REVIEW];
export const STANDARD_LOOP_FIXER_PAIRS: Record<string, string> = { ... };
```

これにより buildMockPipeline / sanity check / 他 test helper が共通定数を参照可能。

### 6. spec authority への反映

なし。`buildMockPipeline` は test 専用 helper で、spec authority の対象外。

## スコープ外

- buildMockPipeline 自体の責務再設計 (= 個別 step を全部 mock するか、本番 pipeline を re-export するか)
- 他 test helper との重複整理
- TC-060〜TC-066 等個別 test の意図見直し (= helper 同期後に期待値変更が必要なら個別対応、本 request スコープ内だが優先度低)

## 受け入れ基準

- [ ] `buildMockPipeline` の `loopNames` 既定値が `["spec-review", "verification", "code-review"]` (dsv 除外)
- [ ] `buildMockPipeline` の `loopFixerPairs` 既定値が 4 entries (code-review/spec-review/verification + delta-spec-validation の fixer ペア)
- [ ] 既定値変更で崩れる既存 TC があれば期待値修正済み (= 本番経路の挙動に合わせる)
- [ ] 不要な個別 override が削除されている
- [ ] sanity check test (= helper と run.ts の同期確認) が追加され pass する
- [ ] `bun run typecheck && bun run test` が green
- [ ] `grep -rn "delta-spec-validation" tests/core/pipeline/pipeline.test.ts` で helper の loopNames に dsv が含まれないことを確認

## Workflow Options

- enabled: []
