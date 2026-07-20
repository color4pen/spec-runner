# Conformance Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✅ | T-01〜T-05 全チェックボックス完了 |
| design.md | ✅ | D1〜D4 すべて実装に反映済み |
| spec.md | ✅ | 全 Requirement (SHALL/MUST) + Scenario をカバー |
| request.md | ✅ | 受け入れ基準 T1〜T4 すべて充足 |

## Detail

### tasks.md — 全チェックボックス完了

T-01〜T-05 のすべての項目が `[x]` でマーク済み。

### Design decisions (D1〜D4)

**D1: Per-slug re-check injected as a dependency** ✅

- `RecheckSidecarFn` 型が定義・export されている（`sidecar-runner.ts` L36-40）
- `SidecarPruneDeps` に `recheck?: RecheckSidecarFn` が追加済み（L52）
- `--force` ループ内で `const doRecheck = deps.recheck ?? (async () => true)` を解決（L113）
- 各 orphan の `fs.rm` 直前に `await doRecheck(...)` を呼ぶ。`stillOrphan === false` なら skip + warning + continue（L120-137）
- fail-safe: recheck が reject した場合も skip + warning + continue（L123-128）
- `runPrune` が `recheck: isOrphanSidecar` を deps に渡す（`prune.ts` L88）

**D2: skip は warning + exit 0** ✅

- skip 時は `warnings[]` に `Warning: skipped sidecar for '<slug>' at <path>: no longer orphan (became active after scan)` を積む
- `exitCode` は常に 0（scan 失敗以外）
- `Removed N orphan sidecar(s)` の N はスキップ分を除く実削除数のみ

**D3: ロック無し・残余窓を design.md に明記** ✅

- ロック導入なし
- `design.md` D3 節でリード→rm 間の残余窓の幅・影響（`isStaleRunning` が live job を stale 誤判定する経路）・自己回復条件を明記

**D4: dry-run と worktree prune は不変** ✅

- dry-run は Step 4 前に return。recheck も rm も呼ばれない
- `pruneOrphanWorktrees` の呼び出し引数は変更なし

### Spec — Requirements & Scenarios

| Requirement | SHALL/MUST | 対応実装 | 対応テスト |
|---|---|---|---|
| `--force` 削除直前に per-slug 再検証 | SHALL | `doRecheck` 呼び出し（sidecar-runner.ts L122） | TC-001, TC-002 |
| production caller が実 predicate を wire | MUST | `recheck: isOrphanSidecar`（prune.ts L88） | TC-009 |
| 再検証で orphan のままの sidecar は削除 | SHALL/MUST | `stillOrphan === true` で rm 実行 | TC-003 |
| skip は warning + exit 0 | SHALL/MUST | warnings[] + exitCode 0 | TC-004, TC-007, TC-008 |
| dry-run は recheck も rm も呼ばない | SHALL/MUST | Step 3 で return | TC-005, TC-011 |
| best-effort 継続・exit code 不変 | SHALL | try/catch で continue | TC-006 (recheck) |

全 Scenario（6 件）について Given/When/Then が実装とテストで裏付けられている。

### 受け入れ基準 T1〜T4

**T1（競合の再現と防止）** ✅

- TC-001: `recheck = async () => false` で `rm` が呼ばれないこと・warning に `slug-x` と「no longer orphan / became active」が含まれること・exitCode 0 を確認
- 破壊確認 (TC-002): recheck を inject しない（= pass-through `async () => true`）場合に `rm` が呼ばれることを確認。これにより TC-001 の `expect(rm).not.toHaveBeenCalled()` アサーションが `if (!stillOrphan)` ブロックを除去したときに赤になること（recheck=false でも rm が呼ばれるため）を間接的に証明する

**T2（orphan のままなら削除）** ✅

- TC-003: `recheck = async () => true` で両 orphan の rm 呼び出しと `Removed 2 orphan sidecar(s)` を確認

**T3（既存挙動の維持）** ✅

- TC-004/006/007/008/020/021（既存ブロック）は recheck を inject しないため pass-through が効き、既存の削除動作が維持される。変更なしで green 確認済み（verification-result: 7534 tests passed）
- TC-009 in `prune-combined.test.ts` で `deps.recheck === isOrphanSidecar` を参照等価で確認

**T4（typecheck && test green）** ✅

- verification-result-001.md: build/typecheck/test/lint/changed-line-coverage すべて passed（7534 tests passed, 1 skipped）

### スコープ確認

変更ファイル（`git diff main...HEAD --stat` より）:

| ファイル | 変更種別 | 判定 |
|---|---|---|
| `src/core/prune/sidecar-runner.ts` | 型定義 + recheck ロジック追加 | ✅ in scope |
| `src/cli/prune.ts` | `isOrphanSidecar` import + recheck wiring | ✅ in scope |
| `tests/unit/core/prune/sidecar-runner.test.ts` | 新テスト追加 | ✅ in scope |
| `tests/unit/cli/prune-combined.test.ts` | TC-009 追加 | ✅ in scope |
| `specrunner/changes/prune-force-recheck-before-delete/*` | pipeline artifacts | ✅ pipeline artifacts |

スコープ外として明記されていた `pruneOrphanWorktrees` / `src/core/sidecar/orphan.ts` の `isOrphanSidecar`/`ACTIVE_STATUSES` / doctor check はいずれも変更なし。
