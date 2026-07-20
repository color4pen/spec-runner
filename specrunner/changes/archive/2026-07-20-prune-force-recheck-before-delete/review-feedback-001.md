# Code Review Feedback — iteration 001

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | low | maintainability | tests/unit/core/prune/sidecar-runner.test.ts | TC-002 の 破壊確認はコントラスト実装（recheck なし → rm 呼ばれる）で、TC-001 の否定証明として説明コメントに依存している。mutation 的な明示性はないが、TC-001 の `expect(rm).not.toHaveBeenCalled()` がコード側の skip ブランチ削除で必ず赤になるため機能的には問題ない。 | 対応不要。現状の説明コメントで十分。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 10 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 10 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 9.85

## Summary

### 検証対象

- `src/core/prune/sidecar-runner.ts` — 再判定ロジックの追加
- `src/cli/prune.ts` — `isOrphanSidecar` の注入
- `tests/unit/core/prune/sidecar-runner.test.ts` — 新規テストブロック群
- `tests/unit/cli/prune-combined.test.ts` — TC-009 wiring テスト
- `specrunner/changes/prune-force-recheck-before-delete/` — design.md / tasks.md / test-cases.md

### 受け入れ基準チェック

**T1（競合の再現と防止）**

- TC-001: `recheck` が `false` を返すと `fs.rm` が呼ばれないこと、skip 警告に slug と理由が含まれること、`exitCode === 0` — 3 アサーションで完全に固定されている ✅
- 破壊確認: TC-001 の `expect(rm).not.toHaveBeenCalled()` がコード側 skip ブランチ削除で赤になることを TC-002 のコントラストで示している。TC-001 が `recheck: false` を注入しているため、skip ブランチを消すと `rm` が呼ばれ TC-001 が落ちる。機能的には問題ない ✅

**T2（orphan のままなら削除）**

- TC-003: `recheck: async () => true` のとき両 orphan に `rm` が呼ばれ `Removed 2 orphan sidecar(s)` ✅
- TC-007（混在）: orphan-keep のみ rm, orphan-gone はスキップ, `Removed 1 orphan sidecar(s)` ✅

**T3（既存挙動の維持）**

- dry-run: TC-004/TC-005 ブロックは改変なし ✅
- best-effort: TC-020 ブロックは改変なし ✅
- exit code: TC-021 ブロックは改変なし ✅
- TC-009: `deps.recheck === isOrphanSidecar` を force=true/false 両方で検証 ✅
- TC-011: dry-run で注入済み recheck が一切呼ばれないことを spy で確認 ✅
- TC-013: `recheck` 未注入時は pass-through（削除が進む）であること ✅

**T4（typecheck && test green）**

- verification-result.md: build / typecheck / test / lint / changed-line-coverage 全フェーズ passed ✅

### コード品質

**sidecar-runner.ts**

- `RecheckSidecarFn` の型シグネチャが `isOrphanSidecar` と完全一致しており、型安全な差し込みが保証されている
- `doRecheck` をループ外で一度解決するのは正しい（ループごとの再評価は不要）
- `try/catch` で re-check 例外を fail-safe に捕捉し skip する設計はリクエストの意図通り
- skip 警告フォーマット（`Warning: skipped sidecar for '<slug>' at <path>: no longer orphan (became active after scan)`）は既存の warnings[] ルートに乗り、CLI 側の変更不要 ✅
- `removed` カウンターはスキップ分を含まないため `Removed N` メッセージに整合性がある ✅
- dry-run の return が Step 4 より前であり `doRecheck` 初期化すら到達しない ✅

**prune.ts**

- `isOrphanSidecar` をトップレベル import しているため、CLI テストの `vi.mock` クロージャ問題を回避（lazy import の `pruneOrphanSidecars` と対比して、`isOrphanSidecar` はモック対象外）✅
- `recheck: isOrphanSidecar` は force 値に関係なく渡され、runner 側が force=false で呼ばないため意味的に正しい ✅
- worktree runner 呼び出し・出力セクション・exit code 合成はすべて無変更 ✅

**スコープ遵守**

- `src/core/prune/runner.ts`（worktree 側）、`src/core/sidecar/orphan.ts`（ACTIVE_STATUSES / isOrphanSidecar 本体）、doctor check は一切変更なし ✅

**残余リスクの文書化**

- design.md D3 に再判定後の read→rm ギャップが明記され、影響の bounded self-healing 性（liveness のみ、branch-borne state は安全）、次アクション（lock）が記載されており、十分 ✅
