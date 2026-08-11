# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 前周 findings 解消状況

前周 4 件の findings を全件確認した。

| 前周 finding | 状態 |
|---|---|
| T-06（統合テスト）が存在しない | ✅ 解消 — tasks.md に T-06 が追加されている |
| Open Questions が未確定（N=40 / 200ms） | ✅ 解消 — design.md の Open Questions セクションで両値が "operator-confirmed" として確定 |
| spawn 失敗の Scenario が存在しない | ✅ 解消 — spec.md に "Scenario: spawn failure does not hang the parent" が追加されている |
| resume.ts:291 参照が liveness sidecar の更新を誤記 | ⚠️ 未解消 — spec-fixer-deferred として design.md にコメントで記録済み（request.md は spec-fixer の書き込みパス外） |

### コード参照の実地検証

以下の全行参照を Read tool で実際のファイル内容と照合した。

| 参照 | 検証結果 |
|---|---|
| `src/core/command/detach.ts:105-130` (detachSelf) | ✅ 正確 — L105 が関数宣言、L130 が閉じ括弧 |
| `src/cli/command-registry.ts:427-442` (run detach branch) | ✅ 正確 |
| `src/cli/command-registry.ts:696-711` (resume detach branch) | ✅ 正確 |
| `src/cli/command-registry.ts:84/91/116/231-232` (help 文言) | ✅ 正確 — 全行が "即座に return" の変種を含む |
| `src/cli/job-wait.ts:141-143` (default deps) | ✅ 正確 — `notFoundRetryCount: 5`, `notFoundRetryIntervalMs: 2000` |
| `src/cli/job-wait.ts:180-193` (not-found retry loop) | ✅ 正確 |
| `src/util/paths.ts:301` (livenessJsonPath) | ✅ 正確 |
| `src/core/resume/safety.ts:13-24` (isProcessAlive) | ✅ 正確 |
| `src/core/runtime/workspace-materializer.ts:114-117/149/177` | ✅ 正確（resume-recreated / attach / new-run の sidecar 書き込み） |
| `src/core/runtime/local.ts:369-376` (no-worktree sidecar) | ✅ 正確 |
| `src/core/runtime/local.ts:1432-1433` (writeLivenessSidecar シグネチャ) | ✅ 正確 — `pid: number \| null = process.pid` のデフォルト確認 |
| `src/core/command/resume.ts:291` (transitionJob) | ⚠️ 誤記（詳細は Findings 参照） |

### 設計の正しさ検証（D1〜D7）

- **D1（sidecar pid identity）**: `writeLivenessSidecar` は `pid = process.pid` をデフォルトとし、子プロセスが自分の pid で上書きする。resume-existing では workspace-materializer.ts:91、resume-recreated では :117 で sidecar が更新される。スタール sidecar（前回実行の dead pid）と子 pid は一致しないため、stale を ack と誤認しない。✅ 設計正しい。
- **D2（exit event、zombie 回避）**: 現行 `spawnBackground` は `proc.unref()` を呼ぶが、`exit` リスナー追加後も親が生存中はイベントが発火する（setTimeout が event loop を生かす）。`isProcessAlive` ではなく `exit` イベントを使う理由（zombie + kill(pid,0) の誤検知）は正確。✅
- **D3（登録優先の順序）**: sidecar は disk に残るため、子が登録後即死しても次 tick で成功と判定できる。✅
- **D4（N=40 tail）**: 確定値として design.md に固定済み。✅
- **D5（deps injection）**: `JobWaitDeps` スタイルと対称。`makeSpawnSpy` で spawn が同期呼び出しであることを確認済み。✅
- **D6（job wait hint）**: job-wait.ts:190-193 のパスに hint を追記する設計、retry 窓変更なし。✅
- **D7（単一定義の failure text）**: `buildDetachStartFailure` export、output-contract テストで pin。✅

### spec.md 要件カバレッジ確認

request.md の要件 1〜6 と受け入れ基準を spec.md の Requirement / Scenario と突合した。

| 要件 | spec.md カバレッジ |
|---|---|
| 親が登録完了 or 子死亡まで exit しない | ✅ Req 1 + 3 Scenario |
| exit 0 は発見可能状態を保証 | ✅ Req 2 + 2 Scenario（job wait 直後・resume stale sidecar） |
| 失敗伝播（log tail + フルパス） | ✅ Req 3 の Scenario 含む |
| job wait hint | ✅ Req 4 |
| help 文言・単一定義 | ✅ Req 5 |
| foreground/子の不変条件 | ✅ Req 6 |

### tasks.md タスク完全性確認

T-01（onExit seam）→ T-02（async detachSelf）→ T-03（wire + help）→ T-04（hint）→ T-05（既存テスト更新）→ T-06（統合テスト）の 6 タスクが揃い、受け入れ基準が各タスクに対応している。

T-05 が `detach.test.ts`（request.md の受け入れ基準に名指しなし）を明示的にカバーする根拠（design Risk "Test-scope gap"）が design.md に記載済みで、タスクとの整合が取れている。

### セキュリティ確認

- **スラグ経路のパストラバーサル**: SLUG_REGEX（`/^[a-z0-9][a-z0-9-]{0,63}$/`）が `detachSelf` 呼び出し前に適用されており、スラッシュ・ドット等は不可能。✅
- **detach log の読み戻し**: `getDetachLogPath(repoRoot, slug)` はバリデーション済みスラグから決定論的に構築。stderr への転記に対してサニタイズ不要（ターミナル制御コードのリスクは CLI ユーザー自身のファイルに限定）。✅
- **OWASP Top 10 適用箇所**: A01（権限昇格）・A03（インジェクション）・A05（設定ミス）いずれも該当なし。

## 検証できなかった項目

- `writeLivenessSidecar` が呼ばれる前に state.json が確実に書かれるという ordering 保証については、各 case 文内のコード順（await 直列）を確認したが、ファイルシステム fsync 保証の有無は確認していない（既存 codebase と同水準の信頼で足りる）。
- no-worktree + resume の組み合わせでの sidecar 書き込みパス（local.ts の resume 分岐）は深く追跡していないが、D1 の pid identity 基準は worktree mode に依存しない。

## Findings 詳細

### F-01: request.md の resume.ts:291 参照が liveness sidecar の更新を誤記している（前周から継続）

**severity**: low  
**resolution**: decision-needed

`request.md` の現状コードの前提セクションに: 「resume 子は pid を自身のものに更新して persist する（`src/core/command/resume.ts:291`）」とある。

実際: `resume.ts:291` の `transitionJob` は `state.json` の `pid` フィールドを更新する呼び出しである。liveness sidecar の pid 更新は `workspace-materializer.ts:91`（resume-existing case）および `:117`（resume-recreated case）で行われる。

design.md の `spec-fixer-deferred` コメントがこの誤記を認識し、正確な参照先を提示している。設計の correctness（D1）は design.md が正しく記述しているため実装への影響はないが、request.md の背景記述として誤りが残る。

**選択肢**:
- Option A: request.md を手動で修正し、`resume.ts:291` の説明を「state.json の pid フィールド更新」と訂正し、sidecar 更新の正確な場所（workspace-materializer.ts:91/:117）を追記する。
- Option B: request.md は背景コンテキストであり、design.md が正確な記述を持つため現状のまま許容する（実装 correctness に影響なし）。
