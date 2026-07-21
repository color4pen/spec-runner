# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 現状コードの事実確認

| 主張 | 検証結果 |
|------|---------|
| `src/state/lifecycle.ts:39` — `awaiting-archive` の遷移先は `{archived, canceled}` のみ | ✓ 確認済み。`VALID_TRANSITIONS` に `running` は存在しない |
| `canTransition("awaiting-archive", "running")` は `false` を返す | ✓ 確認済み。`canTransition` は `VALID_TRANSITIONS` のみ参照 |
| `ResumeCommand.prepare()` は `canTransition(state.status, "running")` で guard する | ✓ 確認済み（`resume.ts:155`） |
| 証跡ファイルは iteration 別（`*-result-NNN.md`）と append-only `events.jsonl` | ✓ 確認済み。`appendEventRecord` は `fs.appendFile` のみ使用 |
| `pr-create` は OPEN PR を `existing-open` で返す（idempotent） | ✓ 確認済み（`runner.ts` の D2 コメントとコード） |
| `selectPendingMembers` の `approvedAtCommit` 照合は fail-closed（commitOid 欠落は pending 扱い） | ✓ 確認済み（`reviewer-status.ts:119`） |
| `conformanceApprovedForVerifiedRevision` は commitOid 照合で fail-closed | ✓ 確認済み（`reverification.ts:108`） |
| `FoldResult` の ENOENT hand-built literal が `job-journal.ts:148` に存在 | ✓ 確認済み。`operatorEvents: []` の追加が必要な箇所 |
| `state.pullRequest?.number` と `state.repository.owner/name` のフィールドパス | ✓ 確認済み（`schema/types.ts`） |
| `GitHubClient.getPullRequest(owner, repo, prNumber)` が存在し `state: string` を返す | ✓ 確認済み（`kernel/github-client.ts:121`） |
| `resolveResumeStep` は `from` が defined の場合 allowed step set で検証 | ✓ 確認済み（`resolve-step.ts:85`） |
| `buildAllowedStepSet` は custom reviewer 動的名を含む | ✓ 確認済み（`resolve-step.ts:18`） |
| `flag-parser.ts` は `values` 制約を厳格に検証（FlagParseError） | ✓ 確認済み（`flag-parser.ts:117`） |
| `CommandRunner.PrepareResult` に `repoRoot` フィールドが存在 | ✓ 確認済み（`runner.ts:64`） |
| `JobJournal.appendLineage` が `appendOperatorEvent` のモデルとして存在 | ✓ 確認済み（`job-journal.ts:228`） |
| `job ls` の `githubClient = null` パターンが token 不在の fail-closed を実現 | ✓ 確認済み（`command-registry.ts:470`） |

### 設計判断の検証

- **D2（FSM opt-in edge）**: optional 4th parameter `opts?: { allowReopen?: boolean }` は既存呼び出し元への影響ゼロ。`canTransition` を変更しないため resume は引き続き拒否される。
- **D3（PR gate fail-closed）**: `GitHubClient` 不在の場合はコンストラクタ外で `null` を渡して PR gate が fail-closed になる設計は `job ps` の実装パターンと整合。
- **D4（証跡保存）**: patch フィールドを明示（`error/resumePoint/mainCheckoutDrift/pid` のみクリア）。`steps/reviewerStatuses/decisions/biteEvidence` は不変。
- **D5（承認失効）**: `commitOid` 照合による自動失効は、fix-forward（HEAD 前進）の主ユースケースで正しく機能することをコードで確認。
- **D6（operator event）**: `appendEventRecord` が union 型を受け取り、`fold()` の unknown type silent ignore が forward-compat を担保。`OperatorEventRecord` を union に追加すれば `appendEventRecord` は自動で受け付ける。
- **D8（runtime 非依存）**: reopen コマンド本体の契約（遷移・journal 記録・PR gate）はランタイムに依存しない。

### 受け入れ基準との対応確認

| AC | 対応タスク | 状況 |
|---|---|---|
| awaiting-archive → reopen → 証跡が追加のみ | T-07 | タスク記述が十分 |
| merged PR / archived / canceled の拒否 | T-08 | PR absent / query 失敗の fail-closed も対象に含む |
| operator event（reason 含む）の journal 記録 | T-09 | T-02 の fold 拡張と連動 |
| revision binding 再束縛（stale 承認不使用） | T-06 | F-02 参照（managed 経路を名指し追記推奨） |
| job resume 経由の拒否継続 | T-10 | `canTransition` 無変更で保証 |
| typecheck && test が green | T-11 | 実行検証は対象外（スコープ外） |

### セキュリティ観点

- **`--reason` 入力**: JSON.stringify により特殊文字はエスケープされる。agent prompt への注入経路なし。
- **`--from` 入力**: `buildAllowedStepSet` + `resolveResumeStep` でホワイトリスト検証。path traversal なし。
- **PR state gate**: token 不在・API エラーともに fail-closed。
- **worktree guard**: `detectSpecrunnerWorktree` による guard が `prepare()` 内で機能。`guardedSubcommands` に追加することで dispatch レベルでも二重保護。
- **状態改ざん**: `transitionJob` の opt-in edge は `allowReopen: true` を明示した呼び出し元のみ有効。既存の `canTransition` consumer には影響なし。
- **OWASP A03（Injection）**: 入力は全て JSON シリアライズ経由で journal に記録。injection 経路なし。

## 検証できなかった項目

