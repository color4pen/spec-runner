# Review Feedback 006 — permission-layer-git-write-denial

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## Scope

Iteration 6 review. Verifying resolution of iteration 5 findings (F-1, F-2) applied by operator commit `d961c50a7`.

---

## 前回指摘の解消確認

### F-1（iteration 5）解消済み — tasks.md T-07 stale 記述

**解消確認**: `tasks.md` T-07 は現在以下のとおり正確に記述されている:

```
- [x] `src/adapter/claude-code/__tests__/sandbox-scope.test.ts` の `TC-SB-02`：新契約へ更新済み —
      「allowedTools に Bash 非含有 + `autoAllowBashIfSandboxed: false`」を固定する
      （probe 観測 B により Bash は canUseTool 経由に変更。design D6 の実行記録参照）。
```

`sandbox-scope.test.ts:160-183` の実装と一致（`autoAllowBashIfSandboxed: false` 確認・Bash 非含有確認をテスト固定）。operator 適用による canon path 修正として正しく処理された。

---

### F-2（iteration 5）解消済み — TC-FW-04 説明文の旧命名

**解消確認**: `workspace-tool-guard.test.ts:195` のテスト説明が更新された:

```
- 旧: it("allows Bash with any command", ...)
+ 新: it("allows Bash with a read-only git command (mutations are denied by the classifier branch)", ...)
```

現在の guard の実挙動（git 状態変更は deny、読み取り系は allow）と説明が一致している。

---

## 受け入れ基準トレース

| 受け入れ基準 | 状態 | 根拠 |
|-------------|------|------|
| classifier 単体テスト（TC-001〜TC-009、パイプ・`&&` 連結含む） | ✅ | `git-command-classifier.test.ts` TC-001〜TC-009 + F-ALIAS suite（long form 含む）|
| guard 単体テスト（scoped/guarded deny・allow, pipeline 管理パス, cwd 境界） | ✅ | `workspace-tool-guard.test.ts` TC-011〜TC-033 |
| allow 経路が `updatedInput` パススルーを維持 | ✅ | TC-033 / TC-013 / TC-014 |
| probe 実行記録（R5 の 5 シナリオ） | ✅ | `design.md` D6 に 2026-07-23 実行記録（観測 B 確定 + 全 5 シナリオ PASS） |
| 既存の write-scope / 合成 / egress テストが無改変で green | ✅ | `write-scope.ts` / `round-git-scope.ts` / `commit-push.ts` diff ゼロ確認済み |
| 破壊確認（revert でテストが fail） | ✅ | TC-037 が Bash 非含有を固定；TC-011 が scope なし mutation deny を固定 |
| `typecheck && test` green | ✅ | `verification-result.md`: 9075 tests passed, 1 skipped; build / typecheck / lint 全 pass |

---

## Findings

なし。

---

## 検証した項目

- operator commit `d961c50a7` の変更内容確認（tasks.md T-07、workspace-tool-guard.test.ts TC-FW-04）
- F-1・F-2 の解消を tasks.md 実テキスト・テストファイル双方で照合
- `verification-result.md` 最終結果（9075 passed / 全フェーズ pass）の再確認
- 変更対象 src/ ファイル一覧（13 ファイル）が設計上の変更範囲と一致することを確認

## 検証できなかった項目

None。

## Findings 詳細

None。前回 F-1（warn）・F-2（info）は operator 適用により解消済み。
