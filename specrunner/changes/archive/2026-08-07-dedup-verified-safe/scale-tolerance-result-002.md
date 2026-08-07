# Scale-Tolerance Review — dedup-verified-safe — iter 002

**Reviewer**: scale-tolerance  
**Purpose**: 時間とともに件数が単調増加する対象（archive・sidecar・issue/PR・コメント・journal）に対して、走査・ロード・API 呼び出しのコストが比例して成長するコードを、merge 前に検出する。

---

## Delta from iter 001

iter 001 以降の実装変更（operator fix + code-review 指摘対応）：

| 変更 | 内容 | スケール影響 |
|------|------|------------|
| `src/store/job-journal.ts` line 19 comment fix | `job-state-projection.ts` への stale 参照を削除（コメントのみ） | なし |
| `src/core/step/io-iteration.ts` JSDoc fix | 削除済み `computeCodeReviewIteration` の参照を JSDoc から削除（コメントのみ） | なし |
| `specrunner/changes/dedup-verified-safe/design.md` D8 更新 | `enrichContext` 意図的残置を明記（ドキュメントのみ） | なし |
| `specrunner/changes/dedup-verified-safe/test-cases.md` TC-016 更新 | 意図的残置の注記追加（ドキュメントのみ） | なし |

いずれもコメント・ドキュメント変更のみ。コードパスの変更なし。

---

## Re-verification of iter 001 Items

| # | 対象 | iter 001 結論 | iter 002 確認 | 変化 |
|---|------|-------------|--------------|------|
| 1 | `job-journal.ts` `_writeAllToJournal` | fresh write 時のみ O(job events) | 変更なし（コメント修正のみ） | なし |
| 2 | `job-journal.ts` `persist()` delta ループ | O(Δevents) 増分書き込み | 変更なし | なし |
| 3 | `job-journal.ts` `fold()` 呼び出し | fast path スキップあり、既存挙動 | 変更なし | なし |
| 4 | `job-journal.ts` `_appendRecord` | `getEventsPath()` は O(1) path.join のみ | コメント修正のみ、実装不変 | なし |
| 5 | `resolve-worktree-path.ts` | sidecar 1 ファイルを 1 回読む O(1) | 変更なし | なし |
| 6 | `config/store.ts` loadConfig 委譲 | O(1) config 0〜2 件読み取り | 変更なし | なし |
| 7 | `runner.ts` `finalizeVerificationRun` | phases 数（〜7 件）のみループ、bounded | 変更なし | なし |
| 8 | `glob-match.ts` RegExp 再コンパイル | 既存挙動、本 change で悪化なし | 変更なし | なし |

---

## 結論

iter 001 → iter 002 の差分はコメント・ドキュメント変更のみ。  
スケール観点の新規リスクは導入されていない。  
iter 001 の全確認項目が引き続きクリア。

**ブロッキング所見: 0 件**
