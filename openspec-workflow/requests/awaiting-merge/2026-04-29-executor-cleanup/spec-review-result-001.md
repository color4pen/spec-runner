# Spec Review Result: 2026-04-29-executor-cleanup — Iteration 1

## Verdict

- **verdict**: needs-fix
- **score**: 7.10 / 10.0 (pass threshold: 7.0)
- **iteration**: 1 / 2
- **trend**: — (初回)
- **agents**: architect, spec-reviewer (refactoring 軽量構成 — security-reviewer / pattern-reviewer は workflow option `enabled` 非含のためスキップ)
- **retries**: 0/2
- **blocking_findings**: CRITICAL: 0, HIGH: 2

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| completeness | 7 | 0.30 | 2.10 |
| consistency | 6 | 0.25 | 1.50 |
| feasibility | 7 | 0.20 | 1.40 |
| security | — (skipped) | 0.15 | (除外) |
| maintainability | 8 | 0.10 | 0.80 |
| **Total (security 除外で再正規化, weight 合計 0.85)** | | | **8.00 / 0.85 = 9.41 → 正規化前 6.10** |

> **Scoring 方法**: security-reviewer がスキップされたため `review-standards.md` の規定に従い security の重みを除外して再正規化した。再正規化後の Total = (2.10 + 1.50 + 1.40 + 0.80) / 0.85 = **5.80 / 0.85 ≈ 6.82** → **小数第二位を切り上げ 6.82**。
>
> 実装上の Total としては blocking findings 優先で `needs-fix` 判定が支配的。HIGH 2 件のため pass threshold 達成しても verdict は `needs-fix`。

**最終 Total: 6.82** (HIGH ≥ 1 のため verdict は `needs-fix`)

### カテゴリ別 score 根拠

