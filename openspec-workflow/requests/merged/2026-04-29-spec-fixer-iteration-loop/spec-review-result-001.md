# Spec Review Result — Iteration 001

## Meta

- **request**: 2026-04-29-spec-fixer-iteration-loop
- **iteration**: 1
- **type**: new-feature
- **agents-run**: architect (only; security-reviewer / pattern-reviewer not enabled per pipeline-context.md)
- **emphasis**: Managed Agents 制約への構造的対処、Pipeline 層の loop プリミティブ設計、JobState 互換性、Author-Bias Elimination

## Verdict

- **verdict**: needs-fix

## Summary

設計の骨格（spec-fixer 専用 Agent / Pipeline 層 runLoopUntil / config の `agents.{propose, specFixer}` 拡張 / `JobState.steps` 配列化）は要件を網羅し、Managed Agents 制約と Author-Bias Elimination の両方に構造的に対処している。decision の trade-off も妥当。

ただし以下が承認阻止要因として残る:

1. `appendStepResult` のシンボル名がサイレントに意味反転する設計（既存呼び出し側 8 箇所が型は通る一方で挙動が壊れる可能性）
2. `spec-review-session` 既存 spec の Scenario が新形式 `spec-review-result-{NNN}.md` への移行に対応していない（legacy `spec-review-result.md` を参照したまま）
3. spec-fixer の commit + push 失敗時のセマンティクスが design / spec で明文化されていない
4. PipelineDeps の独立モジュール化（module-architect 決定）が tasks.md / design.md に取り込まれておらず、実装段階で pipeline.ts ↔ loop.ts の循環 import が再発するリスク

これらは HIGH severity の correctness / consistency / completeness 系であり、spec-fixer に修正を委ねる。

## Convergence Trend

