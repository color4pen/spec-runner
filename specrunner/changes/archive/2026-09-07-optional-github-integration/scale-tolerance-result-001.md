# Scale-Tolerance Review — optional-github-integration — Iteration 1

**Reviewer**: scale-tolerance  
**Date**: 2026-09-06  
**Scope**: Time-monotonic growth targets — archive, sidecar, issue/PR, comments, journal.  
**判定基準**: 走査・ロード・API 呼び出しのコストが件数に比例して成長するコードを検出する。

---

## Evidence

### 1. スキャン対象と調査ファイル

| 調査ファイル | 確認内容 |
|---|---|
| `src/core/runtime/local.ts` | attestation 生成追加 / writeLivenessSidecar |
| `src/core/attestation/build-attestation.ts` | journal fold 処理 |
| `src/core/attestation/render-markdown.ts` | gates 列挙 |
| `src/core/pipeline/apply-github-integration.ts` | descriptor 変換 |
| `src/git/remote.ts` | normalizeOriginIdentity |
| `src/state/github-integration.ts` | getGitHubIntegration / requireGitHubRepository |
| `src/config/github-integration.ts` | resolveGitHubIntegrationConfig / traceGitHubIntegration |
| `src/core/command/reopen.ts` | PR gate 分岐 |
| `src/core/command/run-result.ts` | branch-published 生成 |
| `src/core/attach/verify-checkpoint.ts` | identity 照合追加 |
| `src/core/doctor/checks/index.ts` | selectChecks / baseChecks |
| `src/core/doctor/checks/repo/git-origin.ts` | git-origin check |
| `src/cli/command-registry.ts` | resolveEffectiveRequiresGitHub / findActiveGitHubOnlyFlags |
| `bin/specrunner.ts` | dispatch gate |
| `src/state/schema/operations.ts` | appendSynthesizedCommit |
| `src/store/job-state-store.ts` | list() (pre-existing) |

---

### 2. コスト分類

#### 2-A. O(1) / O(定数) ― スケール問題なし

| コード箇所 | 計算量 | 理由 |
|---|---|---|
| `getGitHubIntegration(state)` | O(1) | フィールド参照 1 回 |
| `requireGitHubRepository(state)` | O(1) | フィールド参照 + throw |
| `resolveGitHubIntegrationConfig(config)` | O(1) | `config.github?.enabled ?? true` |
| `traceGitHubIntegration(loadResult)` | O(1) | 2 層チェック（project-local → user-global） |
| `buildRunResult(state, slug)` | O(1) | `state.synthesizedCommits?.at(-1)` は O(1) |
| `verifyCheckpoint` 内の identity 照合追加部分 | O(1) | digest 文字列比較 1 回（新規 disabled 分岐） |
| `reopen.ts` の `getGitHubIntegration` ガード | O(1) | |

#### 2-B. O(パイプライン定数) ― バインドされた小定数

| コード箇所 | 計算量 | 理由 |
|---|---|---|
| `applyGitHubIntegration(descriptor, contract)` | O(steps + transitions + roles) | pipeline は最大 ~15 step、列挙後に新 descriptor を返す。参照同一 enabled 分岐はゼロアロケーション |
| `resolveEffectiveRequiresGitHub(COMMANDS, path)` | O(path_length) | path ≤ 3 |
| `findActiveGitHubOnlyFlags(spec, parsedFlags)` | O(flags) | 1 コマンドの flag 数 < 20 |
| `normalizeOriginIdentity(remoteUrl)` | O(URL_length) | 1 URL を 1 回 SHA-256 |

#### 2-C. O(journal_events_per_job) ― 1 ジョブのライフサイクルにバインドされた 1 回の読み取り（新規）

**該当箇所**: `src/core/runtime/local.ts`, `commitFinalState`（本変更で追加、行 891–914）

```typescript
if (state.status === "awaiting-archive" && state.githubIntegration?.enabled === false) {
  // events.jsonl 全体を読み込む
  journalContent = await fs.readFile(eventsAbsPath, "utf-8");
  // fold() で全イベントを走査
  const attestation = buildAttestation({ journalContent, usage });
  ...
}
```

