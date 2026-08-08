# Code Review Feedback: step-prompt-artifact-injection

**Iteration**: 1
**Scope**: 22 files changed (+2220 / −9)
**Gate status**: `typecheck && test` green (10794 tests, 1 skipped)

---

## 検証した項目

- `git diff main...HEAD --stat` でスコープ確認
- `src/adapter/shared/artifact-bundle.ts`（新規）の全実装
- `src/adapter/claude-code/agent-runner.ts` の配線差分（L460-490 近傍）
- `src/adapter/codex/agent-runner.ts` の配線差分（L331-348 近傍）
- `tests/unit/adapter/shared/artifact-bundle.test.ts`（TC-001〜TC-011 全件）
- `src/adapter/claude-code/__tests__/artifact-bundle-injection.test.ts`（TC-013, TC-014, TC-016）
- `src/adapter/codex/__tests__/artifact-bundle-injection.test.ts`（TC-012, TC-015）
- `src/adapter/codex/__tests__/resume-prompt-injection.test.ts`（TC-015 implicit + 変更内容）
- `tests/setup-fs-spy.ts`（新規グローバルセットアップ）
- `vitest.config.ts` の差分（setupFiles 追加）
- `src/core/step/` への変更が 0 件であることを git diff で確認
- `bun run typecheck` → エラーなし
- `bun run test` → 10794 passed / 1 skipped（全通過）
- `test-cases.md`（17 ケース）と実装・テストの対応を全件照合

## 検証できなかった項目

None

---

## Acceptance Criteria Verification

| Criterion | Status |
|---|---|
| (a) 存在する入力 artifact が同梱される（TC-001） | ✅ |
| (b) 存在しない artifact はスキップされる（TC-002） | ✅ |
| (c) 出力系 artifact は同梱されない（TC-003） | ✅ |
| (d) 合計サイズ上限超過時は同梱なし（TC-004, TC-007） | ✅ |
| `src/core/step/` 配下の既存 buildMessage テストが無改変で green | ✅（変更ゼロ確認） |
| `typecheck && test` が green | ✅ |

---

## Findings 詳細

### F-001 [medium · fixable] `statSync` が design D4「stat は使わない」に違反している

**File**: `src/adapter/shared/artifact-bundle.ts` line 11, 41–45

D4 は「存在確認のための `stat` 別呼びはしない — TOCTOU を作らず、呼び出しも半減する」と明示し、
change folder 不在の場合は全 `readFile` が ENOENT で失敗 → `collected=[]` → `""` を返すことを
設計として織り込んでいる。

実装は `statSync`（同期、libuv を経由しない）による fast-path を持つ。コメントには
「fake-timer tests where the thread-pool scheduling delay would otherwise push the first await past the check phase」と記載されており、
テスト基盤の都合が本番コードに漏れている。

問題点:

- D4 の決定事項（`stat` 禁止）への直接違反
- `statSync` は同期呼び出しであり、Event Loop を block する（CLI では軽微だが bad pattern）
- TOCTOU: `statSync` 成功 → folder が削除される → `readFile` 失敗 のウィンドウが生じる（D4 が排除しようとした懸念の部分的復活）
- テスト都合の回避策を本番コードに埋め込むのは保守性のリスク

**修正方針**: `statSync` fast-path を削除する。TC-008（change folder 不在 → `""`）は
`readFile` の ENOENT スキップによって同じ結果を返すため、すべてのテストケースは通過する。
fake-timer テストで問題が生じる場合はテスト側で対処する（例: `vi.useFakeTimers` のスコープを
調整する、あるいは async の await depth を制御するモック側の仕組みで解決する）。

```diff
- import { statSync } from "node:fs";
  ...
  export async function buildArtifactBundle(cwd: string, slug: string): Promise<string> {
    const folderRel = changeFolderPath(slug);
-   try {
-     statSync(path.join(cwd, folderRel));
-   } catch {
-     return "";
-   }
    const results = await Promise.all(
      INPUT_ARTIFACT_NAMES.map(async (name) => { ... })
    );
```

---

## Observations (non-blocking)

### O-001 [low] `setupFiles` による `node:fs/promises` グローバルモックは全テストに波及する

`vitest.config.ts` に `setupFiles: ["./tests/setup-fs-spy.ts"]` を追加したことで、
`vi.spyOn(fs, "readFile")` に必要な mutable namespace が全テストで得られる。
動作は問題なく（実関数の参照をそのまま spread しているため挙動は同一）、全テスト通過している。

留意点: 将来のテストが `vi.mock("node:fs/promises", ...)` を書かずにファイルレベルの spy 動作を
期待する場合、このグローバルセットアップがデフォルトになっていることを前提にすることになる。
コメントは `setup-fs-spy.ts` に十分に記載されている。

### O-002 [low] `artifact-bundle-injection.test.ts` の `zod/v4-mini` import

```typescript
import { string } from "zod/v4-mini";
```

`zodSchema: { verdict: string() }` のためだけに `zod/v4-mini` をテストで import している。
`ReportToolSpec.zodSchema` の型は `ZodRawShape` であり、テストでは `{}` で代替できる
（`workspace-tool-guard.test.ts` の先例）。機能上は問題ないが、将来的に zod のマイグレーションが
発生した際に余分な更新点になる可能性がある。