- 初回 iteration のため比較対象なし。

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | correctness | openspec/changes/2026-04-29-spec-fixer-iteration-loop/specs/job-state-store/spec.md:55 | `appendStepResult` ヘルパの名前が既存実装（`src/state/schema.ts:135` の merge update）と衝突する。同名で「merge」→「array push」に意味反転すると、`src/core/steps/propose.ts` L133/179/233/376 と `src/core/steps/spec-review.ts` L236/261/288 の既存呼び出し側 7 箇所が型チェックは通るのに振る舞いが壊れるサイレントヒューマンエラーの温床になる。module-analysis.md 4.3 でも同観点が指摘済み。 | spec の `appendStepResult` を `pushStepResult(state, stepName, partial)` にリネームし、Requirement と Scenario も同名に揃える。tasks.md 2.3 と design D7 の `appendStepResult` 表記も同様に置換する。`getLatestStepResult` と併設する形にして、既存の merge 版 `appendStepResult` は削除する旨を delta に明記する。 |
| 2 | HIGH | consistency | openspec/changes/2026-04-29-spec-fixer-iteration-loop/specs/spec-review-session/spec.md | spec-review-session の delta は `MODIFIED Requirements` で 3 件のみ変更している（verdict ファイル取得 / 初回メッセージ / フェイルセーフ）。しかし、既存 spec `openspec/specs/spec-review-session/spec.md` には「spec-review セッションは標準ツールのみで作成される」「architect + spec-reviewer の役割を 1 セッションで担う」「sessions.retrieve() ポーリングで検知する」「独立した timeout を持つ」の 4 件が残っており、これらの中で `spec-review-result.md`（legacy 単一ファイル名）への参照は無いものの、Scenario の verdict 記録形式（state.steps["spec-review"].verdict が単一オブジェクト前提）が新形式（配列末尾要素）と矛盾する。 | spec-review-session delta に「architect + spec-reviewer の役割」「sessions.retrieve ポーリング」「独立 timeout」の 3 Requirement の MODIFIED を追加し、Scenario 内の `state.steps["spec-review"].verdict` を `state.steps["spec-review"][i].verdict` または `getLatestStepResult(state, "spec-review").verdict` に統一する。または、明示的に「これらの Requirement は array 化に対し意味的に変更不要」と delta の冒頭に記し、影響範囲が網羅済みであることを示す。 |
| 3 | HIGH | completeness | openspec/changes/2026-04-29-spec-fixer-iteration-loop/specs/spec-fixer-session/spec.md | spec-fixer の `git commit && git push` が標準ツール経由で行われる前提（design D9 / D11）だが、push 失敗時の挙動が spec で明文化されていない。具体的には: (a) push 失敗を spec-fixer step がどう検知するか（session 完了時に commit が push されたか確認する手段が無い）、(b) push 失敗時 state.steps["spec-fixer"][i].error.code に何を入れるか（`SPEC_FIXER_PUSH_FAILED` 等の新規 code が必要）、(c) push 失敗時に loop が次 iter の spec-review を起動して空振りするのか即 escalation するのか、いずれかが Requirement / Scenario として残っていない。design D11 は「失敗自体は次 iter の spec-review に再評価を委ねる」と書くが spec には現れていない。 | spec-fixer-session delta に新 Requirement「spec-fixer session 完了時に対象ブランチへの push 結果を検証する」を追加し、Scenario として「push 未完了で session が idle になった場合、state.steps["spec-fixer"][i].error.code = SPEC_FIXER_PUSH_INCOMPLETE を記録し、state.status を failed にする」を書く。または、push 検証は CLI 側責務ではなく次 iter の spec-review が「ブランチに修正コミットが現れない findings」を観測して `escalation` を出す前提なら、その前提を spec-fixer-session delta の冒頭に明記し、design D11 の「失敗自体は次 iter の spec-review に再評価を委ねる」と整合させる。 |
| 4 | HIGH | architecture | openspec/changes/2026-04-29-spec-fixer-iteration-loop/specs/pipeline-orchestrator/spec.md / openspec/changes/2026-04-29-spec-fixer-iteration-loop/specs/pipeline-loop-primitive/spec.md / openspec/changes/2026-04-29-spec-fixer-iteration-loop/tasks.md | module-architect の decision (`decisions/module-architect.md` 行 1) で「`PipelineDeps` を `src/core/types.ts` に切り出して pipeline.ts と loop.ts の循環 import を防ぐ」と明示されているが、spec / design / tasks のどこにも該当作業が記述されていない。design D1 の `runLoopUntil` シグネチャは `PipelineDeps` を引数に取るため、新設 `src/core/loop.ts` が `pipeline.ts` から `PipelineDeps` を import すると、`pipeline.ts` が `loop.ts` から `runLoopUntil` を import する設計（D8）と組み合わさって循環 import になる。 | tasks.md 4 章の冒頭に「4.0 `src/core/types.ts` を新設し `PipelineDeps` を切り出す。`src/core/pipeline.ts` と `src/core/loop.ts` と `src/core/steps/*.ts` のすべてを新パスから import するよう更新する」を追加する。design.md D8 の loop シグネチャ説明にも `src/core/types.ts` への切り出しに 1 行触れる。pipeline-orchestrator delta の「step 関数は src/core/steps/ 配下に配置される」Requirement に類する形で「PipelineDeps の正規ロケーションは src/core/types.ts」を Requirement / Scenario として加える。 |
| 5 | MEDIUM | completeness | openspec/changes/2026-04-29-spec-fixer-iteration-loop/specs/pipeline-loop-primitive/spec.md / openspec/changes/2026-04-29-spec-fixer-iteration-loop/specs/pipeline-orchestrator/spec.md | loop プリミティブが各 iteration 完了時に `writeJobState(state)` を直接呼ぶか、step 内に責務を委ねるかが明文化されていない。pipeline-orchestrator delta「runPipeline は state ファイルを single source of truth として扱う」では「同一 iter の中での spec-fixer 完了後・spec-review 完了後を含む」と書かれているが、これが loop プリミティブ自身か、step 関数の責務（`appendStepResult` 後に persist 必須）かが定まっていない。design D8 のサンプルコードでも persist 呼び出しは可視化されていない。implementer が loop と step の両方で persist を書くと冗長になる。 | pipeline-loop-primitive delta に Requirement「`runLoopUntil` 自体は state.history の append のみ行い、`writeJobState` は body 内 step 関数の責務として委ねる」を追加（または逆に「loop プリミティブが各 iter 完了時に persist する」と書く）。design D8 の擬似コードに persist 呼び出しを 1 行追加する。tasks.md 4.3 / 5.7 / 6.1 と整合させる。 |
| 6 | MEDIUM | consistency | openspec/changes/2026-04-29-spec-fixer-iteration-loop/specs/cli-config-store/spec.md | `agent.id` (legacy) の deprecation 出口戦略が spec / design に欠落している。`agents.propose` と `agent` を dual-write する規約（D6 / cli-config-store delta「config 書き込みは新形式と legacy 形式を両方更新する」）は明示されているが、deprecate を解除する条件、削除する別 request の起点、削除時に既存 config をどう migrate するかは Open Questions / 補足にも書かれていない。design.md の Risks / Trade-offs に「Trade-off: `config.agent.id` の deprecated 化を即時行わない」とあるが「将来の clean-up request で削除する前提」止まりで、いつ・誰が・どう判定するかが空白。 | design.md に新 section「Deprecation Plan for `config.agent.id`」を追加し、(a) 削除条件（例: spec-runner Phase 2 GA 時 / 既存 user の N% が新形式に移行した時 / 別 request 「config-cleanup」で実施）、(b) 移行スクリプトの要否、(c) `config.version` を `2` にバンプするかの判断基準、を明記する。または、cli-config-store delta の Open Questions として 1 点に絞って残す（本 request スコープ外を明示）。 |
| 7 | MEDIUM | maintainability | openspec/changes/2026-04-29-spec-fixer-iteration-loop/design.md / openspec/changes/2026-04-29-spec-fixer-iteration-loop/tasks.md | module-analysis.md 2.1 / 4.4 で推奨されている「`runManagedAgentSession` ヘルパに session 作成〜poll〜終了判定を集約する」（module-architect の decision 行 3 でも採用）が、design / tasks に取り込まれていない。tasks 5.4 / 5.5 が spec-fixer 内で session ライフサイクルを 80 行相当再実装する形に見え、spec-review.ts の同等コードと三重化（propose / spec-review / spec-fixer）するリスクがある。本 request は「Step interface 抽象化はスコープ外」だが、ヘルパ抽出は spec-fixer 実装時に「どのみち重複するな」と判明したヘルパとして局所的に抽出して構わない（request.md 補足）と明文化されている。 | design.md に新 section「Session Lifecycle Helper Extraction」を追加し、`runManagedAgentSession({ agentId, environmentId, repo, githubToken, initialMessage, timeoutMs, stepName })` の責務範囲（session create + events.send + pollUntilComplete + terminated/timeout 分岐）を spec / step の境界として固定する。tasks.md に 0.x または 5.0 として「`src/core/session-runner.ts` を新設する」を追加し、5.4 / 5.5 はヘルパ呼び出しに置換する形にする。または明示的に「本 request では抽出しない」と Open Questions に書く。 |
| 8 | MEDIUM | feasibility | openspec/changes/2026-04-29-spec-fixer-iteration-loop/specs/spec-fixer-session/spec.md | spec-fixer の system prompt は「修正不能 findings に対しては proposal.md / design.md 末尾に `<!-- spec-fixer-deferred: ... -->` メモを残し、それ以外を可能な限り修正してください」（design D9）と指示するが、spec-fixer 自身が「修正不能」と判定する基準（findings の Description が抽象すぎる場合・既存 spec との矛盾を含む場合 等）が明確化されていない。次 iter の spec-review が deferred メモを承認するか拒否するかの判定基準も定まらず、retry 上限到達まで無限ループする経路が成立する。 | spec-fixer-session delta に Scenario 「spec-fixer が deferred メモを残した場合、次 iter の spec-review はメモを `LOW` 以下の severity の場合のみ許容する」を追加するか、または design Open Questions の 2 点目「spec-fixer が修正不能と自己判断した場合の早期 escalation ルート → 本 request では実装せず、retry 上限まで回す」を spec / Risks の両方に明示し、retry 上限到達時の挙動 (`SPEC_REVIEW_RETRIES_EXHAUSTED`) で吸収されることを設計上の合意として固定する。 |
| 9 | MEDIUM | completeness | openspec/changes/2026-04-29-spec-fixer-iteration-loop/specs/job-state-store/spec.md:5 | 状態ファイルの旧形式（`steps[stepName]` がオブジェクト）を読み込み時に `[{ ...obj, iteration: 1 }]` に正規化する SHALL は明記されているが、書き込み側で migration を保証する Requirement / Scenario が欠落している。Scenario「旧形式の状態ファイル（オブジェクト）の読み込み」末尾に「次回書き込み時は配列形式で永続化される」と書かれているが、これは読み込み層の self-healing に依存しており、状態ファイルが書き込まれずに読み込みのみ繰り返されるケース（`specrunner ps`）で migration が行われない。 | job-state-store delta に Scenario「旧形式 ps 経路では state ファイルの書き込みが発生しないため migration されない」を追加し、`specrunner ps` が旧形式を観測した場合に warning を stderr に出すか、または migration を自動で書き込むかを明示する。alternatively、design.md Migration Plan の 3 番目「state file 読み込み層に正規化を入れる（旧オブジェクト形式 → 長さ 1 の配列）」に「読み込み層は in-memory のみで正規化し、書き込み発生時に永続化される」と注記する。 |
| 10 | MEDIUM | consistency | openspec/changes/2026-04-29-spec-fixer-iteration-loop/specs/job-state-store/spec.md:5 / openspec/changes/2026-04-29-spec-fixer-iteration-loop/specs/cli-config-store/spec.md:5 / openspec/changes/2026-04-29-spec-fixer-iteration-loop/specs/spec-review-session/spec.md | iteration 数のフォーマットが文書間で揺れている。spec-review-session delta は `spec-review-result-{NNN}.md`（3 桁ゼロ埋め）と明記、design D8 / D10 / D11 / pipeline-orchestrator delta も `{NNN}` を採用。一方で job-state-store delta「spec-review verdict の記録（新形式）」Scenario は `spec-review-result-001.md` と具体例で書く。tasks 6.2 は「3 桁ゼロ埋め」と書く。これらは整合しているが、spec-fixer-session delta 「spec-fixer step は直前の spec-review iteration の findingsPath を入力に取る」Scenario の例 `spec-review-result-001.md` も整合している。一方、design.md「Migration Plan」は `spec-review-result-N.md` と書き（{NNN} ではない）、`state.error` の hint も「Review spec-review-result-N.md」と書かれている（job-state-store delta も同じ）。`N` と `{NNN}` の混在で「ファイル名の N が iteration 番号そのものか 3 桁ゼロ埋めか」が読み手に伝わりにくい。 | hint メッセージ等の自然文では `N` を許容するが、ファイル名そのものを参照する箇所はすべて `{NNN}` または「3 桁ゼロ埋めの iteration」に統一する。具体的には design.md Migration Plan の `spec-review-result-N.md`、`state.error.hint` の文字列を `spec-review-result-<NNN>.md`（または「該当 iteration の spec-review-result ファイル」）に統一する。job-state-store delta `state.error.code = SPEC_REVIEW_RETRIES_EXHAUSTED` の hint も同様。 |
| 11 | LOW | maintainability | openspec/changes/2026-04-29-spec-fixer-iteration-loop/specs/pipeline-loop-primitive/spec.md:46 | iteration progress stdout のフォーマット文字列がレビュー対象 spec / design / tasks の複数箇所に散在しており、文字列リテラルの spec 単一導出が崩れている。pipeline-loop-primitive Requirement「`runLoopUntil` は state.history に loop entry を append する」と pipeline-orchestrator Requirement「runPipeline は iteration progress を stdout に逐次出力する」が同じフォーマットを別々に正規化している。 | pipeline-loop-primitive delta に「loop が出力する stdout フォーマットの正規定義はこの spec のみとする」と注記し、pipeline-orchestrator delta は pipeline-loop-primitive を参照する形にする。または逆に、stdout フォーマットを pipeline-orchestrator に集約し、pipeline-loop-primitive は「loop が stdout 出力責務を持つ」のみ記述する。両 spec で文字列例を同期保守する規約は将来の drift を生む。 |
| 12 | LOW | maintainability | openspec/changes/2026-04-29-spec-fixer-iteration-loop/tasks.md:8 | tasks 1.6 / 1.7 / 2.5 / 4.5 / 4.6 / 5.8 / 5.9 / 6.5 / 7.7 / 7.8 でユニットテストの粒度が並ぶが、receiving モジュール（`getAgentId.ts` / `loop.ts` / `steps/spec-fixer.ts` 等）の bun:test 配置が tasks に明示されていない。spec-runner の既存規約（`test/` 直下 or co-located `*.test.ts`）への配置先を tasks の冒頭で固定しないと、test ファイルの所在が PR レビュー時に発散する。 | tasks.md 章頭または 1.0 等に「ユニットテストは `test/` 直下に `<source-file-path>.test.ts` として配置する（既存規約と一致）」を追加する。または、各 task の test 行に明示的な配置パスを書く。 |
| 13 | LOW | feasibility | openspec/changes/2026-04-29-spec-fixer-iteration-loop/specs/agent-environment-bootstrap/spec.md | post-init 不変条件 (a)-(f) の (e) で「spec-fixer Agent の `custom_tools` が空配列」と書かれているが、Anthropic API の retrieve 結果で `custom_tools` が `null` か `undefined` か `[]` のいずれで返るかは SDK 実体（review-lessons の「外部 SDK の型定義・イベント構造（`.d.ts` レベル）が事前調査されているか」）で確認する必要がある。検証経路が `=== []` 比較なら null / undefined を取りこぼす。 | agent-environment-bootstrap delta の Scenario「post-init 検証」に「`custom_tools` の値は配列（length 0）または `null`/`undefined` のいずれでもよく、いずれの場合も `register_branch` の名前が含まれないことのみを検証する」と注記する。あるいは、tasks 3.6 のチェック実装で「null / undefined を空配列として扱う」を明示する。 |

