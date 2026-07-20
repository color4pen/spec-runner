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
| 1 | info | testing | tests/unit/core/prune/sidecar-runner.test.ts | TC-022 の説明 "invokes both runners regardless of which one fails" は `exitCode: 1` 返却ケースをテストしており、`throw` ケース（worktree runner が例外を投げると sidecar runner がスキップされる）を含まない。実動作はコードと一致するが、テスト名が実際の保証範囲を超えて読める。 | 説明を "when exitCode: 1 is returned" に絞るか、throw ケースの挙動を別テストで明示する。 | no |
| 2 | info | testing | tests/unit/core/sidecar/orphan.test.ts | 破壊確認（T2）が predicate 層（TC-003）と runner 層（TC-007）に分散している。mock scan を使う runner テストでは実際の `isOrphanSidecar` を経由しないため、"active 判定を無効化すると本テストが落ちる" の "本テスト" は TC-003 になる。設計の DI 選択からくる意図的なトレードオフであり、TC-003 の存在で要件を満たす。 | 必要ならアーキテクチャ説明コメントを TC-007 冒頭に一行加えると読者の混乱を防ぐ。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 9 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 10 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 9.55

## Summary

実装は設計書（design.md）の D1〜D5 をすべて忠実に実現している。

**AC 充足確認**

- **T1（dry-run 列挙）**: `pruneOrphanSidecars`（TC-004）が orphan のみを info 列挙し `fs.rm` を呼ばないことをテストで固定。✅
- **T2（--force 削除の選別）**: TC-006 で orphan のみが `rm` されることを確認。TC-007 で scan override（predicate 無効化に相当）により active sidecar が削除されることを確認。TC-003 で `isOrphanSidecar` が active statuses に対して `false` を返すことを全 5 ステータス確認。✅
- **T3（hint 置換）**: TC-009 で hint が `specrunner job prune` を含み `rm -rf` を含まないことを確認。✅
- **T4（丸め）**: TC-010/011 で `detailsHuman` が N+1 行（N 件 + remainder）、`details` が全件であることを確認。TC-019 で formatter レイヤも確認。✅
- **T5（判定の共有）**: `src/core/sidecar/orphan.ts` が doctor check と prune runner の両方からインポートされ、TC-001/TC-017 で共有関数であることを固定。✅
- **T6（typecheck && test green）**: verification result で build/typecheck/test（7470 passed）/lint/changed-line-coverage が全 passed。✅

**特記事項**

- `SidecarScanFs` が `DoctorFs` の read-only 部分集合として定義されており、`ctx.fs` がそのまま代入可能な構造的互換性が保たれている。`stat` の戻り型（`{ isDirectory(): boolean }`）も `fs.Stats` の superset 関係で問題なし。
- `detailsHuman` フィールドは additive（optional）で既存の他 check の human/JSON 出力を変えない。`formatHuman` での `r.detailsHuman ?? r.details` 展開は backward-compatible。TC-012 で他 check の出力が変わらないことを確認済み。
- `worktreeResult.exitCode || sidecarResult.exitCode` による exit code 合算は設計どおり。両者が 0 なら 0、どちらかが 1 なら 1。
- orphan sidecar の scan 例外（`catch` → `status: "pass"`）は never-throws 契約のある `scanOrphanSidecars` を前提とした safety valve で、fail-open doctor 設計と一致する。
- findings はいずれも info レベルで blocking なし。
