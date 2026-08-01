# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだファイル

- `specrunner/changes/slug-occupancy-enforcement/request.md` — 背景・要件・受け入れ基準
- `specrunner/changes/slug-occupancy-enforcement/design.md` — 設計判断 D1–D11・Risks・Open Questions
- `specrunner/changes/slug-occupancy-enforcement/spec.md` — 要件仕様・各 Scenario
- `specrunner/changes/slug-occupancy-enforcement/tasks.md` — T-01〜T-13 実装タスク

### 現状コードとの照合（request.md の前提を実測で確認）

| 前提 | 検証結果 |
|---|---|
| `duplicate-slug-guard.ts:40-84` pid-only fail-open | ✅ 確認。pid が死亡・sidecar 欠落・JSON 破損いずれも return（allow） |
| `resolve-job.ts:18-35` updatedAt 最新選択・status 無視 | ✅ 確認。`includeArchived: true` で全 state を取り updatedAt ソート |
| `cancel/runner.ts:423-431` managed marker 無条件 unlink | ✅ 確認。jobId 一致チェック無し |
| `cancel/runner.ts:437-459` `--purge` 無条件 rm | ✅ 確認。slugForMarker を rm -rf するだけ |
| `local.ts:1423-1434` sidecar 無条件上書き | ✅ 確認。mkdir + writeFile のみ |
| `progress.ts:162-166` onPipelineComplete ペイロード無視 | ✅ 確認。`_p: unknown` で archive hint を固定印字 |
| `pipeline.ts:145-148` halt でも `pipeline:complete` 発火 | ✅ 確認。`await this.runInternal(...)` 後に emit |
| `event/types.ts` `pipeline:complete` payload `{ state: JobState }` | ✅ 確認 |
| `pipeline-run.ts:125` assertNoDuplicateLiveJob は bootstrapJob の前 | ✅ 確認 |
| `managed.ts:595-597` assertNoDuplicateLiveJob が no-op | ✅ 確認 |
| `lifecycle.ts` TERMINAL_STATUSES = `{ archived, canceled }` | ✅ 確認。ACTIVE_STATUSES = `{ running, awaiting-resume }` も確認 |
| `errors.ts` DUPLICATE_LIVE_JOB 既存 | ✅ 確認（ERROR_CODES 行 101） |
| `run-inbox.ts` executeStart → startJob effect | ✅ 確認（行 391-396）、postRejectComment seam も確認 |
| `local-job-index.ts` slug あたり sidecar 1 枚索引 | ✅ 確認 |

### 設計整合性の確認

- **D1（preflight 位置）**: assertNoDuplicateLiveJob → bootstrapJob の前。状態・worktree・branch・sidecar を作る前に throw する位置として正しい。
- **D2（occupancy module）**: `src/core/occupancy/` 単一オーナーでガード・resolver・claim・doctor が同じスキャンを共有する設計は "emergent invariant needs a single owner" 原則に合致する。
- **D3（non-terminal の定義）**: `!TERMINAL_STATUSES.has(status)` = `{ running, awaiting-resume, awaiting-archive, failed, terminated }`。ACTIVE_STATUSES より広い。`awaiting-archive`・`failed`・`terminated` を含む意図は ADR-20260801 に帰属させており、breaking change としての理由が明記されている。
- **D4（fail-closed）**: `JobStateStore.list` が per-entry parse failure を黙って飲み込むことを確認し、その上でスラグスコープの独自スキャンを導入する設計判断は正しい。ENOENT ≠ unreadable の区別も正しい。
- **D5（return type 維持）**: `Promise<JobState | null>` を維持して throw は breach のみ。既存の `mockResolvedValue` 呼び出しへの波及を抑える判断は合理的。
- **D6（check-and-claim）**: O_EXCL のみ却下の理由（旧バージョン残置 sidecar で全 start が弾かれる）が ADR-20260801 で評価済み。正しい判断。
- **D7（doctor）**: read-only の detect と別途 `repairSlugOccupancySidecar` コア関数を分離する設計は既存の `orphan-sidecars` パターンに整合。
- **D10（inbox pre-check）**: `runRunCore` がガードの throw を exit code 1 に飲み込む実装を確認。inbox 内での独自 pre-check が必要である根拠が正しい。

### セキュリティ観点

- **パストラバーサル**: slug は `SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/` で既存コード（`request-new.ts:24`・`command-registry.ts:417`）が検証しており、`../` や絶対パスは入らない。T-08 の `doctor repair <slug>` CLI も同 regex で検証すべきであるが、T-08 タスクに明示がない（低リスク・fixable として指摘）。
- **Fail-closed**: state 読取不能→拒否は正しいセキュリティ姿勢。従来の fail-open（破損→通過）より堅固。
- **コメントインジェクション**: inbox reject comment に jobId（UUID）と status（enum）を埋め込む設計。マークダウンインジェクション不可。
- **冪等マーカー**: dedup marker は jobId を encode。UUID のため injection 不可。

