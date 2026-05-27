# Code Review Feedback — cli-exit-code-standardization — iter 1

## Summary

- **verdict**: needs-fix
- **blocker count**: 1 (minor / single-line fix)

全体的な実装品質は高い。`EXIT_CODE` 定数・`EXIT_CODE_MAP`・`SpecRunnerError.exitCode` の三層構造が設計通りに実装され、対象7コマンド（init / login / job-show / job-ls / managed ×3）の `process.exit()` 排除も完了している。typecheck + test も全 green。

ただし doctor ハンドラの catch ブロックで非引数エラーが exit 2 を返す点が、本 PR が定義した exit code セマンティクスに反するため、修正が必要。

---

## Findings

### F-01 — [minor / blocker] doctor catch ブロックが非引数エラーでも exit 2 を返す

**場所**: `src/cli/command-registry.ts` line 545

```typescript
doctor: {
  handler: async (parsed) => {
    try {
      process.exit(await runDoctor({ json: !!parsed.flags["json"] }));
    } catch (err: unknown) {
      stderrWrite(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(2);  // ← 問題箇所
    }
  },
},
```

`runDoctor` が予期しない例外（ネットワークエラー・I/O 障害等）を throw した場合、catch ブロックが `process.exit(2)` を呼ぶ。しかし本 PR が確立した定義では exit 2 は **引数エラー**（不正な slug、フラグの矛盾、前提条件不足）であり、runtime crash は exit 1（一般エラー）でなければならない。

`doctor` は `--json` 以外に引数を持たないため、catch で捕捉される例外が「引数エラー」である可能性はほぼゼロ。これは pre-existing behavior の保持だが、本 PR の目的（セマンティクスの統一）に直接反する。

**修正**:

```typescript
} catch (err: unknown) {
  stderrWrite(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(err instanceof SpecRunnerError ? err.exitCode : EXIT_CODE.GENERAL_ERROR);
}
```

あるいは最小修正として:

```diff
- process.exit(2);
+ process.exit(EXIT_CODE.GENERAL_ERROR);
```

---

### F-02 — [informational] TC-31/32/33（run preflight → exit 2）が自動テスト未カバー

**場所**: `tests/exit-code-standardization.test.ts`（TC-01〜TC-11 のみ収録）

受け入れ基準の key シナリオ:
- TC-31: `CONFIG_MISSING` → exit 2
- TC-32: `NOT_GIT_REPO` → exit 2
- TC-33: `REMOTE_NOT_GITHUB` → exit 2

`run.ts` の `runRunCore` における `err.exitCode` 使用は正しく実装されているが、これらのシナリオに対応する自動テストが存在しない。コードロジックは正しいため blocking ではないが、フォローアップで追加を検討。

---

### F-03 — [informational] validate / review handler の inline process.exit() は仕様範囲内

`command-registry.ts` の `validate` / `review` ハンドラ（line 258, 264, 284, 290）は inline で `process.exit(2)` / `process.exit(1)` を呼び続けている。

TC-46 の記述（"handler 内の process.exit() はなく"）と一見矛盾するが、`spec.md` の Requirement セクションでは `process.exit()` 排除の対象を明示的に **init / login / job-show / job-ls / managed setup / managed status / managed reset** に限定している。validate / review は対象外であり、現状は spec-compliant。

---

## Acceptance Criteria Checklist

| 基準 | 状態 |
|---|---|
| 全コマンドで exit code が 0/1/2 のいずれか | ✅（doctor crash → 2 はセマンティクス違反、要修正）|
| 引数エラーで exit 2 | ✅ |
| 一般エラーで exit 1 | ⚠️ doctor catch が exit 2（F-01） |
| `SpecRunnerError` 宣言的マッピング | ✅ |
| `bun run typecheck && bun run test` が green | ✅（verification-result.md 確認済み）|

---

## Required Changes

1. **F-01 を修正すること**: `command-registry.ts` doctor handler catch ブロックの `process.exit(2)` を `process.exit(EXIT_CODE.GENERAL_ERROR)` に変更する。