## Severity Summary

- CRITICAL: 0
- HIGH: 4
- MEDIUM: 6
- LOW: 3

CRITICAL ≥ 1 または HIGH ≥ 1 のため verdict は `needs-fix`。

## Category Scores (architect single-reviewer)

architect が単独で全カテゴリを評価する（spec-reviewer / security-reviewer / pattern-reviewer は本 request で enabled でない）。

| Category | Score | Weight | 寄与 | Note |
|----------|-------|--------|------|------|
| completeness | 7 | 0.30 | 2.10 | 受け入れ基準 10 項目を delta が網羅。spec-fixer push 失敗 / 旧形式 ps 経路 / loop persist 責務の 3 点で完全性に欠ける |
| consistency | 6 | 0.25 | 1.50 | spec-review-session 既存 Requirement の array 化未反映、`{NNN}` vs `N` の表記揺れ、deprecation 出口戦略の欠落 |
| feasibility | 8 | 0.20 | 1.60 | 4 セッション + loop の構造は実装可能。Managed Agents 制約への対処が design D5 / D6 で構造化済み |
| security | 7 | 0.15 | 1.05 | Custom Tools 不在の不変条件 + `<user-request>` XML 包囲は適切。SDK retrieve の `custom_tools` null 取り扱いは LOW |
| maintainability | 6 | 0.10 | 0.60 | `appendStepResult` 名前衝突 (HIGH) / runManagedAgentSession 抽出未反映 / stdout フォーマットの spec 横断 drift リスク |

**Total**: 2.10 + 1.50 + 1.60 + 1.05 + 0.60 = **6.85** (pass threshold 7.0 未達)

## Next Action

1. spec-fixer に本 spec-review-result-001.md を渡し、Findings #1〜#4（HIGH）を最低限解消、#5〜#10（MEDIUM）も可能な範囲で対応させる。
2. spec-fixer が修正後 commit + push したブランチに対して、新規セッションで iter=2 の spec-review を起動する（runLoopUntil の body）。
3. iter=2 でも HIGH ≥ 1 が残れば retry 上限到達 → `escalation` + `SPEC_REVIEW_RETRIES_EXHAUSTED` を state.error に記録する（本 request 自身が定義する挙動）。

## Iteration Comparison

- Iteration 1（初回）。前回比較なし。
