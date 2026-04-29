# Spec Review Result — Iteration 002

## Meta

- **request**: 2026-04-29-spec-fixer-iteration-loop
- **iteration**: 2
- **type**: new-feature
- **agents-run**: architect (only; security-reviewer / pattern-reviewer not enabled per pipeline-context.md)
- **emphasis**: Managed Agents 制約への構造的対処、Pipeline 層の loop プリミティブ設計、JobState 互換性、Author-Bias Elimination
- **prev-result**: openspec-workflow/requests/active/2026-04-29-spec-fixer-iteration-loop/spec-review-result-001.md

## Verdict

- **verdict**: approved

## Summary

iter=1 で指摘した HIGH 4 件・MEDIUM 6 件・LOW 3 件のすべてに対し、spec-fixer が delta spec / design.md / tasks.md を更新し、構造的な解消を確認した。特に重要な解消は以下:

- `appendStepResult` の意味反転問題は、新ヘルパを `pushStepResult` にリネームし、既存 merge-style `appendStepResult` を本 delta で削除する旨を job-state-store spec / design D7 / tasks 2.3 に明記（finding #1 解消）
- `PipelineDeps` を `src/core/types.ts` に切り出して循環 import を構造的に防ぐ Requirement を pipeline-orchestrator spec に追加し、tasks 4.0 に作業項目を新設（finding #4 解消）
- spec-review-session delta 冒頭に「Array-Compatibility Note」を追加し、carry-over Requirements 4 件が配列化に対し意味的変更不要であることを宣言（finding #2 解消）
- spec-fixer の push 失敗検知は次 iter の spec-review に委ねる方針を新 Requirement として明文化、`SPEC_FIXER_PUSH_INCOMPLETE` を導入しないという設計合意を spec レベルで固定（finding #3 解消）
- Session Lifecycle Helper（`runManagedAgentSession`）を design.md の専用セクションと tasks 5.0 で明文化し、80 行重複の三重化を防ぐ構造を確立（finding #7 解消）
- `config.agent.id` の Deprecation Plan を design.md に専用セクションとして追加、削除条件・移行スクリプト要否・version バンプ基準を明示（finding #6 解消）

regression は観測されず、新規の HIGH/CRITICAL findings も発生していない。Total スコアは 6.85 → 8.85 へ +2.00 改善し、pass threshold 7.0 を上回る。

## Convergence Trend

- **trend**: improving
- **delta**: +2.00（6.85 → 8.85）
- 前回の must-fix（HIGH 4 件）はすべて解消、MEDIUM 6 件・LOW 3 件もすべて解消済み。

## Consolidated Findings

