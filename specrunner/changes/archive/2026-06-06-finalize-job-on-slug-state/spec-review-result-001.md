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
- Approval is blocked when CRITICAL ≥ 1 OR HIGH ≥ 1.
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | Specification | tasks.md T-03 | `changeDir` seam の使用方法が暗黙的。slug + stateRoot + changeDir を三点セットで渡すのか、changeDir 単独で足りるのかがタスク文だけでは読み取りにくい。 | 実装時に JobStateStore コンストラクタの opts 型に `changeDir?: string` を追加する際、JSDoc に「slug + stateRoot と同時に指定すること。changeDir を渡すと getStateJsonPath()/getEventsPath() の戻り値が `changeDir/state.json` / `changeDir/events.jsonl` に固定される」と明記すれば十分。spec 文書の修正は不要。 |
| 2 | LOW | Correctness | design.md D5 | 終端 commit が push 恒久失敗した場合、feature branch に `awaiting-archive` が載らない。その後 PR merge → archive の `markJobArchived` が `running` を読み `running → archived` の不正遷移になるリスクが Risks に記載されているが、手動 push 手順が具体的でない。 | Risks のとおり、push 失敗時の回復手順（`git push origin <branch>` を worktree で手動実行後、`specrunner job archive <slug>` を再実行）をエラーメッセージに含めること。設計変更は不要。 |

## 検証メモ

問題診断は実コードと一致している（以下はコードで確認した事実）。

- `markJobArchived(jobId, repoRoot)` は `new JobStateStore(jobId, repoRoot)`（slug opts 無し）でジョブ ID ストア（`.specrunner/jobs/<jobId>/state.json`）を読む。このストアは job 作成時の `status=running` / `step=init` から更新されない。
- `assertJobFinishable` は `JobStateStore.list(cwd)` 経由で slug 正本（`awaiting-archive`）を読んで通過するのに、Phase 3 の `markJobArchived` は jobId ストア（`running`）を読む。
- `LocalRuntime.buildDeps()` の `storeFactory` は `new JobStateStore(id, this.cwd, { slug, stateRoot: wtp })` でスラグモードを使う（wtp = worktreePath）。pipeline 終端の `endStore.persist(state)` はスラグモードで worktree の `specrunner/changes/<slug>/state.json` に書く。D5 の `commitFinalState` はこのファイルを `git add -A` → commit → push する。設計の前提が正しい。
- `JobStateStore.list()` は archive ディレクトリ（`specrunner/changes/archive/*/state.json`）も走査し、dedup で `updatedAt` 新しい方を採用する。D1〜D5 が archive-location の state を `archived`（最新 updatedAt）に更新するため、jobId ストアの `running`（古い updatedAt）はデフォルト `job ls` から自動的に消える。
- D2 の `resolveCanonicalStateDir` で active 優先・archive フォールバックの順序は archive Phase の mv 順序と整合している。`parseArchiveDirName` で日付 prefix を除去するため、冪等再実行時（日付が変わっても）既存 archive dir を正しく解決できる。

セキュリティ観点：スラグ値はファイルパス操作に使われるが、このツールはローカル CLI であり外部入力経路がない。新たに追加される `resolveCanonicalStateDir` は `readdir` で列挙したエントリ名と slug を照合するだけで任意パス注入の経路はない。新規ネットワークエンドポイント・認証面の追加なし。
