# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### spec ファイル読了
- `request.md` / `design.md` / `spec.md` / `tasks.md` を全文精読した。

### コード照合
- **3 bootstrap 経路の実装確認**:
  - `workspace-materializer.ts` ~line 212: `git commit -m "add request.md for <slug>"` — OID 捕捉なし、`appendSynthesizedCommit` 呼び出しなし（欠陥確認）
  - `local.ts` ~line 404: 同上（欠陥確認）
  - `managed.ts` ~line 234: 同上（欠陥確認）
- **`appendSynthesizedCommit` の実装確認** (`operations.ts:35`): pure・冪等。`synthesizedCommits ?? []` で後方互換。空配列から初回 OID を追加できる。
- **`verifyEgressLedger` の実装確認** (`commit-push.ts:299`): `git rev-list HEAD --not --remotes=origin` の厳密形を使用。`ledgerSet.has(oid)` で O(1) 照合。未記録 OID → `EGRESS_UNKNOWN_COMMIT` エラー。egress 側は変更なし。
- **`updateJobState` のシグネチャ確認**:
  - `local.ts:180`: `(jobId, mutator, slugOpts)` — tasks.md T-02 コードスニペットと一致
  - `managed.ts:120` (private): `(jobId, mutator)` — `slugOpts` なし。tasks.md T-03 の Note と一致
  - `MaterializerHost` インターフェース: `(jobId, mutator, slugOpts)` — tasks.md T-01 コードスニペットと一致
- **workspace-materializer の cleanup パターン確認** (line 219–222): `manager.remove(...).catch(() => {})` → `manager.prune(...).catch(() => {})` → `throw`. tasks.md T-01 の rev-parse 失敗時クリーンアップパターンと完全一致。
- **managed.ts の push 前への挿入位置確認** (line 244 付近): `git push origin <branchName>` の直前。tasks.md T-03 の Verify 条件「BEFORE the git push block」と一致。rev-parse 失敗時は throw → push は呼ばれない (D2 fail-closed)。
- **`WorkspaceOptions` の確認**: `requestFilePath?: string` / `bootstrapState?: JobState` が存在。tasks.md T-04 の `materialize()` 呼び出しシグネチャと一致。
- **`EGRESS_UNKNOWN_COMMIT` の確認** (`errors.ts:110`): 定義済み。
- **既存テストの seed パターン確認**: `test-materialize-boundary.test.ts:913` が `rev-list HEAD` で `synthesizedCommits` を seed。design.md Risk 節の説明「bootstrap 由来でない歴史を持つ repo の表現」と整合している。

### 受け入れ基準と tasks の対応確認
| 受け入れ基準 | カバー tasks |
|---|---|
| 3 経路で OID が synthesizedCommits に記録される | T-01/02/03 + T-04 TC-BE-001, T-05 TC-BE-002, T-06 TC-BE-003 |
| 手動 seed なし bootstrap → 初回 push egress pass | T-07 TC-BE-005a |
| rev-parse 失敗 → bootstrap 失敗 | T-04 TC-BE-004a, T-05 TC-BE-004b, T-06 TC-BE-004c |
| 修正前の挙動に戻すと fail（破壊確認） | T-07 TC-BE-005b |
| 既存テスト無改変 green | T-08 |
| typecheck && test green | T-08 |

### セキュリティ検討
- OID 捕捉は自プロセスが作った commit への `git rev-parse HEAD` であり、外部入力は関与しない。
- state ファイルへの書込みは既存の `updateJobState` パスを経由する（新規の永続化経路を追加しない）。
- OWASP Top 10 に該当する変更点なし（認証・入力バリデーション・権限・注入のいずれも非該当）。

## 検証できなかった項目

None。コードベースへのアクセスがあり、全参照ファイルの内容を確認できた。

## Findings 詳細

### LOW: T-04 TC-BE-001 テスト仕様で requestFilePath ファイルの存在前提が未明示

**対象**: `tasks.md` T-04 TC-BE-001

`WorkspaceMaterializer.materialize()` の `new-run` アームは `opts.requestFilePath` を受け取ると、`rejectSymlink(opts.requestFilePath)` および `fs.cp(opts.requestFilePath, changeFolderRequestPath)` を呼ぶ（`workspace-materializer.ts:183–184`）。これらは実 fs 操作であり、`/tmp/request.md` が存在しない場合は例外が発生する。

T-04 は `requestFilePath: "/tmp/request.md"` を指定するが、テスト仕様にこのファイルを `beforeEach` で作成する指示がない。実装者は `$TMPDIR` 配下に一時ファイルを作成するか、モックを追加する必要があるが、tasks.md にはその旨の記載がない。

影響: 実装時に即座に発覚して対処できる軽微な仕様漏れ。テストの設計方針（実 fs か fs モックか）に迷いが生じる可能性がある。ブロッカーではない。
