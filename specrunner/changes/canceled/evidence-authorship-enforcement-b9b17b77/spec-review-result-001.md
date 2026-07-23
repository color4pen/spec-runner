# Spec Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:    specification is complete, consistent, and ready for implementation
  - needs-fix:   specification has issues that must be resolved before implementation
  - escalation:  unresolvable conflicts, missing context, or requires human judgment
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | File | Description | How to Fix
- Valid Severity values (uppercase): CRITICAL | HIGH | MEDIUM | LOW
  - CRITICAL: production outage, data loss, security breach
  - HIGH:     functional failure, clear bug, no workaround — blocks approval
  - MEDIUM:   quality degradation, maintainability issue, future risk
  - LOW:      informational, style, minor improvement
- If no findings, write a table row with "None" or omit the table body.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | Error handling gap | tasks.md T-04 | `commitJournalArtifacts` を executor から呼ぶと記述されているが、失敗時（`commitScopedPaths` が `commitEffectFailedError` を throw）の処理が指定されていない。既存の `finalizeStepArtifacts` 失敗パス（executor.ts L451–458 の `makeCommitFailHalt`）と同等の halt 変換が必要。 | T-04 executor 配線に「`commitJournalArtifacts` が throw した場合は `makeCommitFailHalt` 相当の halt を返す（`finalizeStepArtifacts` エラーハンドリングと同パターン）」を明記する。 |
| 2 | MEDIUM | Lifecycle ambiguity | tasks.md T-03 | 「`LocalRuntime` が single job scope で所有」と書かれているが、`LocalRuntime` 自体はプロセス全体で1インスタンスなので `holder` をインスタンスフィールドに持つと複数ジョブ混在リスクがある。`buildPipelineDeps` の `storeFactory` クロージャで per-workspace 生成が正しい設計だが、tasks に明示がない。 | T-03 に「holder は `buildPipelineDeps` 呼び出し単位（workspace スコープ）で新規生成し `storeFactory` クロージャに閉じ込める。LocalRuntime のインスタンスフィールドに持たない」と追記する。 |
| 3 | LOW | Atomicity not specified | tasks.md T-05 | `restoreJournalToAnchor` は `events.jsonl` と `state.json` を別々に atomic write する（単一 FS トランザクションではない）。2書込の間でクラッシュすると部分復元になるが、次の resume で再び halt → restore で自己回復するため致命的ではない。この accepted behavior がドキュメント化されていない。 | T-05 の `restoreJournalToAnchor` 仕様に「2ファイルを個別 `atomicWriteString` で書く。片方書込後クラッシュでも次 resume が再 halt→restore するため自己回復可」と明記する。 |
| 4 | LOW | Undocumented trade-off | design.md D4 | T3 攻撃（git plumbing による committed-tree 注入）を検出・halt した場合、tampered な agent commit は push 済みのため git history に残る。checkpoint push が authentic な HEAD tip を上書きするため運用上は問題ないが、audit trail に tampered commit が混在することが Risks に記述されていない。 | design.md D4 の Rationale または Risks に「halt 検出後に tampered agent commit が git history に残るが、直後の checkpoint push で authentic tip となり durable anchor も authentic を指す」という accepted posture を一行追加する。 |
| 5 | LOW | Scope boundary not documented | design.md D8 | `exit-guard.ts` は `new JobStateStore` を直接構築（storeFactory 非経由）するため `anchorHolder` が注入されず、書き込む interruption record + state 遷移が in-process anchor に反映されない。結果として signal-exit（SIGTERM）でも crash-resume halt が発生し得るが、これが D8 の accepted posture として対応することが設計文書に明記されていない。 | design.md D8 に「exit-guard が storeFactory 非経由で書く interruption/state 遷移は anchor 外（process 終了時のため anchor 追跡不要）。signal-exit 後の resume も crash-resume halt に該当する（accepted）」を一行追加する。 |

## Architecture / Security Assessment

### 設計整合性

request.md → design.md（D1〜D8）→ spec.md（Requirements/Scenarios）→ tasks.md（T-01〜T-09）の展開が一貫しており、全 T1〜T8 受け入れ基準が 1 対 1 でタスクに対応している。スコープ外（sandbox follow-up・#464 denylist）は理由付きで明示されており、歯の黙った削除なし。

### セキュリティモデル評価（OWASP A08 — Software/Data Integrity を中心に）