- **completeness (7)**: 受け入れ基準が grep ベースで機械化されており、@deprecated 4 段階分類・LOC 目標・grep 0 件を含む 12 項目で網羅性は良好。ただし「振る舞い不変」の検証手段としての snapshot test の存在確認が tasks にあるが、`tests/cli-stdout-snapshot.test.ts` の baseline 取り直しが必要かどうかが design / tasks のいずれにも明記されていない（HIGH #1 参照）。
- **consistency (6)**: request.md と design.md の前提が一部不正確。`src/core/pipeline.ts` を「placeholder + sibling file」「D7 違反」と記述しているが、実態は production 関数（`runPipeline` / `runProposePipeline`）を保持する thin wrapper であり、純粋な sibling 削除では完了しない。tasks 4.1-4.8 の段取りがこの実態と整合していない（HIGH #2 参照）。
- **feasibility (7)**: helper 抽出 / @deprecated 削除 / cast 削除 / 定数集約 / hash 修正は実装可能性が高い。`pipeline.ts` 削除タスクは「import 書き換え + ファイル削除」のみで完結しないため工数見積が甘い（HIGH #2 関連）。
- **security**: skipped (workflow option `enabled` に security-reviewer 非含)。
- **maintainability (8)**: design D1-D6 が明文化され、module-analysis.md からの decisions の落とし込みも tasks Section 1 で構造的に強制されている。learned-patterns lesson の遵守規律も明示。

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | completeness | tasks.md:106-117 (Section 7), design.md:1-44 | 受け入れ基準 7.11「`specrunner init / login / run / ps` の stdout snapshot が baseline と一致」が機械的に検証可能な形で定義されていない。`tests/cli-stdout-snapshot.test.ts` は存在するが、helper 抽出後 / `pipeline.ts` 削除後 / `@deprecated` 削除後 のいずれの段階で snapshot が更新されるべきか、または `--update-snapshot` 不要で全 PASS することが完了条件かが design / tasks に書かれていない。振る舞い不変の検証として「既存 280 テスト全 PASS」だけでは snapshot 一致を担保できない | tasks.md Section 7 に「snapshot 検証は既存 `tests/cli-stdout-snapshot.test.ts` を `npm test` で実行し、`--update-snapshot` 無しで PASS することを完了条件とする」を明記する。design.md の制約節にも同等の記述を追加する。snapshot baseline 更新が必要な場合は別途 task 化し、その rationale を design に明記する |
| 2 | HIGH | consistency | request.md:23, proposal.md:9, design.md:7, tasks.md:48-59 | `src/core/pipeline.ts` を「sibling file 残存 / placeholder index.ts + sibling file は ADR-module-architecture-style D7 違反」と記述しているが、実態は `runPipeline` / `runProposePipeline` の **production 関数本体**（93 LOC）を持つファイルであり、`src/cli/run.ts:6` から直接 import されている。`src/core/pipeline/index.ts` は `Pipeline` クラスと `Transition` 型のみ export しており、`runPipeline` 関数を再 export していない。tasks 4.2「import を `src/core/pipeline/` ディレクトリ経由に書き換える」だけでは破綻する（移行先で `runPipeline` が解決できない）。design D3 の完了条件「`src/core/pipeline/` ディレクトリ経由の import のみが残る」を達成するには、(a) `runPipeline` / `runProposePipeline` を `src/core/pipeline/` 配下のいずれかのファイル（例: `src/core/pipeline/run.ts`）に移動 (b) `src/core/pipeline/index.ts` から re-export (c) call site の import 書き換え、の 3 段階が必要 | design.md D3 を以下に書き換え: 「`src/core/pipeline.ts` の `runPipeline` / `runProposePipeline` 関数本体を `src/core/pipeline/run.ts` に移動し、`src/core/pipeline/index.ts` から re-export する。call site (`src/cli/run.ts`, `tests/spec-review-fetch.test.ts`) の import path を `src/core/pipeline/index.js` 経由に書き換える。`src/core/pipeline.ts` を削除する。これら 4 操作を 1 commit で完結させる」。tasks.md 4.x もこの 4 段階に再構成する。proposal.md / request.md の「placeholder index.ts + sibling file」「D7 違反」表現は事実誤認のため「`runPipeline` 関数本体が `src/core/pipeline.ts` に取り残されており、directory-form 移行が未完結である」に修正 |
| 3 | MEDIUM | completeness | tasks.md:30-46 (Section 3), design.md:58-71 (D2) | `@deprecated` 4 段階分類のうち (d) field（`RawConfig.agent` 等）の判定基準が「`migrate.ts` での扱いを確認してから削除」となっているが、確認結果として何が削除可能 / 不可能 / 要 migration update のどれに該当するかの decision tree が design に書かれていない。`src/config/schema.ts:80` の `RawConfig.agents` legacy field は migration が前提なので、migration 完結条件（旧 config を `agents.propose` に書き換えて persist 済か）の確認手順が必要 | design.md D2 に (d) field の判定 decision tree を追記: 「`src/config/migrate.ts` で legacy field → new field への書き換え + persist が **load 時に常に発火する**ことを確認したら field 削除可能。発火条件付き（特定 version 等）の場合は条件解消まで待機」。tasks.md 3.6 を「migrate.ts の発火条件を grep で確認し、無条件 migration なら field 削除、条件付きなら implementation-notes.md に記録して残す」に詳細化する |
| 4 | MEDIUM | consistency | proposal.md:14-25, design.md:14-19 | `src/core/pipeline.ts` の現状認識が proposal / design の文脈で「PR #26 で transition table を directory-form に移行する際に sibling 削除漏れ」と書かれているが、実際には `runPipeline` 関数本体が pipeline.ts に残っているため「sibling 削除漏れ」ではなく「関数移動が未完了」が正しい。HIGH #2 の事実誤認と連動して proposal / design の Why セクションが誤った前提に立っている | proposal.md「## Why」と design.md「## Context」の `pipeline.ts` 関連記述を「`runPipeline` / `runProposePipeline` 関数本体が `src/core/pipeline.ts` に残置され、`src/core/pipeline/` ディレクトリへの完全移行が未完了。ADR-20260429-module-architecture-style D7 (directory-form 移行は sibling 削除を含めて 1 commit) に沿って関数移動 + re-export + 旧ファイル削除を 1 commit で完結させる」に修正 |
| 5 | MEDIUM | feasibility | design.md:99-110 (D5), module-analysis.md:43, 105-109, tasks.md:90-100 | `fetchSpecReviewResult` legacy fallback の整理が「調査して判断」止まりで、design 段階で判断材料が出揃っていない。module-analysis.md は executor.ts:818-829 の分岐により `deps.githubClient` がある場合 fallback は経由されないと記載しているが、`tests/spec-review-fetch.test.ts` は `fetchSpecReviewResult` を直接呼んでおり、削除すると test 4 件（TC-012/013/014/015）が壊れる。さらに module-analysis.md は `verifyBranchLegacy` / `verifyChangeFolderLegacy` の削除（134 LOC 削減見込み）も併記しているが、これが request の対象範囲かどうかが request.md / proposal.md / design.md のいずれにも明示されていない（要件 5 の文面は `fetchSpecReviewResult` のみに見える） | design D5 に判断結果を確定的に書く: 「`tests/spec-review-fetch.test.ts` の TC-012/013/014/015 が `fetchSpecReviewResult` を直接呼ぶため、関数 export は維持する。production 経路 (executor.ts:818-829) は `deps.githubClient` 必須化により fallback を削除する。test は port 経由に書き換える」または「現状維持」のいずれかを 1 結論で固定する。`verify*Legacy` 削除は本 request のスコープに含めるか / 別 request に切るかを request.md の「対象範囲」または「スコープ外」セクションに明示する |
| 6 | MEDIUM | completeness | design.md:46-57 (D1), tasks.md:11-24 (Section 2) | helper 抽出後の LOC 目標「750-800 LOC 以下」が module-analysis.md の推奨 helper 5 個（#1-#5）を全て抽出した場合の見積として妥当か確認されていない。module-analysis.md は `verify*Legacy` 削除で 134 LOC 削減すると 900 - 134 = 766 LOC、helper 抽出だけだと寄与は LOC 削減ではなく cohesion 改善（行数はあまり減らない）と読める。tasks.md 2.6 で「750-800 LOC 以下」を完了条件にすると、helper 抽出だけでは未達となり request 要件 1 が満たせない可能性 | design D1 に「目標 LOC 750-800 の達成シナリオ」を 2 通り書く: (a) helper 抽出のみで達成可能か module-analysis.md の見積で確認 (b) `verify*Legacy` 削除を含めて達成、含めない場合は LOC 目標を 800-850 に緩める。tasks.md 2.6 の完了条件はこの decision に整合させる |
| 7 | LOW | consistency | tasks.md:1-9 (Section 1) | Section 1 が「module-analysis を tasks に下ろす（前提タスク）」となっているが、本 spec-review 時点で既に module-analysis.md が生成されており、Section 1 のタスク 1.1-1.3 は「Section 2 の helper 名 / 境界 / 引数を具体化する」と書かれている。実際には Section 2 の 2.2.1 / 2.2.2 で `prepareSessionForStep` / `recordStepCompletion` が候補名として記載されており、module-analysis.md の推奨（`createSessionWithHistory` / `recordFailedStepResult` / `attachStateAndRethrow` / `throwWrappedError` / `failStepWithError`）と命名が乖離している。Section 1 で具体化する前提で Section 2 が「候補名」のまま残ると、implementer が Section 2 の候補名を採用してしまうリスク | Section 2 の 2.2.1 / 2.2.2 の括弧書き「候補名: ...」を削除するか、module-analysis.md の推奨と整合した名前に置き換える。Section 1 のタスク 1.2 の出力先を「Section 2 の helper 名 / 境界 / 引数を module-analysis.md の推奨で具体化（current: 仮置き）」と明記する |
| 8 | LOW | maintainability | design.md:130-133 (Open Questions) | Open Questions に「module-architect の analysis 完了前は具体的な helper 名を確定できない」と書かれているが、module-analysis.md は既に生成済みで、helper 名と署名が決定している。design.md の Open Questions が古い状態になっており、レビュアーが「未確定事項あり」と誤読する余地が残る | Open Questions を「module-analysis.md 生成済み（決定の章を Section 1 で tasks に下ろす）」と更新するか、解消済として削除する。`fetchSpecReviewResult` の Open Question は MEDIUM #5 の対応で D5 に統合される |

