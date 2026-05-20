# Code Review Feedback — flatten-request-files — iter 1

- **verdict**: needs-fix
- **reviewer**: code-reviewer
- **date**: 2026-05-20

---

## 総評

実装品質は高い。全 7 実装ファイルが design.md の設計判断に沿っており、全 2477 テストが green。ADR・delta spec・migration 実行も完了している。ただし test-cases.md が "must" と指定した TC-PIPELINE-001/002 が未カバーのため needs-fix とする。修正量は極小（~20 行の追加テスト）。

---

## Findings

### F-01 (must): TC-PIPELINE-001/002 — CANONICAL_PATTERN の単体テストが存在しない

**対象**: `src/core/command/pipeline-run.ts` (line 23)  
**severity**: must-fix

`CANONICAL_PATTERN` の変更（`/active/([^/]+)/[^/]+\.md$/` → `/active/([^/]+)\.md$/`）は `specrunner run` の全呼び出しで slug を抽出する critical path だが、regex を直接検証するテストが存在しない。test-cases.md は TC-PIPELINE-001/002 を "must" 指定している。

```ts
// Canonical path pattern: specrunner/requests/active/<slug>.md
const CANONICAL_PATTERN = /^.*\/specrunner\/requests\/active\/([^/]+)\.md$/;
```

**TC-PIPELINE-001 (must)**: flat パス `/path/to/specrunner/requests/active/my-feature.md` が match し、`match[1]` が `"my-feature"` になること  
**TC-PIPELINE-002 (must)**: 旧形式 `/path/to/specrunner/requests/active/my-feature/request.md` が **不一致** になること

既存の `tests/unit/core/pipeline/` 配下または新規ファイルに追加することで対応できる。

---

### F-02 (minor): TC-STORE-008 — `store.read()` の直接テストがない

**対象**: `src/core/request/store.ts` (line 34-38)  
**severity**: minor

`read()` は `request-show` テスト (TC-SHOW-001) で間接的にカバーされているが、store.test.ts には TC-ST-001〜07 しかなく TC-STORE-008 が欠落している。test-cases.md の "must" 指定に不一致。

```ts
// store.read() は resolve() 経由で flat path を使う
export async function read(cwd: string, slug: string): Promise<ParsedRequest> {
  const filePath = resolve(cwd, slug);
  const content = await fs.readFile(filePath, "utf-8");
  return parseRequestMdContent(content, filePath);
}
```

TC-STORE-008 の GIVEN/WHEN/THEN:
- GIVEN: `active/my-feature.md` に内容 `<content>` が存在する
- WHEN: `read(cwd, "my-feature")` を呼ぶ
- THEN: `<content>` が返却される

F-01 対応時にまとめて追加を推奨。

---

### F-03 (info): 検証カバレッジツールが "0/0 must TCs covered" と誤報

**対象**: `specrunner/changes/flatten-request-files/verification-result.md` (line 14)  
**severity**: info (ツール側の問題、コード側の問題ではない)

```
test-coverage: 0/0 must TCs covered (no must TCs defined)
```

test-cases.md には多数の "must" TC が定義されているため、カバレッジ検出ツールがファイルを正しく参照できていない。今後の verification step で修正が必要だが、本 PR のブロッカーではない。

---

### F-04 (info): TC-LS-001/002, TC-VALIDATE-001, TC-REVIEW-001, TC-WORKTREE-001 の直接テストなし

**severity**: info

これらは全て `store.resolve()` / `store.list()` 経由で動作するため、F-01/F-02 以上の実質的リスクはない。TC-ST-001/002/003 でコア路線がカバーされており、直接テスト追加は "should" 水準の作業と判断する。

---

## 正常確認事項（通過）

| 確認項目 | 結果 |
|---|---|
| `store.ts` resolve/list/write/checkSlugCollision が flat 形式 | ✅ |
| `request-rm.ts` が `fs.unlink(filePath)` に変更済み | ✅ |
| `move-requests-dir.ts` が `.md` suffix でファイル単位 mv | ✅ |
| `resolve-target.ts` が `.isFile() && .endsWith(".md")` フィルタ | ✅ |
| `request-migrate-flat.ts` が partial migration + stderr warning を実装 | ✅ |
| 既存 dir 形式 request 群が flat 形式に migration 実行済み | ✅ |
| ADR に flat 化・changes/ 固定名維持・migration 方針の 3 判断を記録 | ✅ |
| delta spec (`specs/cli-commands/spec.md`) が request new/show/rm を flat 表記に更新 | ✅ |
| typecheck + 全テスト (2477) green | ✅ |

---

## 修正指示

### Must

**F-01 対応**: `CANONICAL_PATTERN` の単体テストを追加する。

追加先の例: `tests/unit/core/command/pipeline-run-canonical.test.ts`（または既存の pipeline テストファイルに追記）

```typescript
import { describe, it, expect } from "vitest";

// CANONICAL_PATTERN を直接テストするため module 経由で regex を取得する
// (export されていない場合は正規表現リテラルを直接記述)
const CANONICAL_PATTERN = /^.*\/specrunner\/requests\/active\/([^/]+)\.md$/;

// TC-PIPELINE-001
describe("TC-PIPELINE-001: flat path matches and extracts slug", () => {
  it("extracts slug from canonical flat path", () => {
    const m = CANONICAL_PATTERN.exec("/path/to/specrunner/requests/active/my-feature.md");
    expect(m).not.toBeNull();
    expect(m![1]).toBe("my-feature");
  });
});

// TC-PIPELINE-002
describe("TC-PIPELINE-002: old dir-form path does not match", () => {
  it("rejects legacy active/<slug>/request.md pattern", () => {
    const m = CANONICAL_PATTERN.exec("/path/to/specrunner/requests/active/my-feature/request.md");
    expect(m).toBeNull();
  });
});

// TC-PIPELINE-003
describe("TC-PIPELINE-003: hyphenated slug is correctly extracted", () => {
  it("extracts multi-part-slug from path", () => {
    const m = CANONICAL_PATTERN.exec("/path/to/specrunner/requests/active/multi-part-slug.md");
    expect(m![1]).toBe("multi-part-slug");
  });
});
```

### Minor (F-02 と同時対応を推奨)

`tests/unit/core/request/store.test.ts` に TC-ST-008 を追加:

```typescript
// TC-ST-008
describe("TC-ST-008: read() returns parsed request from flat file", () => {
  it("reads content from active/<slug>.md", async () => {
    const content = "# My Feature\n\n## Meta\n\n- **type**: new-feature\n- **slug**: my-feature\n- **base-branch**: main\n- **adr**: false\n\n## Workflow Options\n\n- enabled: []\n";
    await write(tempDir, "my-feature", content);
    const parsed = await read(tempDir, "my-feature");
    expect(parsed.slug).toBe("my-feature");
  });
});
```

（`read` を store.test.ts の import に追加する必要あり）
