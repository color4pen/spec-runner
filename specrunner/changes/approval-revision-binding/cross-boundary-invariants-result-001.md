# Cross-Boundary Invariants Review Result — approval-revision-binding — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 観点

diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。
実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## 検証した境界と確認した不変条件

### B1: `conformanceApprovedForVerifiedRevision` guard — 既存 routing 機構との整合性

| 境界 | 確認内容 | 結果 |
|------|----------|------|
| STANDARD / FAST 両プロファイルの参照 | `types.ts:250, 307` で `conformanceApprovedForVerifiedRevision` が参照されること | ✓ |
| `conformanceApprovedLatest` が production コードから除去されたこと | `src/` ツリーの grep（定義と comment のみ残る） | ✓ |
| `codeChangedSinceLastVerification`（endedAt 比較）との干渉 | conformance → verification は endedAt guard、verification → adr-gen は commitOid guard で役割分担 | ✓ |
| 複数 verification 実行時の「最後の run」参照 | guard は `verificationRuns[verificationRuns.length - 1]` を使用。失敗 run が挟まっても最後の pass が評価される | ✓ |
| conformance 未実行時（`runs.length === 0`）で false（fail-closed） | `reverification.ts:111` | ✓ |

### B2: `runCliStep` への commitOid 追加 — 既存 CLI step との干渉

| 境界 | 確認内容 | 結果 |
|------|----------|------|
| `bite-evidence`（CLI step）の commitOid 消費者が存在しないこと | `achieved-assurance.ts` は `test-materialize.commitOid` / `implementer.commitOid` のみ使用 | ✓ |
| `pr-create`（CLI step）の commitOid 消費者が存在しないこと | `src/` ツリーで `pr-create.*commitOid` の消費箇所なし | ✓ |
| agent step の exit-HEAD 打刻（`executor.ts:465-468`）が無改変であること | `!deps.roundOwnsGitEffects && deps.runtimeStrategy` 条件ブロックは不変 | ✓ |
| `test-materialize / implementer` の commitOid 意味が変わっていないこと | `oids.ts:27-43`：両者ともに agent step exit-HEAD で不変 | ✓ |

### B3: `selectPendingMembers` の `null` fallback — managed runtime との境界

| 境界 | 確認内容 | 結果 |
|------|----------|------|
| `baselineCommit == null` で revision check が無効化されること | `reviewer-status.ts:111-113` | ✓ |
| `deps.runtimeStrategy` 不在時に `baselineCommit = null` になること | `parallel-review-round.ts:110-114` の `if (deps.runtimeStrategy)` ブロック | ✓ |
| `conformanceApprovedForVerifiedRevision` は git 不能時に fail-closed（false）であること | `reverificationOid` が null → condition (3) が false で return false | ✓ |

この non-regression の非対称性（conformance guard は fail-closed、custom reviewer は managed で fail-open）は design.md D5 / spec.md で明示的に Non-Goal として境界化されている。

### B4: re-anchor ロジック — source-scoped invalidation との相互作用

| 境界 | 確認内容 | 結果 |
|------|----------|------|
| `computeInvalidations` の不変性（再アンカーは coordinator 側のみで完結） | `computeInvalidations` 自体は不変。re-anchor は `parallel-review-round.ts:150-151` のみ | ✓ |
| `applyRoundResults` の `approvedAtCommit = headSha` 設定（2026-07-15 D1 contract）が維持されること | `reviewer-status.ts:152-156`：変更なし | ✓ |
| `excludeChangeFolderPaths` が `specrunner/changes/` 以下を除外すること | `round-git-scope.ts:37-41`：prefix filter 不変 | ✓ |
| always-activate reviewer（`activationPaths: undefined`）が re-anchor されないこと | `computeInvalidations` が always-activate を pending に変換 → `invalidated.status !== "approved"` → re-anchor 条件不成立 | ✓ |

### B5: 既存テスト更新の対応確認

#### TC-001 / TC-002（コード確認済み）
`verificationCallCount >= 2` で commitOid="sha-c"、conformance も "sha-c" を付与 → guard true → adr-gen。
初回 verification は commitOid=undefined → guard false（conformance 未実行）→ code-review。意図と一致。

#### TC-003 / TC-004 / TC-019（**Finding 1**参照）
build-fixer が conformance 承認後に走る経路。詳細は Finding 1 に記述。

#### TC-2 in `transition-when.test.ts`
conformance と verification を同一 commitOid="sha-c" で付与 → guard true → adr-gen。code-fixer が conformance より前に走る正常経路をモデル。設計と整合。

#### `reviewer-status.test.ts` / `member-resume-routing.test.ts`（**Finding 2**参照）
詳細は Finding 2 に記述。

---

## Findings（詳細エビデンス）

### Finding 1: TC-003/004/019 が D4 の不変条件をテストしない synthetic なシナリオを使用

**対象ファイル**: `tests/unit/core/pipeline/pipeline.reverification.test.ts`

**証拠**:

design.md「既存テストの更新」節に明記された更新方針:
> TC-003 / TC-004 / TC-019: build-fixer が conformance 承認**後**に走る経路。
> **final verification の commitOid ≠ conformance.commitOid をモデルし**、期待を
> 「build-fixer 後は code-review 再入 → conformance 再承認 → adr-gen」へ更新（D4）

実際の実装（TC-004 コード差分):
```typescript
// verification spy — build-fixer recovery (3rd call)
const commitOid = verificationCallCount >= 3 ? "sha-c" : undefined;
// conformance spy
return appendRun(s, "conformance", "approved", ts, 0, "sha-c");
```

