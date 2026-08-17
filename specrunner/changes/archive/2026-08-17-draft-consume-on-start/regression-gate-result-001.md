# Regression Gate Result — draft-consume-on-start — iter 1

## Findings Ledger Verification

### F-001 [MEDIUM]: TC-008「archive backstop no-op when draft consumed」テスト未実装
- **File**: tests/unit/core/archive/orchestrator.test.ts
- **Status**: ✅ FIXED

`tests/unit/core/archive/orchestrator.test.ts` に TC-008 が追加されている（line 819-855）。
`makeFs().exists` を `specrunner/drafts` パスで `false` を返す stub でオーバーライドし、`fs.rm` が drafts パスで呼ばれないことをアサートしている。no-op 分岐への歯が実装された。

---

### F-002 [LOW]: managed.ts git add failure は non-throwing
- **File**: src/core/runtime/managed.ts:214
- **Status**: ⚠️ STILL PRESENT

`managed.ts` 214-218 行の git add 失敗ハンドラは警告のみで続行する（修正なし）：

```typescript
if (gitAddChangeFolderResult.exitCode !== 0) {
  // Non-fatal: log warning but don't fail setup
  stderrWrite(
    `Warning: failed to stage change folder request.md: ${gitAddChangeFolderResult.stderr.trim()}`,
  );
}
```

比較: `workspace-materializer.ts:189-193` は throw（worktree cleanup 付き）、`local.ts:403-404` は throw。managed のみ non-throwing で非対称のまま。

---

### F-003 [MEDIUM]: 非 canonical requestFilePath + 同 slug の canonical draft 共存 → canonical draft が無言で消費される
- **File**: src/core/artifact/copy-artifacts.ts:147
- **Status**: ⚠️ STILL PRESENT

`consumeDraft` は slug から canonical パスを導出するのみで、`requestFilePath` の canonical 判定を行わない（設計判断 D2）。呼び出し側（workspace-materializer:241, local.ts:447, managed.ts:271）にも canonical チェックなし。非 canonical な path で起動し、かつ同 slug の canonical draft が存在する場合、canonical draft が警告なしに削除される状況は未変更。

---

## Evidence

| # | Finding | Checked | Result |
|---|---------|---------|--------|
| 1 | TC-008 test added | orchestrator.test.ts:819-855 を確認 | FIXED |
| 2 | managed.ts git add non-throwing | managed.ts:214-218 を確認 | STILL PRESENT |
| 3 | non-canonical path silent consume | copy-artifacts.ts + 3 call sites を確認 | STILL PRESENT |
