# Tasks: merged-to-archive-consolidation

## [x] Task 1: `store.ts` — MERGED_SUBDIR 削除と checkSlugCollision 縮退

**File**: `src/core/request/store.ts`

1. L8 の `MERGED_SUBDIR` 定数定義を削除
2. L65-78 の "Check 2: requests/merged/" ブロック全体を削除
3. Check 3 (archive) のコメント番号を "Check 2" に更新

**結果**: `checkSlugCollision` が drafts + archive の 2 経路チェックに縮退。

## [x] Task 2: `types.ts` — `RequestState` 型削除

**File**: `src/core/request/types.ts`

1. L34-40 の `RequestState` 型定義 (= JSDoc + type 文) を削除

## [x] Task 3: `manager.ts` — state field 削除

**File**: `src/core/request/manager.ts`

1. L9 の `import type { RequestState } from "./types.js"` を削除
2. L41 の `list()` 戻り値型を `Array<{ slug: string; type: string; state: RequestState }>` → `Array<{ slug: string; type: string }>` に変更
3. L42 の `results` 変数の型も同様に更新
4. L47 の `results.push(...)` から `state: "active" as const` を削除

## [x] Task 4: `request-list.ts` — STATE 列削除

**File**: `src/core/command/request-list.ts`

1. L11 の header 文字列から `STATE` 列を削除: `"SLUG".padEnd(24) + "TYPE"` のみに
2. L14 の各行出力から `${req.state}` を削除
3. `import * as manager` は変更なし (list() の戻り値型変更に追従するだけ)

## [x] Task 5: `request-migrate-flat.ts` + test の削除

**Files**:
- `src/core/command/request-migrate-flat.ts` — ファイル削除
- `tests/unit/core/command/request-migrate-flat.test.ts` — ファイル削除

grep で他ファイルからの import が無いことを確認済み。

## [x] Task 6: test 更新 — store.test.ts

**File**: `tests/unit/core/request/store.test.ts`

1. TC-ST-006 (L91-101) の describe ブロック全体を削除
2. ファイル先頭の TC list コメント (L9) から TC-ST-006 の記述を削除

## [x] Task 7: test 更新 — slugify.test.ts

**File**: `tests/unit/util/slugify.test.ts`

1. TC-SL-006b (L124-126) の "active/ and merged/ directories do not exist" — テスト名を "drafts/ and archive/ directories do not exist" に更新 (動作は同じ)
2. TC-SL-006d (L138-146) の "throws SLUG_COLLISION when slug exists in merged/" テスト全体を削除

## [x] Task 8: test 更新 — finish-orchestrator.test.ts

**File**: `tests/finish-orchestrator.test.ts`

1. L99 の `if (p.includes("merged")) return Promise.resolve(false);` 行を削除

## [x] Task 9: 再現 test 追加

**File**: `tests/unit/core/request/store.test.ts` (既存ファイルに追記)

以下の静的 assertion test を追加:

```typescript
describe("Regression: MERGED_SUBDIR removed", () => {
  it("store.ts source does not contain MERGED_SUBDIR", async () => {
    const src = await fs.readFile(
      path.join(__dirname, "../../../../src/core/request/store.ts"),
      "utf-8",
    );
    expect(src).not.toContain("MERGED_SUBDIR");
  });

  it("store.ts source does not contain requests/merged path", async () => {
    const src = await fs.readFile(
      path.join(__dirname, "../../../../src/core/request/store.ts"),
      "utf-8",
    );
    expect(src).not.toContain("requests/merged");
  });
});
```

## [x] Task 9b: test 更新 — request-patterns.test.ts

**File**: `tests/unit/context/request-patterns.test.ts`

acceptance criteria 要件 9 に従い、archive 経路で拡大した 151 件カバレッジを確認する test を追加する:

1. `getRequestPatterns` (または対応関数) が `specrunner/changes/archive/` 配下の **151 件**のエントリを収集できることを assert
2. `requests/merged/` 配下を走査しないことを assert（ENOENT エラーが発生しない）
3. 既存の 107 件テストが 151 件に更新されている場合はカウントを更新する

## [x] Task 10: delta spec — cli-commands capability

**File**: `specrunner/changes/merged-to-archive-consolidation/delta-specs/cli-commands/spec.md`

以下の Requirement を delta spec として記述する。各 Requirement は **Replaces** で既存 baseline の該当ブロックを置換。

### 10a: help テキスト更新

**Replaces**: 「`specrunner --help` は主語別グルーピングで表示される」

変更点:
- `request ls` の説明を "active 配下の request 一覧" → "drafts 配下の request 一覧" に
- `request rm <slug>` の説明を "active 配下から削除" → "drafts 配下から削除" に

### 10b: request new 更新

**Replaces**: 「`specrunner request new <slug>` は template から request.md を作成する」

変更点:
- Step 2: "active / merged 配下" → "drafts + changes/archive の 2 経路"
- Step 4: "specrunner/requests/active/<slug>.md" → "specrunner/drafts/<slug>.md"
- Step 5: "Created: specrunner/requests/active/<slug>.md" → "Created: specrunner/drafts/<slug>.md"
- Scenario パス更新

### 10c: request show 更新

**Replaces**: 「`specrunner request show <slug>` は request.md の本文を表示する」

変更点:
- "specrunner/requests/active/<slug>.md" → "specrunner/drafts/<slug>.md"

### 10d: request rm 更新

**Replaces**: 「`specrunner request rm <slug>` は active 配下から request を削除する」→ title を 「`specrunner request rm <slug>` は drafts 配下から request を削除する」に

変更点:
- "specrunner/requests/active/<slug>.md" → "specrunner/drafts/<slug>.md"
- title 内の "active" → "drafts"

### 10e: request サブコマンド群 (旧 dir format scenario) 更新

**Replaces**: 「`specrunner request` サブコマンド群が動作する」

変更点:
- L450-463 の scenario パスを `specrunner/drafts/<slug>.md` に更新
- テーブルは L728-743 の drafts テーブル更新で既に置換済みなので、scenarios のみ

### 10f: job サブコマンド群 (旧 dir format scenario) 更新

**Replaces**: 「`specrunner job` サブコマンド群が動作する」

変更点:
- L493 の scenario パスを `specrunner/drafts/<slug>.md` に更新

## [x] Task 11: typecheck + test green 確認

`bun run typecheck && bun run test` を実行し green を確認。

## [x] Task 12: ADR 生成

記録事項:
- merged → archive 統合の判断
- 44 件不足分を archive 側に救済する判断 (PR #348 で実施済)
- archive 経路を真の一本化に到達
- PR #347 の baseline 整合性漏れの retrospective 是正
- LLM 不確定性の構造観察 (53 行の spec のうち 5-6 行が delta から漏れた)