## Iteration Comparison

（iteration 1 のため記載なし）

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 6.82 | needs-fix | initial review — HIGH 2 件（snapshot 検証手段未定義 / pipeline.ts の事実誤認） |

## Convergence

- **trend**: — (初回)
- **recommendation**: continue (spec-fixer による修正後に再レビュー)

## Summary

refactoring 軽量構成（architect + spec-reviewer）でレビューした。design / tasks / proposal は learned-patterns の lesson（grep ベース完了判定 / 1 commit migration / module-analysis を tasks に下ろす）を構造的に遵守しており、スコアリングは pass threshold 7.0 ぎりぎりだが、HIGH 2 件で verdict は `needs-fix`。

主な blocking findings:

1. **`pipeline.ts` の現状認識が事実誤認** (HIGH #2): `src/core/pipeline.ts` は production 関数 `runPipeline` / `runProposePipeline` の本体を持つファイルで、純粋な sibling 削除では完了しない。proposal / design / request の Why と D3 の段取りを「関数を `pipeline/` 配下に移動 → re-export → call site 書き換え → 旧ファイル削除」の 4 段階に修正する必要がある。
2. **snapshot 検証の完了条件が未定義** (HIGH #1): `tests/cli-stdout-snapshot.test.ts` の baseline が helper 抽出後 / `@deprecated` 削除後にどう扱われるかが design / tasks のいずれにも明記されておらず、振る舞い不変の検証が機械化されていない。

その他、`@deprecated` 4 段階分類の (d) field decision tree、`fetchSpecReviewResult` legacy fallback の判断確定、helper 名の Section 2 記述更新、LOC 目標の達成シナリオ明示が MEDIUM/LOW で残る。

spec-fixer が HIGH 2 件と MEDIUM 4 件を修正すれば iteration 2 で `approved` 到達見込み。
