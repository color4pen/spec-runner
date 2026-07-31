# Cross-Boundary Invariants Review — deterministic-request-entrance — iter 1

## 検査スコープと観点

diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないか。
実装が正しくテストが green であっても、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

レビュー対象パス（reviewer 定義 paths）:

- `src/core/pipeline/**`
- `src/core/step/**`
- `src/state/**`
- `src/store/**`
- `src/adapter/**`
- `src/core/runtime/**`
- `src/core/verification/**`

---

## 検証した経路と結論

### 経路 1: `manager.create()` 削除と `workspace-materializer.ts` の名前衝突

`src/core/runtime/workspace-materializer.ts` が `this.host.manager.create(...)` を呼んでいることを確認した。
これは `WorktreeManager`（`../worktree/manager.js`）の `create()` であり、削除された `src/core/request/manager.create()` とは別オブジェクト。
`workspace-materializer-structure.test.ts` の構造ゲート（`manager.create(` の出現回数チェック）も worktree 側を見ているため、request manager の削除は影響しない。

**前提は保たれている。**

### 経路 2: `request-list.ts` の `manager.list()` 依存

`src/core/command/request-list.ts` は `import * as manager from "../request/manager.js"` で `manager.list()` を呼ぶ。
削除対象は `manager.create()` のみで、`list()` / `resolve()` は残置されている。

**前提は保たれている。**

### 経路 3: `OneShotQueryClient` port 削除と adapter/runtime 層への影響

`src/core/port/index.ts` から `OneShotQueryClient` re-export 行が除去された。
`src/core/pipeline/`、`src/core/step/`、`src/core/runtime/`、`src/state/`、`src/store/` のいずれも `OneShotQueryClient` を import していないことを grep で確認した（0 件）。
B-1 不変条件（core/ は adapter/ を import しない）は変更前後で侵害されていない。

**前提は保たれている。**

### 経路 4: `query-one-shot.ts` の production 死コード化

`ClaudeCodeOneShotQueryClient` 削除後、`src/adapter/claude-code/query-one-shot.ts` は production 未参照になる（design.md D5 の意図的残置）。
同ファイルの import を確認: `config/step-config.js` / `config/model-registry.js` / `errors.js` / `core/port/model-usage.js`（型のみ） / `./sdk-loader.js` / `util/env-filter.js`。削除されたファイルへの import は存在しない。
B-1（core が adapter を import しない）は adapter 層の死コード存在で侵害されない（方向が逆）。

**前提は保たれている。**

### 経路 5: `CommandInvocation.command` union と usage トラッキング

`CommandInvocation.command` は `"request-review" | "request-generate" | "job"`。
`executePrompt()` は `appendInvocation` を呼ばない（LLM コマンドではないため usage トラッキング対象外）。
既存の usage 集計ロジック（`usage-summary.ts` / `store.test.ts`）は `"request-prompt"` の存在を前提としておらず、型変更もないため互換性は維持される。

**前提は保たれている。**

### 経路 6: B-18 の歯（`request-entrance-llm-boundary.test.ts`）の実効性

2 つの primary describe ブロック（TC-006）が `grepE()` ベースの実際の grep で `src/core/request/` および `src/core/command/request-*.ts` を検査していることを確認した。
`grepE` は exit code 1（マッチなし）を `""` に変換し、`expect(result).toBe("")` が green になる構造。
LLM 系 import を実際に追加すれば grep が非空文字列を返し、`expect(result).toBe("")` が red になる。

**B-18 の実効的な不変条件は保たれている。**

---

## Findings

### F-01 (LOW): B-18 regression guard テストが grepE を呼ばず vacuously true

**ファイル**: `tests/unit/architecture/request-entrance-llm-boundary.test.ts:107–135`

"B-18 regression guard" describe ブロックの 2 テストが、非空の文字列リテラルを `syntheticMatch` に代入し `expect(syntheticMatch).not.toBe("")` を assert するだけで `grepE` を一切呼ばない。これらのテストは常に green になり、grep 検出機構の健全性を証明しない。

primary describe ブロック（行 74–103）の実 grep テストは正しく機能しているため、B-18 の runtime 不変条件は侵害されていない。ただし primary テストの grep ロジックが将来壊れた場合（誤ったディレクトリやパターン変更）、regression guard はそれを検出しない。

### F-02 (LOW): 削除検証テストが 2 ファイルに重複

**ファイル**: `tests/unit/generate-chain-removed.test.ts` / `tests/unit/cli/deprecated-generate-removal.test.ts`

TC-005、TC-007、TC-008、TC-009、TC-010、TC-011、TC-012、TC-014 が両ファイルでほぼ同一の assertion で二重カバーされている。将来の変更で一方を更新し他方を更新しないと、TC 番号が同じでも検査内容が乖離するリスクがある。runtime 不変条件への影響はないが、メンテナンス上の cross-boundary risk を形成する。

---

## Observations（情報のみ、ブロックなし）

### O-01: `query-one-shot.ts` docstring に stale reference

`src/adapter/claude-code/query-one-shot.ts:9` の docstring が "request-create generator" をユースケースとして列挙しているが、当該コードは本 change で削除された。将来の開発者が production 消費者がいると誤解する可能性がある（D5 の意図と反する）。

### O-02: B-18 gate の `request.ts` 除外（設計済みスコープ境界）

B-18 テストの `--include="request-*.ts"` glob は `request.ts`（ハイフンなし）を除外する。`executeTemplate` / `executeValidate` を含む `request.ts` も request 系入口だが、現時点で LLM import を持たないため実害はない。design.md D6 で明示的に受容済み。

---

## 新経路の網羅チェック

| 経路 | 隣接機構の前提 | 状態 |
|------|----------------|------|
| `request prompt` → `executePrompt()` → stdout | usage トラッキングなし（LLM コマンドでない）、config/auth 未呼び出し | ✓ 前提維持 |
| `request generate` → 未知サブコマンド → exit 2 | 削除済み一本鎖への到達経路が消滅 | ✓ 前提維持 |
| `request ls` → `manager.list()` | `list()` 残置、`create()` 削除は無影響 | ✓ 前提維持 |
| worktree 作成 → `WorkspaceMaterializer.manager.create()` | WorktreeManager.create()、request manager と別物 | ✓ 前提維持 |
| B-18 検査 → grepE → `src/core/request/` / `src/core/command/request-*.ts` | primary 実 grep テストが機能 | ✓ 前提維持 |
