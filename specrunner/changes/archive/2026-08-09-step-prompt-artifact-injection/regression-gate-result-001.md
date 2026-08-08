# Regression Gate Result — Iteration 001

## Ledger Summary

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | MEDIUM | T-05: claude-code テストに prompt キャプチャが欠落 | ✅ Fixed |
| 2 | LOW | T-04(e) が spec の OR 条件を片方しかカバーしない | ✅ Fixed |
| 3 | LOW | T-04 に非 ENOENT の per-file エラーのテストケースがない | ✅ Fixed |
| 4 | MEDIUM | `statSync` が design D4「stat は使わない」に違反 | ✅ Fixed |
| 5 | LOW | executeTurn abort 時に `streamedResult` が `.catch()` なしで破棄 | ❌ Regression |

---

## Finding 1 — T-05 prompt キャプチャ（MEDIUM）✅ Fixed

**確認箇所**: `src/adapter/claude-code/__tests__/artifact-bundle-injection.test.ts`

新規 helper `makeCaptureQueryFnWithPrompt()` を定義し、`params.prompt` を `capturedQueries[].prompt` として収集している（L36–58）。  
TC-013 は `capturedQueries[0]!.prompt` に `<bundled-change-artifacts>` と design.md パスヘッダ・内容が含まれることを assert しており、受け入れ基準を満たす。  
既存の `makeCaptureQueryFn`（options のみ収集）は変更せず、拡張版を別 helper として定義——tasks.md の記述「拡張または新規 helper が必要」と一致。

---

## Finding 2 — T-04(e) OR 条件（LOW）✅ Fixed

**確認箇所**: `specrunner/changes/step-prompt-artifact-injection/tasks.md` L89–91、`tests/unit/adapter/shared/artifact-bundle.test.ts` TC-005/TC-008/TC-009

tasks.md の (e) が以下に分割されている:
- (e-1) change folder を掘らない slug で `""` を assert
- (e-2) change folder は存在するが artifact が 0 件のケースでも `""` を assert

テストファイルでは TC-005（L139–161）が両方のサブケースを it ブロックで実装し、TC-008（L209–220）と TC-009（L225–238）で同等のケースを別途確認している。

---

## Finding 3 — 非 ENOENT per-file エラー（LOW）✅ Fixed

**確認箇所**: `specrunner/changes/step-prompt-artifact-injection/tasks.md` L92–94、`tests/unit/adapter/shared/artifact-bundle.test.ts` TC-010（L243–276）

tasks.md に (f) が追加され、`fs.readFile` が EACCES を throw するケースを vi.spyOn でモックし、他の artifact は正常収集されることを assert するよう明記。TC-010 がそれを実装しており、ENOENT 以外のエラーも per-file skip となることを機械的に検証している。

---

## Finding 4 — `statSync` D4 違反（MEDIUM）✅ Fixed

**確認箇所**: `src/adapter/shared/artifact-bundle.ts`

`statSync` の呼び出しは存在しない。実装は `fs.readFile(..., "utf-8")` の catch で ENOENT・権限エラーを共通 skip し、D4「stat は使わない」を遵守している。`node:fs/promises` 以外の fs API の使用もない。

---

## Finding 5 — `streamedResult.catch(() => {})` 欠落（LOW）❌ Regression

**確認箇所**: `src/adapter/codex/agent-runner.ts` L385–389

```typescript
const streamedResult = thread.runStreamed(prompt, opts);
if (opts.signal?.aborted) {
  throw opts.signal.reason ?? new Error("The operation was aborted");
}
const { events } = await streamedResult;
```

abort 分岐では `streamedResult` を await せずに throw している。指定された修正「`streamedResult.catch(() => {})` を追加してサプレス」は適用されていない。  
SDK が already-aborted signal を受け取って後発 reject した場合、orphaned Promise となり Bun の unhandledRejection でプロセスが終了するリスクが残る。

なお、コメント（L379–384）は「executeTurn calls signal.throwIfAborted() before invoking runStreamed」と記述しているが、実際のコードは `runStreamed` を先に呼び出した後で `opts.signal?.aborted` を確認しており、コメントと実装が一致していない点も付記する。

タイムアウト登録を `buildArtifactBundle` I/O の前に移動したこと（構造的変更）は race window の原因分析として正しいが、unhandled rejection の抑制は別途 `.catch(() => {})` が必要。
