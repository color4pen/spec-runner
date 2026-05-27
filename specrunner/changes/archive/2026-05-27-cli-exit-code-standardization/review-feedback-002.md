# Code Review Feedback — cli-exit-code-standardization — iter 2

## Summary

- **verdict**: approved
- **blocker count**: 0

iter 1 の唯一のブロッカー（F-01: doctor catch ブロックが非引数エラーで exit 2）が正しく修正された。`process.exit(EXIT_CODE.GENERAL_ERROR)` への 1 行変更のみで意図通り。typecheck + test は 270 files / 3037 tests で全 green。

---

## iter 1 Blocker の修正確認

### F-01 — [resolved] doctor catch ブロック修正

```diff
- process.exit(2);
+ process.exit(EXIT_CODE.GENERAL_ERROR);
```

`src/cli/command-registry.ts` line 545。設計が要求するセマンティクス（catch → 一般エラー = exit 1）に準拠。✅

---

## Findings

### F-01 — [informational] delta spec シナリオと実装の微小な不一致

**場所**: `specrunner/changes/cli-exit-code-standardization/specs/cli-commands/spec.md`

delta spec に以下のシナリオが記述されている:

```
#### Scenario: github token が欠けている（ステップ 2 で失敗）
- **THEN** ステップ 2 で `Run 'specrunner login' first.` を stderr に出し exit 2（前提条件不足）
```

しかし実装では、GitHub token 欠落時は `RUNTIME_PREREQ_MISSING` エラーが throw される。このコードは `EXIT_CODE_MAP` に未登録であり、`err.exitCode` は fallback の exit 1 になる。`tests/cli.test.ts` TC-064 も exit 1 を期待しており、実装と一致している。

**評価**: design.md D3 が `EXIT_CODE_MAP` に `RUNTIME_PREREQ_MISSING` を意図的に含めなかった結果であり、実装とテストは整合している。delta spec のシナリオが設計を誤って反映した spec ドキュメントの問題。blocking ではない。

解消するには `EXIT_CODE_MAP: { RUNTIME_PREREQ_MISSING: EXIT_CODE.ARG_ERROR }` を追加して TC-064 を exit 2 に更新するか、spec シナリオを exit 1 に修正するかのいずれか。

---

### F-02 — [informational] TC-32/33（NOT_GIT_REPO / REMOTE_NOT_GITHUB → exit 2）の自動テスト未カバー（iter 1 引き継ぎ）

`tests/cli.test.ts` TC-063 は `CONFIG_MISSING → exit 2` をカバーしているが、対応する NOT_GIT_REPO / REMOTE_NOT_GITHUB のシナリオ（TC-32/TC-33）に対する exit code の直接テストがない。コードロジック（`err.exitCode` を使用した `runRunCore` の preflight catch）は正しく実装されている。

---

### F-03 — [informational] TC-36/TC-37（cancel/finish の不正フォーマット → exit 2）の自動テスト未カバー

`command-registry.ts` の `job cancel` と `job finish --job` 双方でフォーマットバリデーション `→ EXIT_CODE.ARG_ERROR` が正しく実装されているが、これを直接検証するテストがない。specrunner-worktree-guard.test.ts は TC-38（worktree guard → exit 2）をカバーしているが cancel/finish の UUID バリデーションは対象外。

---

## Acceptance Criteria Checklist

| 基準 | 状態 |
|---|---|
| 全コマンドで exit code が 0/1/2 のいずれか | ✅ |
| 引数エラーで exit 2 | ✅（slug regex 不正・worktree guard・deprecated flags 等） |
| 一般エラーで exit 1 | ✅（doctor catch 修正済み） |
| `SpecRunnerError` 宣言的マッピング | ✅ |
| `bun run typecheck && bun run test` が green | ✅（270 files / 3037 tests passed） |
