# Code Review Feedback — iteration 002

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### diff 範囲と iteration 001 との差分

`git diff main...HEAD --stat` で 26 ファイル変更。
実装ファイル（`workspace-materializer.ts` / `local.ts` / `managed.ts`）は iteration 001 で承認済み。
iteration 002 での追加差分は operator commit a20d10098 で適用した R2 テストを含む
`tests/unit/core/runtime/bootstrap-egress-ledger-wm.test.ts`。

### 実装 3 経路（iteration 001 からの変更なし確認）

| ファイル | 行 | 内容 | 状態 |
|---------|-----|------|------|
| `workspace-materializer.ts` | 226–242 | rev-parse + appendSynthesizedCommit + fail-closed cleanup | ✅ 変更なし |
| `local.ts` | 414–428 | rev-parse + appendSynthesizedCommit、直接 throw | ✅ 変更なし |
| `managed.ts` | 244–257 | rev-parse + appendSynthesizedCommit（push より前） | ✅ 変更なし |

import 追加も 3 ファイルとも正しく存在する（`appendSynthesizedCommit from "../../state/schema/operations.js"`）。

### R2 テストの詳細検証

**対象**: `tests/unit/core/runtime/bootstrap-egress-ledger-wm.test.ts`
`describe("R2: updateJobState (ledger persistence) failure aborts bootstrap")`

モックの構成:
```typescript
// First updateJobState call is the ledger append — fail it.
updateJobState: vi.fn().mockRejectedValue(new Error("ledger persistence failed")),
```

`workspace-materializer.ts` new-run アームでの `updateJobState` 呼び出し順を追跡:

| 順序 | 行 | 内容 | requestFilePath ガード |
|------|-----|------|----------------------|
| 1 | 176 | `worktreePath` 記録 | **外**（常に実行） |
| 2 | 208–211 | `request.path` 更新 | 内 |
| 3 | 238–242 | `appendSynthesizedCommit`（台帳追記） | 内 |

全呼び出しを一律 reject するモックのため、テストは呼び出し 1（`worktreePath` 更新、line 176）で
abort し、呼び出し 3（台帳追記）には到達しない。

コメント「First updateJobState call is the ledger append」は事実と異なる（第 1 呼び出しは
`worktreePath` 更新、台帳追記は第 3 呼び出し）。

また、呼び出し 3 のみを `.catch(() => {})` で囲む改変を行っても本テストは green のまま
（呼び出し 1 が先に abort するため）。台帳永続化失敗を名指しした destruction coverage として
精確ではない。

**実装への影響**: なし。実装コードに `.catch()` は存在せず、台帳追記の失敗は自然に伝播する。

### 受け入れ基準の充足確認

| 基準 | 証拠 | 状態 |
|---|---|---|
| 3 経路で bootstrap OID を synthesizedCommits に記録するテスト | TC-001 (wm) / TC-002 (local) / TC-003 (managed) | ✅ |
| 手動 seed なし実 git bootstrap → 初回 push で EGRESS_UNKNOWN_COMMIT 未発生 | TC-007 (e2e, 実 git repo) | ✅ |
| rev-parse 失敗の注入で bootstrap が失敗する | TC-004 / TC-005 / TC-006 | ✅ |
| 修正前の挙動に戻すと該当テストが fail する破壊確認 | TC-008 (ledger から bootstrapOid 除外 → EGRESS_UNKNOWN_COMMIT) + 各ユニットの RED コメント | ✅ |
| 既存 egress/合成/revision 束縛テストは無改変で green | diff で当該ファイルへの変更なし確認、test 8944 件 passed | ✅ |
| typecheck && test が green | verification-result.md: build/typecheck/test/lint 全 phase passed | ✅ |

### スコープ外の不変条件

- `runInlineEgressCheck` / `verifyEgressLedger` の変更なし ✅
- publish-range 計算（`rev-list HEAD --not --remotes=origin`）の厳密形を維持 ✅
- managed.ts: `appendSynthesizedCommit` は `git push origin <branchName>` より前（line 254 < line 260）✅

## 検証できなかった項目

None — 全受け入れ基準の証跡をコードとテストで確認した。

## Findings 詳細

### F-001 (LOW): R2 テストのコメントが誤りで台帳永続化失敗の destruction coverage が不完全

- **ファイル**: `tests/unit/core/runtime/bootstrap-egress-ledger-wm.test.ts`
- **行**: R2 describe ブロック内のモック定義コメント
- **問題**:
  - コメント「First updateJobState call is the ledger append」が誤り。
    new-run アームでの第 1 呼び出しは `worktreePath` 更新（line 176）であり、
    台帳追記（`appendSynthesizedCommit`）は第 3 呼び出し（lines 238–242）。
  - 全呼び出しを一律 reject するモックのため、テストは第 1 呼び出しで abort し
    台帳追記の呼び出しに到達しない。呼び出し 3 のみに `.catch(() => {})` を追加する
    改変を検出できない（第 1 呼び出しが先に失敗するため本テストは green のまま）。
- **実装の正しさ**: 影響なし。コードに `.catch()` は存在せず、実装は正しく fail-closed。
- **修正方針**: 第 1・第 2 呼び出しを成功させ、第 3 呼び出し（台帳追記）のみ reject する
  呼び出し順感応モックに変更し、コメントを修正する。
  例: `vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error(...))`
