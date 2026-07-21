# Conformance Result — lineage-output-attribution — iteration 001

<!-- verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。 -->

## Scope

- **Change folder**: `specrunner/changes/lineage-output-attribution/`
- **Implementation diff**: `src/core/step/commit-orchestrator.ts` (+38/-28) + `src/core/step/__tests__/lineage-output-attribution.test.ts` (+662)
- **git diff main...HEAD --stat**: 19 files changed, 2202 insertions, 28 deletions（change folder artifacts + 1 source file + 1 test file）

---

## 1. tasks.md — チェックボックス完了確認

全タスクのチェックボックスが `[x]` であることを確認した。

| Task | 内容 | 状態 |
|------|------|------|
| T-01 | `IoRef` import 追加・`applySuccessPostPersistEffects` シグネチャ変更 | [x] |
| T-02 | `commitSuccess` — `projectSuccess` 前に writes/reads を評価 | [x] |
| T-03 | `commitRound` — 各メンバーの fold 前に writes/reads を評価 | [x] |
| T-04 | 回帰テスト追加（TC-LAO-01〜03） | [x] |
| T-05 | typecheck & test が green | [x] |

**適合**

---

## 2. design.md — 設計判断の実装反映確認

### D1: writes()/reads() を projectSuccess 前に評価、結果を持ち回す

`commitSuccess`（行 316–317）で `preWriteIo` / `preReadIo` を評価した直後（行 320）に `projectSuccess` を呼んでいる。
`applySuccessPostPersistEffects` への呼び出し（行 348）はこれらを引数として渡す。

```ts
// 行 316–320（commit-orchestrator.ts）
const preWriteIo: IoRef[] = step.writes ? step.writes(state, deps) : [];
const preReadIo: IoRef[] = step.reads ? step.reads(state, deps) : [];
let s = projectSuccess(state, step, result, findingsPath);  // ← 評価後
```

**適合**

### D2: commitRound でも各メンバーの fold 前に writes/reads を評価

`commitRound`（行 491–492）で各 member の `preWriteIo` / `preReadIo` を評価した後（行 503）に `projectSuccess` を呼んでいる。
評価時点は当該メンバーの StepRun が未追記の `state`（先行メンバー分は含む）。

```ts
// 行 491–503（commit-orchestrator.ts）
const preWriteIo: IoRef[] = step.writes ? step.writes(state, deps) : [];
const preReadIo: IoRef[] = step.reads ? step.reads(state, deps) : [];
// ... appendHistoryEntry ...
state = projectSuccess(state, step, result, findingsPath);  // ← 評価後
successEntries.push({ step, result, preWriteIo, preReadIo });
```

`successEntries` に `preWriteIo` / `preReadIo` を含む型 `Array<{ step; result; preWriteIo: IoRef[]; preReadIo: IoRef[] }>` で蓄積（行 478）し、post-persist ループ（行 554–555）で渡している。

**適合**

### D3: applySuccessPostPersistEffects シグネチャ変更・ガード条件変更

シグネチャ（行 204–205）:

```ts
preWriteIo: IoRef[],
preReadIo: IoRef[],
```

ガード（行 227）:

```ts
if (deps.runtimeStrategy && preWriteIo.length > 0 && deps.cwd)
```

設計通り `step.writes` チェックから `preWriteIo.length > 0` チェックに変更されている。メソッド内で `step.writes` / `step.reads` を直接呼ぶ箇所は存在しない（grep 確認済み）。

**適合**

### D4: IoRef を commit-orchestrator.ts に import

行 17:

```ts
import type { Step, AgentStep, IoRef } from "./types.js";
```

`IoRef` が `./types.js` 経由で import されている。

**適合**

---

## 3. spec.md — Requirement / Scenario 充足確認

### Requirement: lineage.outputs must reference files produced by the current attempt

> The system **SHALL** evaluate `step.writes(state, deps)` against the job state **before** the attempt's `StepRun` is appended.

- **Scenario「first attempt → -001 path」**: TC-001 が `state.steps = {}` から `commitSuccess` を呼び、`appendLineage` に渡されたパスが `/result-001\.md$/` に一致することをアサート。テスト green。
- **Scenario「second attempt → -002 path」**: TC-002 が 1 件の先行 run を持つ state から `commitSuccess` を呼び、パスが `/result-002\.md$/` に一致することをアサート。テスト green。

**適合**

### Requirement: lineage.outputs and inputs hash must be non-null for files that exist

> The system **SHALL** compute sha256 content hashes for all artifact paths that resolve to existing files.

- **Scenario「output exists → non-null hash」**: TC-003 が `"sha256:" + sha256(fileContent)` と `output.hash` が等しいこと、および `not.toBeNull()` をアサート。テスト green。
- **Scenario「optional input missing → null hash」**: TC-004 が `inputs[0].hash` が `null` であり、`required: false` が保持されることをアサート。テスト green。

**適合**

### Requirement: parallel round path has the same attribution fix

> The system **SHALL** also evaluate `writes(state, deps)` for each parallel round member against the state **before** that member's result is folded in.

- **Scenario「parallel reviewer → correct iteration path」**: TC-005 が single-member `commitRound` で `outputs[0].path` が `/result-001\.md$/` に一致し hash が non-null であることをアサート。テスト green。
- 追加 (should): TC-011 が 2-member round で step-a / step-b それぞれが互いのフォールドに無関係に `-001` を得ることをアサート。テスト green。

**適合**

---

## 4. request.md — 受け入れ基準充足確認

| 受け入れ基準 | 証拠 | 判定 |
|-------------|------|------|
| iteration 依存 step を連続 2 iteration 実行するテストで lineage.outputs が各自の実生成ファイルパスと一致（-001 / -002） | TC-001（-001）、TC-002（-002）がいずれも green | ✓ |
| lineage.outputs/inputs hash が non-null で実ファイル内容 hash と一致 | TC-003（`sha256:<hex>` 一致）green | ✓ |
| 修正前の挙動（追記後再計算で +1）に戻すと上記テストが fail することを破壊確認として記録 | TC-006（describe "D: 破壊確認"）：pre-push 評価 → `-001`、post-push 評価 → `-002` であることを数学的に証明。コメント「before this fix, the post-push state had length 1 → nextIteration=2 → path=-002 (missing) → hash=null」が記録されている | ✓ |
| 既存テストは無改変で green | `git diff main...HEAD -- src/core/step/__tests__/commit-orchestrator.test.ts` の出力が空（変更なし）。全 8332 テスト green | ✓ |
| `typecheck && test` が green | typecheck: exit 0（エラーなし）、test: 8332 passed / 1 skipped | ✓ |

**全受け入れ基準を達成**

---

## 検証できなかった項目

None

---

## Findings 詳細

None — 不適合 / 指摘事項なし。

---

## 補足観察

- `applySuccessPostPersistEffects` 内で `step.writes` / `step.reads` を直接呼ぶコードが完全に除去されており、D3 の意図（全呼び出し元が pre-evaluated IoRef[] を渡す）が貫徹されている。
- 管理対象外（managed runtime では `hash: null` のまま）について、design.md の Non-Goals と一致した挙動が確認できる（`digestArtifacts` はランタイム差異を吸収する抽象化越しに呼ばれており、実装への直接影響なし）。
- `io-iteration.ts` の `nextIteration` 実装（`(state.steps?.[stepName]?.length ?? 0) + 1`）は変更なし。設計 Non-Goals「パス算出ロジック自体は変更しない」に適合。
