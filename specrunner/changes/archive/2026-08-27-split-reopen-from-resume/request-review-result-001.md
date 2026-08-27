# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### 1. コードアサーション確認（Code Assertion Fact-Check）

以下のアサーションをすべて実コードと照合した。

| # | 主張 | 参照先 | 結果 |
|---|------|--------|------|
| A1 | `ReopenCommand` が `CommandRunner` を継承する | `src/core/command/reopen.ts:69` | ✅ 確認 |
| A2 | `ReopenOptions` に `--prompt`/`--adoptCommits`/`--applyCanon`/`--wontfix` がない | `src/core/command/reopen.ts:39-52` | ✅ 確認 |
| A3 | `prepare()` が `resumePrompt: undefined` を返す | `src/core/command/reopen.ts:328` | ✅ 確認 |
| A4 | `resume` が `--prompt`/`--adopt-commits`/`--apply-canon`/`--wontfix` を持つ | `src/core/command/resume.ts:41-57` | ✅ 確認 |
| A5 | `reopen.prepare()` に `detectCanonDirtyPaths` の呼び出しがない（dirty state 無検査） | `src/core/command/reopen.ts` 全体 | ✅ 確認 |
| A6 | Actions workflow の reopen アクションが `job reopen` のみを実行し `job resume` を続けない | `.github/workflows/specrunner-dispatch.yml:241` | ✅ 確認 |
| A7 | `REOPEN_TRANSITIONS` が `awaiting-archive → {running}` を定義する | `src/state/lifecycle.ts:54-56` | ✅ 確認 |
| A8 | B-17 アーキテクチャ不変条件が `{ allowReopen: true }` を `reopen.ts` のみに限定する | `tests/unit/architecture/core-invariants.test.ts:1187-1266` | ✅ 確認 |

### 2. 問題記述の検証

**責務境界の欠陥**:
- `reopen.ts` は `CommandRunner` を継承し `execute()` が pipeline 実行まで担う。`prepare()` で `awaiting-archive → running` に遷移したのち `setupWorkspace`→`buildDeps`→`pipeline.run` が続く（`runner.ts:105-398`）。
- 実行前の ingress safety check（`detectCanonDirtyPaths`/`detectUnadoptedCommits`/`reconcileWorktreeArtifacts`）は `resume.ts:370-529` にのみ存在し、`reopen.ts` にはない。
- `ReopenOptions.from` は step 実行位置の指定（pipeline 実行のための入力）だが、`--prompt`/`--adopt-commits`/`--apply-canon` は持たない。

これは request が述べる「reopen が実行まで所有する一方、resume の実行契約を持っていない」責務境界の欠陥と一致する。

**問題テーブルの検証**:
- "commit 済み・未 push → `EGRESS_UNKNOWN_COMMIT` になり得る": resume の `adoptCommits` gate（resume.ts:470-513）が reopen には存在しないため正確。
- "未 commit の変更 → reopen ingress では検査されず": `detectCanonDirtyPaths` が reopen にないため正確。
- "別環境から PR branch に push → 古い checkout から再実行し得る": fetch/update gate が reopen にないため正確。

### 3. 関連 ADR の確認

`specrunner/adr/2026-07-22-job-reopen-awaiting-archive.md` を確認:
- D1 で「`ReopenCommand` を `CommandRunner` サブクラスとして実装」が採択されており、本 request はこの D1 を変更する。
- 既存 ADR の D2〜D8（REOPEN_TRANSITIONS 分離・PR gate・patch 最小化・証跡不変・journal・worktree 保持・runtime 独立）は新設計でも多くが維持される。
- request の `adr: true` フラグにより adr-gen step で新 ADR が生成され、既存 ADR との関係が正式に記録される。

### 4. アーキテクチャ不変条件への影響確認

**B-17 への影響**:
- 新設計で `awaiting-archive → awaiting-resume` 遷移に `REOPEN_TRANSITIONS` or `VALID_TRANSITIONS` を使うかは設計ステップの判断に委ねられる。
- `allowReopen: true` が不要になる場合は B-17 の更新が必要（requirements 7 でカバー済み）。
- `allowReopen: true` を `awaiting-archive → awaiting-resume` 用として継続する場合は B-17 は維持される。

**`VALID_TRANSITIONS` の現在の制約**:
- `awaiting-archive` の合法遷移は `{archived, canceled}` のみ（lifecycle.ts:39）。
- `awaiting-resume → {running, canceled}` は既存（lifecycle.ts:38）のため、reopen で `awaiting-resume` に遷移した後に `resume` が `running` へ遷移するパスは lifecycle 上で成立する。

### 5. Actions ワークフロー影響

`.github/workflows/specrunner-dispatch.yml` の `reopen` action は現在 `job reopen "$SLUG" --from "$FROM" --reason "$REASON"` のみを実行する（行 241）。新設計では同一 run で `reopen → resume` を compose するか、action を分離する必要がある（requirements 6 でカバー済み）。

### 6. ガイド・ヘルプの影響

`src/core/command/guide.ts:356-366` の escalation guide セクションには:
```
## 3. awaiting-archive からの再開
specrunner job reopen <slug> --from <step> --reason "<理由>"
reopen の制約: --apply-canon / --adopt-commits / --detach / --prompt は使えない。
--from と --reason が必須。
```
この記述は新契約で更新が必要（requirements 7 でカバー済み）。

### 7. 受け入れ基準の検証可能性

各受け入れ基準はいずれも機械的に検証可能な条件として記述されている。

---

## 検証できなかった項目

- GitHub issue #876 / #1066 / #1083 / #629 の参照内容（issue へのアクセス不可）。ただし本質的な検証に必要なコード実態はすべてローカルで確認済み。

---

## Findings 詳細

### 観察事項（findings なし）

指摘すべき blocking issue は検出されなかった。以下は情報として記録する。

**観察 1: 受け入れ基準 1 の `--from` 省略表記**

受け入れ基準の criterion 1 に示すコマンド例（`job reopen <slug> --reason <text>`）では `--from` が存在しない。一方で request 本文 requirement 4 は「互換方針は ADR で決定する」と述べており、若干の記述ズレがある。これは ADR が `--from` を optional/deprecated にする方針を採択すれば解消されるため、design/ADR ステップが判断すれば十分であり blocking ではない。

**観察 2: `pid` フィールドの扱い**

現在の reopen の transition patch には `pid: process.pid` が含まれる（reopen.ts:282）。新設計で reopen が `awaiting-resume` に遷移して即座に exit する場合、この `pid` は即座に stale になる。resume の staleRunning 検出は `status === "running"` の場合のみ機能する（resume.ts:219）ため、`awaiting-resume` 状態での stale pid は問題を起こさない。実装時に `pid: null` へ変更するか否かは実装者が判断すればよい（blocking なし）。

**観察 3: resume 後の `resumePoint` 不在**

reopen が `awaiting-resume` に遷移する際、pipeline 中断時とは異なり `resumePoint` が存在しない。resume は `--from` なしで呼ばれた場合に `state.step`（通常 `pr-create`）へ fallback する（resume.ts:265-273）。これは意図しない step から再開しうるが、受け入れ基準に「`resume --from <step>`」と明示されているため、使用上の制約として対処済みである。blocking なし。