recovery verification と conformance に**同一** commitOid "sha-c" を付与。  
guard: `conformance.commitOid("sha-c") === verification.commitOid("sha-c")` → **true** → adr-gen （**code-review 再入しない**）

TC-004 のアサーション:
```typescript
// code-review must appear only once (initial path only, not after recovery)
const codeReviewCount = stepsOrder.filter((n) => n === "code-review").length;
expect(codeReviewCount).toBe(1);
```

これは「build-fixer recovery 後に code-review は呼ばれない」を期待しているが、  
D4 は「build-fixer が conformance 後にコミットすると commitOid ≠ conformance.commitOid → guard false → code-review 再入」を要求する。

**なぜ impossible か**:  
production では build-fixer は `git commit` を実行して HEAD を進める。recovery verification の entry-HEAD = build-fixer commit 後の HEAD ≠ conformance の exit-HEAD。commitOid が一致するシナリオは production では発生しない。

**影響**:  
D4 の不変条件（stale conformance 承認が build-fixer 変更を素通しして adr-gen へ直行するバグの封鎖）のテストカバレッジが TC-003/004/019 には存在しない。  
TC-013（`pipeline.build-fixer-reentry.test.ts`）は D4 をカバーするが、TC-003/004/019 は「build-fixer シナリオのカバー」として文書化されており、読者に誤解を与える。

**D4 の production 正確性**:  
production コードの `conformanceApprovedForVerifiedRevision` は commitOid 比較を行い、D4 挙動は正しく実装されている。TC-013 がこれを検証している。

---

### Finding 2: `reviewer-status.test.ts` / `member-resume-routing.test.ts` が 2-arg form のまま

**対象ファイル**:
- `src/core/pipeline/__tests__/reviewer-status.test.ts`（lines 118, 126, 134, 139, 148, 156）
- `src/core/pipeline/__tests__/member-resume-routing.test.ts`（lines 130, 146, 155, 184-187）

**証拠**:

tasks.md T-05 の更新指示:
> `src/core/pipeline/__tests__/reviewer-status.test.ts`: `selectPendingMembers` 群を 3 引数化。  
> `src/core/pipeline/__tests__/member-resume-routing.test.ts`: `selectPendingMembers` 呼び出しを 3 引数化。approved member を skip させるケースは `baselineCommit = approvedAtCommit`（一致）を渡す。

実際のコード（`reviewer-status.test.ts:121-126`）:
```typescript
it("excludes approved members (resume skip D8)", () => {
  const statuses: ReviewerStatus[] = [
    { name: "security", status: "approved", approvedAtCommit: "sha1" },
    { name: "perf", status: "pending" },
  ];
  expect(selectPendingMembers(statuses, ["security", "perf"])).toEqual(["perf"]);
});
```

2-arg 呼び出しにより `baselineCommit = undefined` → `undefined == null → true` → revision check disabled → 旧挙動（status のみで除外）でテスト通過。  
production コード（`parallel-review-round.ts:162`）は `selectPendingMembers(statuses, memberNames, baselineCommit)` と 3-arg で呼ぶ。

**影響**:  
新規挙動（`approvedAtCommit !== baselineCommit` → pending）の regression 検証が既存テストに存在しない。  
新規テスト `select-pending-revision-binding.test.ts` で新挙動はカバーされているが、T-05 の更新指示は未実施。

---

### Finding 3: `runCliStep` が verification 以外の CLI step にも commitOid を付与

**対象ファイル**: `src/core/step/executor.ts`（`runCliStep`、line 551-558）

**証拠**:

design.md D2 / tasks.md T-01 の明示的な判断:
> 他 CLI step（pr-create / bite-evidence）の commitOid 打刻可否は明示判断。
> 他 CLI step の commitOid 消費者が無いことを確認する場合は一般化可。

実装:
```typescript
private async runCliStep(step: CliStep, ...): Promise<StepExecutionResult> {
  // T-01: Capture entry-HEAD commitOid BEFORE step.run().
  const entryHeadSha = deps.runtimeStrategy
    ? (await deps.runtimeStrategy.captureHeadSha(cwd)) ?? undefined
    : undefined;
```

`runCliStep` はすべての CLI step（bite-evidence, pr-create, verification）に対して `captureHeadSha` を呼び出す。  
設計は「verification に限定して打刻」を基本方針とし、他の CLI step への一般化は「消費者が無いことを確認した上で実施」という条件付きだった。  
verification 以外の CLI step に commitOid が付与されることは現時点で無害（消費者なし）だが、設計の明示スコープを超えた実装。

**影響**:  
現時点では bite-evidence / pr-create の commitOid を読む箇所はなく、機能的影響なし。  
将来 bite-evidence.commitOid の消費者が追加された場合、設計意図と異なる entry-HEAD 意味論（「評価した revision」= entry-HEAD）がデフォルトになる点を知っておく必要がある。

---

## 確認できなかった項目

| 項目 | 理由 |
|------|------|
| `captureHeadSha` の transient failure 時における local runtime の実挙動 | runtime adapter 実装の内部詳細。spec で `null → undefined → commitOid 未設定` として文書化されており、fail-closed の設計は仕様どおり。 |
| conformance と verification の間に pipeline-external な commit が挿入された場合の guard 挙動 | 現行パイプラインでは conformance → verification は直行（他ステップ介在なし）。将来の拡張時リスクは design.md Risks に記述済み。 |