- **managed runtime の `captureHeadSha` 実装**: managed adapter が null を返すかどうかは実装コードを確認していない（F-02 に関連）
- **`bun run typecheck / test` の実際の実行**: ランタイム環境でのビルド検証は対象外
- **`resume --from my-reviewer` の実際の挙動**: flag-parser の values 制約が custom reviewer 名を既存の resume コマンドで拒否しているかどうかは実動作未確認（コード上は FlagParseError が上がるはず。これは既存の既知制限であり今回の範囲外）

## Findings 詳細

### F-01: CLOSED PR の扱い — design.md が spec-review の明示確認を要求している

**severity**: medium  
**resolution**: decision-needed  
**対象**: `design.md` 末尾の Open Questions セクション

Design D3 の末尾（"Open Questions" セクション）にこう記されている:

> "CLOSED-but-unmerged PR: D3 rejects it (aligned with pr-create's OPEN-only reuse). If spec-review judges that a closed PR should instead be re-opened on GitHub as part of reopen, that is a larger scope and should be a separate change. **Flagged for spec-review confirmation.**"

design.md 自身が spec-review の判断を明示的に求めている。現在の `spec.md` には CLOSED PR 拒否のシナリオが記載されているが、それが「意図的な設計決定として確定した」旨の明文化がない。

**選択肢**:

| ラベル | 帰結 |
|--------|------|
| CLOSED PR 拒否を正規設計として確定する | 現設計踏襲。pr-create の OPEN-only 契約と整合。GitHub 側 PR 再オープン API 呼び出し不要。spec.md の CLOSED シナリオを "by design, separate change" として明記する。 |
| CLOSED PR を GitHub API で再オープンして reopen を許可する | スコープ追加。`GitHubClient` に PR 再オープン API 追加、D3 拡張、テスト追加が必要。今回の request 範囲外。 |

---

### F-02: T-06 の調査スコープに managed runtime の revision binding 経路が明示されていない

**severity**: low  
**resolution**: fixable  
**対象**: `tasks.md` T-06（L151 付近）

T-06 は「any path can reuse a pre-reopen approval on a *new* revision」を調査せよと指示しているが、最も疑わしい経路を名指ししていない。

`parallel-review-round.ts:110-114`:
```typescript
let baselineCommit: string | null = null;
if (deps.runtimeStrategy) {
  baselineCommit = await deps.runtimeStrategy.captureHeadSha(cwd);
```

managed runtime で `captureHeadSha` が `null` を返すと、`selectPendingMembers(statuses, members, null)` は revision check を無効化し、approved メンバーを commitOid 照合なしで skip する（`reviewer-status.ts:111-113`）。HEAD が前進していても stale 承認が再利用される可能性がある。

既存コードに「parallel custom reviewer managed support is a known limitation (Non-Goal)」という注記があり、この挙動が意図的な制約である可能性は高い。ただし T-06 の written note がこの経路を明示的に確認・除外する形で記録するよう指示されていないため、実装者が見落とすリスクがある。

**修正案**: T-06 の調査リストに「managed runtime で `captureHeadSha` が null を返すケース（`selectPendingMembers` の revision check 無効化）が既存の Non-Goal 扱いと整合しているか確認し、written note に記録する」を追記する。

---

### F-03: T-03 に `appendOperatorEvent` 失敗時の error handling が記述されていない

**severity**: low  
**resolution**: fixable  
**対象**: `tasks.md` T-03 の operator event 追記箇所（L87 付近）

T-03 は:
> "Append the operator event **before** persisting the transition"

と指定しているが、`fs.appendFile` ベースの journal write が throw した場合（ディスクフル、パーミッションエラー等）の挙動を明示していない。resume の state 遷移は try/catch で `PrepareError(1, ...)` に変換している（`resume.ts:201-221`）。`appendOperatorEvent` のエラーも同様に明示的に処理しないと、uncaught exception として `execute()` に到達し `exitCode` なしで処理される可能性がある。

**修正案**: T-03 に「`appendOperatorEvent` が throw した場合は `logError` + `throw new PrepareError(1, ...)` で中断する（遷移は実行しない）」を追記する。

---

### F-04: T-03 の options インターフェース定義に `githubClient` が含まれていない

**severity**: low  
**resolution**: fixable  
**対象**: `tasks.md` T-03 冒頭の options 定義（L57 付近）

T-03 は `ReopenCommand` の options を:
> "`{ from: string; reason: string; logLevel?; cwd?; json?; noWorktree?; repoRoot? }`"

と定義しているが、T-04 は「`GitHubClient` を pass into `ReopenCommand` (via options or constructor)」と指定している。T-03 の型定義から `githubClient` が省略されているため、T-03 だけを読んだ実装者が型定義から client フィールドを漏らすリスクがある。

**修正案**: T-03 の options 型に `githubClient?: GitHubClient | null` を追記する（T-04 との整合）。

---

### Observation: 同一 revision での reopen（コード変更なし）は stale 承認を再利用する挙動

**severity**: low  
**対象**: `design.md` Risks/Trade-offs セクション（L276 付近）

Design の "Risks / Trade-offs" セクションにて、「同一 revision での reopen（fix-forward せず同じ commit からやり直し）は pre-reopen 承認が有効のまま流用される」を「correct, not a defect」と明記している。T-06 のテストは新 revision ケース（`oldSha ≠ newSha`）のみをカバーしている。

この挙動は既存の `selectPendingMembers` のテストでカバー済みであるため blocking ではない。ただし T-06 の written note に「同一 commit での reopen では reviewer が skip されることが意図通りであることを確認した」旨を含めると、将来の読者への明示的な記録となる。