**攻撃面の閉鎖**:
- **Edit/Write/Bash（T1/T2）**: in-process anchor は agent-writable disk に依存しない（seed の1回を除く）ため、agent が on-disk を書き換えても per-node on-disk 歯が検出する。
- **git plumbing（T3）**: `diffPathsBetweenCommits(headBeforeStep, HEAD, pipelineManagedPaths)` が committed-tree を見るため、worktree が clean でも committed tree への注入を捕える。T-09 T3 に「破壊確認: committed-tree 歯を外すと plumbing 注入が通る」が明記されており teeth のコントラクトが固定されている。
- **crash→resume（T4）**: durable anchor は agent が push 権を持たない `refs/specrunner/evidence/<branch>` に置かれ crash を跨いで信頼できる baseline になる。resume load 時に origin anchor と on-disk を照合することで「検査前 crash が洗浄経路にならない」不変が閉じる。
- **協調改竄（T5）**: `computeJournalDigest` が events.jsonl + state.json の結合ダイジェストを返すため、両ファイルを整合的に改竄しても anchor と不一致になる。

**暗号的妥当性**: length-delimited concat（`"events:"+len+":"+events+"\n"+"state:"+len+":"+state`）の SHA-256 は、length delimiter なしの場合の連結衝突を防ぐ。入力フォーマット・アルゴリズムともに適切。

**TOCTOU の排除**: resume seed は「delta を書く前に on-disk を1度 full 読み（`begin` persist 内 ＝ agent step 実行前）」と定義されており、seed と書込の間に agent 実行窓がない。書込後の re-read は禁止（D1）なので、tampered bytes を authentic として取り込む TOCTOU が成立しない。

**fail-closed 統一**: anchor read unavailable / diff 取得失敗 / on-disk 読取失敗をすべて tamper 相当 halt と扱う（D7）。fail-open への退化経路がない。

**load-bearing 前提の明示**: 「agent が origin push 権を持たない」前提が Risks に明示され、違反時の影響（durable anchor 改竄可能）が記述されている。running 中は in-process anchor（memory・agent 到達不能）がカバーすることも言及。

### false-positive の管理（T6）

- **継続実行**: begin persist → per-node 検証の間に lineage/interruption append が発生しない。`applySuccessPostPersistEffects`（lineage）と `appendInterruption`（halt path）は per-node 検証の後に走るため、正常系で false-positive にならない構造が executor flow から成立している。
- **意図的 awaiting-resume**: `commitFinalState` が on-disk == in-process anchor の状態で checkpoint + durable anchor を push するため、次 resume で on-disk == origin anchor が成立し halt しない。
- **crash-recovery resume（D8 accepted）**: T6 の false-positive 禁止から明示的に除外されており、正常系との区別が構造的に確立されている。

### コードベース整合性確認

以下の設計前提を実コードで確認した:

- `commitAndPush`（commit-push.ts:36-84）: `git add -A`（除外なし）、sequential 経路で journal が混入している ✅ — D1 で修正対象
- `pipelineManagedPaths`（round-git-scope.ts:54-56）: `[slugStateJsonPath, slugEventsPath, usageJsonPath]` ✅ — D1 の exclude pathspec の再利用元
- `commitScopedPaths`（commit-push.ts:172-206）: pathspec-limited staging ✅ — `commitJournalArtifacts` の実装ベース
- executor.ts の lifecycle 順序（L436→L463-466）: `finalizeStepArtifacts` → `captureHeadSha` ✅ — T-05 の挿入点として適切
- `verifyCheckpoint`（verify-checkpoint.ts）: fold/counter/profile/identity の self-consistency のみ、authenticity なし ✅ — T-08 の対象
- pipeline.ts の全 `store.persist` 呼び出し（L156, L175, L287-288, L299-300, L391-392, L411-412）: すべて `deps.storeFactory(jobId)` 経由 ✅ — holder 注入が effective
- exit-guard.ts の `store.persist`（L60, L128, L142, L166）: `new JobStateStore` 直接構築（storeFactory 非経由）→ holder 非注入 ✅ — crash-exit は D8 accepted posture の対象であり設計上問題なし

### 後方互換

T-04 の「agent self-commit（HEAD advance）分岐の保持」、T-08 の既存 verify-checkpoint self-consistency 述語無変更、D7 の absent-anchor skip（pre-feature checkpoint の backward-compat）が後方互換を確保している。

### タスク順序

T-01（pure 基盤）→ T-02（git plumbing）→ T-03（JobJournal 統合）→ T-04（authorship 分離）→ T-05（per-node 検証）→ T-06（durable anchor push）→ T-07（resume）→ T-08（attach）→ T-09（反例・回帰）は interface 確定前にテストを書かない原則に沿っており適切。

## 総評

設計は構造的に完結しており、セキュリティモデルの全トレードオフが文書化されている。MEDIUM 2件はタスク記述の補完（エラーハンドリングパスの明記・holder 初期化スコープの明記）であり、実装者が独立に解決可能な範囲で実装ブロッキング要因にならない。LOW 3件はドキュメントへの補足事項。実装着手可能と判断する。