### 受け入れ基準とタスクの対応

- シナリオ歯（E2E）: T-11 が担当 ✅
- guard 単体テスト: T-03 が担当 ✅
- cancel テスト: T-05 が担当 ✅
- 解決テスト: T-06 が担当 ✅
- doctor テスト（検出・修復・複数 non-terminal）: T-07 + T-08 が担当 ✅
- Next 案内テスト: T-09 が担当 ✅
- 既存テスト期待値変更（許容分）: T-13 が担当 ✅
- divergence entry の解消: T-12 が担当 ✅

## 検証できなかった項目

- `architecture/adr/2026-08-01-slug-occupancy-and-attempt-identity.md` の内容（本 worktree に存在せず、out-of-loop architecture/ は CODEOWNERS 範囲）。ただし request.md・design.md に ADR の結論が転記されており、設計判断の根拠として参照できる。
- `src/core/command/resume.ts:105` / `src/core/command/reopen.ts:113` の既存 catch が ambiguous throw を surface するかの詳細確認（design.md D5 では「generic catch will surface the message, which is acceptable」と評価済み。深読みは省略）。

## Findings 詳細

### F-01: T-09 — onPipelineComplete のフォールバックケース未定義

`spec.md` は `awaiting-archive` と `awaiting-resume` の 2 分岐のみ規定しており、それ以外のステータス（例: pipeline が `failed` で完了するような将来の拡張、または予期しない状態）に対する動作を定義していない。実装者が `if/else if` のみで書いた場合、どのメッセージも印字されないか、誤ったデフォルトが入るリスクがある。`else { /* no guidance */ }` を明示するか、unknownステータス向けのフォールバックメッセージを spec に追記すべき。

### F-02: T-08 — `doctor repair <slug>` CLI における slug 入力検証の明示なし

T-08 は CLI エントリを「`specrunner doctor repair <slug>`（推奨）」と定めているが、slug 引数の SLUG_REGEX バリデーションを明示していない。既存 CLI コマンドは `SLUG_REGEX.test(input)` で検証しているが、T-08 タスクにこの要件が書かれていないと実装者が省略するリスクがある。低リスク（既存パターンに習えば自然に入る）だが、タスクに一行追記すると安全。

### F-03: design.md Open Question — doctor check severity 未解決

design.md の Open Question に「`warn` vs `fail`」を spec-review で確認するよう明記されている。確認結果: **`warn` を採用**。理由:
- 既存 storage check（`orphan-sidecars`・`orphan-worktrees`・`journal-integrity`）はすべて `warn` / `required: false`
- 修復口（doctor repair）と手動 cancel 出口が存在するため `fail` による強制ブロックは不要
- `specrunner doctor` を CI ヘルスチェックに使っているプロジェクトで既存 breach 断面が exit 1 を引き起こすと運用を壊す
  
この finding は decision-needed ではなく確認済みの推奨として記録する。

### F-04: cancelAllTerminated のコラテラル削除（design.md Open Question）

`cancel/runner.ts:516-527` の `cancelAllTerminated` は `failed`/`terminated`/`canceled` ジョブ（`BULK_CLEANUP_STATUSES`）の slug ディレクトリを jobId 一致チェックなしに rm -rf する。`failed`・`terminated` は R1 の新モデルでは non-terminal 扱いとなるため、不変条件が破れた断面（non-terminal 複数）では、`cancelAllTerminated` が live な non-terminal job の sidecar を消す可能性がある。design.md は「candidate follow-up」として明示的にスコープ外と宣言しており、本 request の要件 R3 は single-job cancel のみ対象としている。観測として記録するが、実装者はこの collateral を意識して修復シナリオのテストケース（T-11）に含めないこと。

### F-05: T-10 inbox pre-check — コメントフェッチの範囲と dedup の前提

T-10 の dedup は `commentsByIssue` に当該 issue のコメントが格納されていることを前提とする。`commentsByIssue` は `awaiting-resume` + issueNumber 有り job（`awaitingWithIssue`）と unlinkd approved issues（`unlinkedApprovedIssues`）のコメントのみフェッチする（`run-inbox.ts:105-127`）。占有ジョブが `running` かつ同 issue に linked されている場合、`awaitingWithIssue` にも `unlinkedApprovedIssues` にも入らずコメントフェッチされないため、dedup が機能しないエッジケースが存在する。ただし、この状況では planner も新規 `start` をプランしない可能性が高く、pre-check に到達しないと考えられる。T-10 タスクはこのエッジケースに言及していない。実装者は「allJobStates から non-terminal をフィルタして pre-check する」方式（タスクの代替案）を採用する場合、コメントフェッチ不足の dedup ミスに注意すること。