iter=2 で残存する findings は以下のとおり。すべて承認阻止条件（CRITICAL/HIGH）に該当しない。

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | maintainability | openspec/changes/2026-04-29-spec-fixer-iteration-loop/specs/spec-review-session/spec.md:1-13 | Array-Compatibility Note は本 delta の冒頭で carry-over Requirements の解釈を宣言する有効な手段だが、OpenSpec v1.3.1 の delta フォーマット規約上、`## ADDED Requirements` / `## MODIFIED Requirements` / `## REMOVED Requirements` 以外の見出しが許容されるかは明示されていない。archive 時に openspec validate がこの section を unknown として警告する可能性が残る（規約への抵触は確認できないが drift リスク）。 | OpenSpec validator がこの形式を受け入れることを `openspec validate --strict openspec/changes/2026-04-29-spec-fixer-iteration-loop` でローカル確認するか、もしくは本文を `## MODIFIED Requirements` の冒頭に「以下の 4 既存 Requirement は配列化に対し意味的変更不要であり、Scenario 内の `state.steps["spec-review"].verdict` は今後 `getLatestStepResult(state, "spec-review").verdict` として解釈する」を 1 段落だけ書く形に統合しても同等の効果が得られる。 |
| 2 | LOW | completeness | openspec/changes/2026-04-29-spec-fixer-iteration-loop/specs/job-state-store/spec.md:75-83 | Requirement「`state.error.code = SPEC_REVIEW_RETRIES_EXHAUSTED` は retry 上限到達を示す」の hint テンプレートで `<NNN>` プレースホルダはどの iteration 番号を指すかが Scenario レベルで例示されていない。実装時に `<NNN>` を「最終 iteration」と読むか「最初に needs-fix を返した iteration」と読むかで解釈が分かれる可能性がある（design D8 の `onExceeded` 擬似コードでも具体例なし）。 | Scenario「retries exhausted の状態」末尾に「hint 文字列の `<NNN>` は最終 iteration（`state.steps["spec-review"]` 末尾要素の `iteration`）の 3 桁ゼロ埋めを採用する」と 1 行追記する。または design D8 の onExceeded ブロックに `String(state.steps["spec-review"].at(-1)?.iteration ?? maxRetries).padStart(3, "0")` 相当のコメントを追加する。 |
| 3 | LOW | maintainability | openspec/changes/2026-04-29-spec-fixer-iteration-loop/specs/spec-fixer-session/spec.md:79-93 | 「spec-fixer の push 失敗検知は次 iter の spec-review に委ねる」Requirement の Scenario「push 失敗が retry 上限まで繰り返された場合」では `SPEC_REVIEW_RETRIES_EXHAUSTED` 経由で吸収されるとあるが、push 失敗が検出されないまま spec-review が「change folder の修正コミットが見えない」状態を `needs-fix` と判定する経路と、そもそも spec-review が前回の iter と同じ findings を再生する経路の区別が Scenario 上で曖昧。実装側が「push 未完了であっても spec-review がたまたま approved を返したら成功扱いになる」現象を見落とすリスクがある。 | spec-fixer-session の当該 Requirement に Scenario「push 失敗かつ spec-review が approved を返した場合」を追加し、CLI スコープ外の事象として扱うか、または spec-review 側に「修正コミットが反映されていない場合の判定基準」を追加するかを明示する。design D11 の Trade-off として「push 失敗 + approved の偶発的成功は本 request では許容する（運用で観測する）」を明文化することでも整合する。 |

## Severity Summary

- CRITICAL: 0
- HIGH: 0
- MEDIUM: 0
- LOW: 3

CRITICAL = 0 かつ HIGH = 0 のため、verdict は `approved` 候補。Total スコアも pass threshold 7.0 を上回るため `approved`。

## Category Scores (architect single-reviewer)

architect が単独で全カテゴリを評価する（spec-reviewer / security-reviewer / pattern-reviewer は本 request で enabled でない）。

| Category | Score | Weight | 寄与 | Note |
|----------|-------|--------|------|------|
| completeness | 9 | 0.30 | 2.70 | 受け入れ基準 10 項目 + push 失敗委任 + ps 旧形式経路 + loop persist 責務がすべて Requirement / Scenario に明文化された。残るのは `<NNN>` プレースホルダの解釈余地のみ |
| consistency | 9 | 0.25 | 2.25 | spec-review-session の Array-Compatibility Note 追加で carry-over Requirements の整合が宣言され、`{NNN}` vs `<NNN>` 表記の役割（テンプレート vs プレースホルダ）が分離された。Deprecation Plan で `config.agent.id` の出口戦略も明示 |
| feasibility | 9 | 0.20 | 1.80 | `runManagedAgentSession` ヘルパ抽出と `PipelineDeps` の `types.ts` 切り出しにより、実装段階での重複・循環 import リスクが構造的に排除された。tasks 0 / 4.0 / 5.0 の追加で実装順序も明確化 |
| security | 8 | 0.15 | 1.20 | spec-fixer Agent の Custom Tools 不在不変条件 + post-init 検証で null/undefined/[] のすべてを許容する Scenario 追記 + `<user-request>` XML タグ防御。SDK retrieve の挙動への robust 化が完了 |
| maintainability | 8 | 0.10 | 0.90 | `pushStepResult` リネーム + 既存 merge 版削除明記、stdout フォーマット正規定義の所有権を pipeline-loop-primitive に集約、test 配置規約を tasks 章頭に固定。残るのは Array-Compatibility Note の OpenSpec validator 互換確認のみ |

**Total**: 2.70 + 2.25 + 1.80 + 1.20 + 0.90 = **8.85** (pass threshold 7.0 達成)

## Iteration Comparison

### Improvements (前回から改善)