- **トリガー**: GitHub 無効ジョブの terminal commit（1 ジョブにつき 1 回）
- **コスト**: O(events_in_that_job's_journal)。ジョブの resume サイクルが多いほど events.jsonl が長くなる
- **自然上限**: 1 ジョブのライフサイクル（step 数 × 反復数）。ジョブ横断スキャンではない
- **比較**: `verifyCheckpoint` はすでに同ジョブの events.jsonl に対して `fold()` を呼ぶ（既存動作）。attach の resume でも同等コストが発生していた
- **評価**: ジョブ横断の単調増加（archive 件数・sidecar 件数比例）ではなく、1 ジョブ内の events 比例。terminal commit の 1 回コストとして許容範囲。ただしリゾーム的な resume ループが 100 回超える場合、events.jsonl は MB 規模に成長し得る

**判定**: LOW（許容範囲内だが、深いリゾームループで events.jsonl が大きくなった場合の実測値はない）

#### 2-D. 既存の O(ジョブ件数) スキャン（本変更では不変）

以下は `commonChecks` に既に含まれており、本変更は `baseChecks`（GitHub 無効経路）にも同じスキャンを含める形になっているが、**スキャン実装自体は変更していない**。

| check | 対象 |
|---|---|
| `journalIntegrityCheck` | specrunner/changes/ 以下の全ジョブフォルダ |
| `orphanSidecarsCheck` | .specrunner/local/ 以下の sidecar |
| `orphanWorktreesCheck` | git worktree list |

これらは GitHub 有効経路で既にスキャンしており、GitHub 無効経路で新たにスキャンが増えるわけではない（同じ環境で doctor を呼ぶなら同じコスト）。既存問題の伝播であり、本変更のスケール退行ではない。

#### 2-E. 削減された API コスト（正の効果）

本変更は GitHub 無効経路で以下をゼロにする：
- PR 作成 API 呼び出し（1 回/ジョブ）
- attestation コメント投稿 API（1 回/ジョブ）
- reopen の PR OPEN 確認 API（1 回/reopen）
- doctor の GitHub token 検証 API（1 回/doctor 呼び出し）

GitHub 無効経路では GitHub API 呼び出しが 0 件になり、外部 API コストは増加しない。

---

### 3. 単調増加対象ごとの評価

| 対象 | 本変更での扱い | 評価 |
|---|---|---|
| **archive 件数** | archive スキャン追加なし。`plain-archive.ts` 変更なし | 問題なし |
| **sidecar 件数** | `writeLivenessSidecar` の `getJobStatus` コールバックは既存の `JobStateStore.list(repoRoot)` (includeArchived: false)。本変更で追加なし | 問題なし |
| **issue/PR 件数** | GitHub 無効経路では GitHub API 呼び出しゼロ。issue/PR 走査なし | 問題なし（むしろ削減） |
| **コメント件数** | GitHub 無効経路では PR コメント投稿なし | 問題なし（削減） |
| **journal（events.jsonl）** | 1 ジョブの events.jsonl を terminal commit 時に 1 回読む（§2-C） | LOW — 許容範囲内 |

---

### 4. Evidence Summary

- **checked**: 16（上記調査ファイル一覧）
- **skipped**: 0（scale-tolerance 観点で関係する全差分ファイルを確認）
- **unverified**: 0

---

### 5. 結論

本変更において、**archive 件数・sidecar 件数・issue/PR 件数・コメント件数に比例して成長する新たな走査・ロード・API 呼び出しは検出されなかった**。

唯一の新規 O(N) パスは §2-C の attestation 生成（1 ジョブの journal 読み取り・fold）であり、これは **1 ジョブのライフサイクルにバインドされた 1 回限りの terminal commit コスト**である。ジョブ横断の単調増加ではなく、重大な scale-tolerance 問題とは評価しない（LOW）。

GitHub 無効経路は GitHub 有効経路と比較して API 呼び出し件数を削減しており、全体的なスケール特性は改善している。
