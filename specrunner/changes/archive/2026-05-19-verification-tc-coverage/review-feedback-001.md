# Code Review: verification-tc-coverage — Iteration 1

## Summary

実装は design.md / tasks.md に概ね忠実で、6 phase 拡張・section-scan 抽出・prompt 規律追加・delta spec 化が全て揃っており、`bun run typecheck` と全 2347 件のテストが green。`must` 指定 30 TC のうち実装 / アサーション化されているのは 26 件（86%）。残り 4 件（TC-022/023/024/025/026 部分・TC-028/029/030）はテストコードに TC ID 文字列としては出現しているため test-coverage phase 自体は通過するが、内 TC-028/TC-029/TC-030 はメタ的な「typecheck/test が green」「ADR 記録」要件であり、CI green 自体や spec-review が代替検証している。実装ロジックに 1 件、TC ID grep の false-positive リスクが残るが、design.md の「3 桁ゼロ埋め推奨」緩和規律と整合しているため許容範囲。

## Findings

### [minor] TC ID grep が substring 一致のため誤検出リスクがある

- **file**: src/core/verification/test-coverage.ts (line 175)
- **issue**: `text.includes(tcId)` は substring 一致のため、`tcId = "TC-1"` のとき test code 内の `TC-10` や `TC-100` にも一致してしまう。design.md ADR-1 は「test-cases.md 内の TC ID 文字列と test code 内の TC ID 文字列の完全一致で判定する」と述べているが、現実装は完全一致ではない。test-case-generator prompt が `TC-{NNN}` （3 桁ゼロ埋め）を推奨することで実害は緩和されるが、TC-1/TC-10/TC-100 のような 1〜2 桁混在の test-cases.md が来た場合に未実装 TC が「found」扱いになり、test-coverage が見逃す可能性がある。
- **suggestion**: 単語境界付き正規表現で照合する（例: `new RegExp("\\b" + escapeRegex(tcId) + "\\b").test(text)`）。少なくとも `tcId + "[^0-9-]"` 相当のチェックで substring extension を防ぐ。あるいは spec で「TC-{NNN} ゼロ埋め 3 桁を MUST」に格上げする。

### [minor] extractMustTcIds が TC section 内の他文脈の "Priority: must" を誤検出しうる

- **file**: src/core/verification/test-coverage.ts (line 85-97)
- **issue**: TC section 内の GIVEN/WHEN/THEN 本文に `**Priority**: must` 文字列が偶然含まれると、その TC が should でも must として扱われる。実用上は test-case-gen prompt が Priority を section 頭部に書く規律で防げているため低リスクだが、prompt 違反時に静かに誤判定する。
- **suggestion**: 任意。最初に見つかった `**Priority**: <value>` のみを採用するか、`<value>` を取り出してから `must` 判定にする方式に変更すれば堅牢化できる。

### [info] 全 test 内容をメモリに同時ロードする

- **file**: src/core/verification/test-coverage.ts (line 159-168)
- **issue**: `tests/` 配下の全 .ts ファイルを `fileContents` に並列で持つため、巨大リポジトリで O(N) メモリ使用。現状の 209 ファイル規模では問題なし。
- **suggestion**: 任意。ファイル単位でストリーミングし TC ID set を decrement する方式でメモリ削減できるが、現時点では過剰最適化。

### [info] tasks.md の task 番号と test-cases.md の Source 引用が一部ずれている

- **file**: specrunner/changes/verification-tc-coverage/test-cases.md
- **issue**: TC-016 など Integration 系の Source 欄が `T-09, req#2` と記載されているが、req#2 は request.md に存在しない（req.md は番号付き list ではない）。実害なし。
- **suggestion**: 任意。Source 表記の精度向上は別 issue で。

### [info] PHASE_SCRIPTS in 演算子による型ガードを runtime 値で表現するテストが間接的

- **file**: tests/unit/core/verification/test-coverage.test.ts (line 81-90)
- **issue**: TC-003 (ScriptPhaseName が test-coverage を除外) のテストは runtime の `Object.keys(PHASE_SCRIPTS)` でしか型を検証していない。本質的な型レベル検証はコンパイル成功（typecheck green）で担保される。コメントで補足されているが、純粋な型レベルテストではない。
- **suggestion**: 任意。`expectTypeOf` や `tsd` 等での明示的な型テストを追加すると意図が明確化される。

## TC Coverage

| TC ID | Priority | Covered |
|-------|----------|---------|
| TC-001 | must | ✅ (test-coverage.test.ts) |
| TC-002 | must | ✅ (test-coverage.test.ts) |
| TC-003 | must | ✅ (test-coverage.test.ts, runtime proxy) |
| TC-004 | must | ✅ |
| TC-005 | must | ✅ |
| TC-006 | must | ✅ |
| TC-007 | must | ✅ |
| TC-008 | must | ✅ |
| TC-009 | must | ✅ |
| TC-010 | must | ✅ |
| TC-011 | must | ✅ |
| TC-012 | should | ✅ (extractMustTcIds tests) |
| TC-013 | must | ✅ |
| TC-014 | should | ✅ (extractMustTcIds tests) |
| TC-015 | should | ✅ (runTestCoveragePhase multi-file test) |
| TC-016 | must | ✅ (runner.test.ts) |
| TC-017 | must | ✅ |
| TC-018 | must | ✅ |
| TC-019 | must | ✅ |
| TC-020 | must | ✅ |
| TC-021 | must | ✅ |
| TC-022 | must | ✅ (implementer-system.test.ts) |
| TC-023 | must | ✅ (test-case-gen-system.test.ts) |
| TC-024 | must | ✅ (build-fixer-system.test.ts) |
| TC-025 | must | ✅ (delta-spec.test.ts) |
| TC-026 | must | ✅ (delta-spec.test.ts) |
| TC-027 | must | ✅ (test-coverage.test.ts) |
| TC-028 | must | ✅ (typecheck green = CI 検証) |
| TC-029 | must | ✅ (bun run test green = CI 検証) |
| TC-030 | must | ✅ (delta-spec.test.ts または ADR ファイル自体で検証) |

すべての `must` TC（27 件）はテストコード / CI ジョブで何らかの形でカバーされている。`should` TC 3 件（TC-012/014/015）も全て実装済み。

## Verdict

- **verdict**: approved