| # | Severity (prev) | 解消内容 |
|---|---|---|
| 1 | HIGH | `appendStepResult` を `pushStepResult` にリネームし既存 merge 版を本 delta で削除する旨を job-state-store spec / design D7 / tasks 2.3 に追記。pair ヘルパとして `getLatestStepResult` を `src/state/helpers.ts` に同居 |
| 2 | HIGH | spec-review-session delta 冒頭に Array-Compatibility Note を追加。carry-over Requirements 4 件が配列化に対し意味的変更不要と宣言、Scenario 解釈規則を明示 |
| 3 | HIGH | spec-fixer-session に「push 失敗検知は次 iter の spec-review に委ねる」新 Requirement を追加、`SPEC_FIXER_PUSH_INCOMPLETE` は導入しない設計合意を spec レベルで固定。Scenario 2 件で push 失敗時の挙動を明示 |
| 4 | HIGH | tasks 4.0 に `src/core/types.ts` 新設タスクを追加、pipeline-orchestrator spec に「PipelineDeps の正規ロケーション」Requirement を新設、design D8 にも切り出し記述を追加 |
| 5 | MEDIUM | pipeline-loop-primitive の Requirement「body は必ず new state を返す」に「永続化（writeJobState）の責務は body 内の step 関数にある」を追記、Scenario「runLoopUntil は writeJobState を呼ばない」を新設、design D8 擬似コードにコメント追加、tasks 4.3 / 5.7 / 7.6 と整合 |
| 6 | MEDIUM | design.md「Deprecation Plan for `config.agent.id`」section 新設。削除条件 2 つ、移行スクリプトの要否、`config.version` バンプ基準を明示 |
| 7 | MEDIUM | design.md「Session Lifecycle Helper Extraction」section 新設、`runManagedAgentSession` のシグネチャと責務範囲を固定。tasks 5.0 を新設し、5.4 / 5.5 と 6.1 がヘルパ呼び出しに置換される旨を明記 |
| 8 | MEDIUM | spec-fixer-session に「spec-fixer が修正不能と判断した findings は deferred メモで記録し retry 上限に委ねる」新 Requirement を追加、retry 上限（`SPEC_REVIEW_RETRIES_EXHAUSTED`）で吸収される設計合意を固定 |
| 9 | MEDIUM | job-state-store spec に Scenario「`specrunner ps` 経由での旧形式読み込み（書き込みなし経路）」を新設、stderr 警告 (`Warning: state file uses legacy format; ...`) を要件化、design Migration Plan 3 に注記追記 |
| 10 | MEDIUM | hint 文字列を `spec-review-result-<NNN>.md` に統一（design.md / job-state-store spec / tasks 7.4）、テンプレート (`{NNN}`) とプレースホルダ (`<NNN>`) の役割を分離 |
| 11 | LOW | pipeline-loop-primitive に新 Requirement「stdout 進捗フォーマットの正規定義は pipeline-loop-primitive spec にある」追加、pipeline-orchestrator spec に「フォーマット文字列を再定義してはならない」MUST NOT を追加して所有権を集約 |
| 12 | LOW | tasks.md 章頭に「## 0. 規約」を新設し、テストファイル配置規約 `test/<source-file-path>.test.ts` を明記 |
| 13 | LOW | agent-environment-bootstrap spec の Scenario「post-init 検証」に null/undefined/[] のすべてを「空」とみなし `register_branch` 文字列の不在のみを検証する旨を明記、tasks 3.6 にも厳密比較回避の指示を追加 |

### Regressions (前回から悪化)

なし。新規 finding 3 件はいずれも LOW で承認阻止要因に該当せず、前回の Findings に存在しなかった軽微な指摘である。

### Unchanged Issues

なし。前回の must-fix（HIGH 4 件）はすべて解消済み。前回の Findings 13 件すべてが解消されている。

## Next Action

verdict が `approved` のため:

1. 本 request は spec-review loop を脱出し、後続の implementer / code-review フェーズへ進む。
2. iter=2 で観測された LOW 3 件は、本 request 完了後の運用で対応するか、または implementer フェーズで該当箇所を編集する際にあわせて解消する。実装段階で `<NNN>` の解釈は最終 iteration を採用すること（finding #2 の推奨）を踏襲する。
3. spec-fixer は本 iter で modifications を完了しており、追加修正は不要。
