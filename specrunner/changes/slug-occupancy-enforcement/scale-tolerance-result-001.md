# Scale-Tolerance Review Result — iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 読んだファイル

- `git diff main...HEAD --stat` — 50 ファイル / +6,720 / -115
- `specrunner/changes/slug-occupancy-enforcement/design.md` — D1–D11・Risks
- `specrunner/changes/slug-occupancy-enforcement/tasks.md` — T-01〜T-13
- `src/core/occupancy/scan.ts` — scanSlugOccupancy 実装
- `src/core/occupancy/guard.ts` — assertSlugUnoccupied
- `src/core/occupancy/claim.ts` — claimLivenessSidecar
- `src/core/occupancy/repair.ts` — repairSlugOccupancySidecar
- `src/core/doctor/checks/storage/slug-occupancy.ts` — discoverSlugs + per-slug scan
- `src/core/resume/resolve-job.ts` — resolveJobStateBySlug（全文）
- `src/core/cancel/runner.ts`（L400–520）— sidecar/marker teardown + purge
- `src/core/inbox/run-inbox.ts`（全文）— startJob default impl + comment dedup
- `src/core/runtime/local.ts`（L1420–1468）— writeLivenessSidecar check-and-claim
- `src/store/job-catalog.ts` — listWithSourceDirs（includeArchived フラグの挙動確認）

## 観点ごとの評価

### 1. ディレクトリ走査の追加・変更

#### scanSlugOccupancy（scan.ts）

1 slug に対して以下を走査する:

| 走査対象 | 件数依存 |
|---|---|
| `specrunner/changes/<slug>/state.json`（main checkout） | 固定 1 回 |
| `.git/specrunner-worktrees/` の readdir | 固定 1 回（WT 全件） |
| 各 WT の `specrunner/changes/<slug>/state.json` | W 件（W = WT 数） |
| `.specrunner/local/<slug>/state.json` | 固定 1 回 |

1 slug の走査コスト = O(W)。W = 現在の worktree 数（アクティブ job に比例、archive で増えない）。

**guard**（`assertSlugUnoccupied`）: `job start` 1 回あたり 1 回呼ばれる。手動コマンド。O(W) / 呼び出し。  
**claim**（`claimLivenessSidecar`）: sidecar 書き込み時の第二防衛線。通常 guard 通過後の 1 回。  
**repair**（`repairSlugOccupancySidecar`）: `doctor repair <slug>` 手動コマンド。1 slug O(W)。

いずれも走査前フィルタが働いており（対象 slug 限定）、archive 全件を読まない。 **スケール安全**。

#### doctor check — discoverSlugs + per-slug scan

```ts
// slug-occupancy.ts:154-163
async function discoverSlugs(repoRoot): Promise<string[]> {
  const states = await JobStateStore.list(repoRoot);  // includeArchived: false (デフォルト)
  ...
}
```

`JobStateStore.list` は `includeArchived: false` がデフォルトのため archive は走査しない。
active slug 数 = S（アーカイブ済みは含まれず、archive 成長で増えない）。

その後、S 件の slug に対して `scan(repoRoot, slug)` を呼ぶ。各呼び出しで:
- `readdir(worktreesDir)` を 1 回実行（S 件 × 再実行、非キャッシュ）
- 各 WT の slug state を読む（W 件）

合計コスト = O(S × W)。S は active slug、W は active WT。どちらも archive 件数と無関係。
**`specrunner doctor` は手動コマンド**。reviewer 定義の approved 条件（"手動コマンドに限定"）に該当。 **スケール安全**。

### 2. 呼び出し経路の頻度

#### inbox tick（定期実行）での追加コスト

**新規コード（run-inbox.ts:382-395）**:

```ts
// buildEffects.startJob の default impl
async startJob(slug, issueBody, issueNumber) {
  const allStates = await JobStateStore.list(repoRoot);  // ← 追加コスト
  const nonTerminalForSlug = allStates.filter(...);
  if (nonTerminalForSlug.length > 0) { throw slugOccupiedError(...); }
  ...
}
```

`runInboxOrchestrator` は L88-91 で既に `allJobStates` を 1 回ロードしている。
`buildEffects` はその外側のクロージャから `allJobStates` を参照できないため、start action ごとに再 fetch している。

- **頻度**: inbox tick は定期実行（periodic）。
- **1 tick あたり追加コスト**: N_starts × `JobStateStore.list` 呼び出し（N_starts ≤ maxStartsPerRun）。
- **単調増加するか**: `includeArchived: false` のため archive が増えても走査件数は増えない。active state のみで、active 件数は archive/cancel により収束する。
- **結論**: monotonically growing cost ではないが、既に手元にあるデータを再ロードしている冗長呼び出し。I-001 として記録する。

#### resolveJobStateBySlug（resume / reopen）

```ts
// resolve-job.ts:23
const allStates = await JobStateStore.list(repoRoot, { includeArchived: false });
```

明示的に `includeArchived: false`。active state のみ。`resume` / `reopen` は手動コマンド。 **スケール安全**。

### 3. GitHub API — 一覧系呼び出し

本 change でコメント系 API を新設:
- `postRejectComment`（SLUG_OCCUPIED 時）: 1 tick あたり最大 N_starts 件。dedup マーカーにより同一 priorJobId では一度のみ。増加するコメントの線形 scan は `commentsByIssue`（tick 開始時に既に fetch 済）で完結し、追加の API 呼び出しなし。
- `commentsByIssue` のフェッチは既存コード（L107-129）。本 change での追加ページング問題なし。

**スケール安全**。

### 4. 並列 fan-out（Promise.all）

本 change での新規 `Promise.all` なし。既存の `commentsByIssue` fetch fan-out（L108-129）は unchanged。 **問題なし**。

### 5. 増え続けるファイル・ディレクトリ

本 change で新設する永続ファイルなし。sidecar は既存。cleanup 経路:
- 正常 cancel: sidecar を jobId 一致で削除（本 change の改善点）
- `--purge`: ディレクトリごと削除（jobId-gate 付き）
- doctor repair: sidecar を正しい job に付け直す（削除はしない）

**増え続けるファイルの新設なし**。

---

## Findings 詳細

### I-001: inbox startJob — 定期経路での冗長な `JobStateStore.list` 呼び出し

`buildEffects.startJob`（デフォルト実装）が `JobStateStore.list(repoRoot)` を毎 start action ごとに呼んでいる。
`runInboxOrchestrator` の L88-91 でロード済みの `allJobStates` が `buildEffects` のクロージャ外にあるため、再取得が必要になっている構造。

`includeArchived: false` のため archive 成長で増えることはなく、コストは `maxStartsPerRun × active_state_scan_cost` に bounded されている。needs-fix の判定基準（単調増加する件数へ比例）には該当しない。

ただし、定期経路に冗長なリスト呼び出しが追加されている事実として記録する。
