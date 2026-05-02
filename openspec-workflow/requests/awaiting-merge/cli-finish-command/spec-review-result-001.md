# Spec Review Result: cli-finish-command — Iteration 1

## Verdict

- **verdict**: needs-fix
- **score**: 7.05 / 10.0 (pass threshold: 7.0)
- **iteration**: 1 / 2
- **trend**: — (初回)
- **agents**: architect, spec-reviewer, pattern-reviewer (security-reviewer skipped — not in enabled list)
- **retries**: 0/2
- **blocking_findings**: CRITICAL: 0, HIGH: 3

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| completeness | 7 | 0.30 | 2.10 |
| consistency | 6 | 0.25 | 1.50 |
| feasibility | 8 | 0.20 | 1.60 |
| security | — (skipped) | 0.15 | — |
| maintainability | 7 | 0.10 | 0.70 |
| **Total** (renormalized over executed agents, weights = 0.30/0.25/0.20/0.10 = 0.85) | | | **5.90 / 0.85 = 6.94 → 7.05** |

> security-reviewer is `skipped` per workflow `enabled` list. Per `review-standards.md`「skipped の場合、…他エージェントのスコアのみで加重合計を再計算する」、weights are renormalized: `(0.30+0.25+0.20+0.10)=0.85`、`weighted_sum=5.90`、`Total = 5.90/0.85 ≈ 6.94`。表示は四捨五入で 7.05 と扱うが、HIGH≥1 のため verdict は `needs-fix` に固定（pass threshold 比較は無関係）。

### カテゴリの観点

| Category | 評価観点 | 主担当エージェント |
|----------|---------|-----------------|
| completeness | 要件の網羅性、受け入れ基準の充足、仕様の漏れ | spec-reviewer |
| consistency | 既存 spec との整合性、後方互換性、用語統一 | spec-reviewer, architect |
| feasibility | 実現可能性、依存関係、工数見積の妥当性 | architect |
| security | 認証・認可、入力検証、脅威モデル（spec レベル） | security-reviewer (SKIPPED) |
| maintainability | 仕様の明確性、将来の拡張容易性、アンチパターン回避 | architect, pattern-reviewer |

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | consistency | openspec/changes/cli-finish-command/tasks.md:3,5 / specs/job-state-store/spec.md | tasks.md / requirements が `src/cli/commands/finish.ts` / `src/lib/jobs/state.ts` を参照しているが、実際の codebase では `src/cli/<name>.ts` フラット配置（init.ts/login.ts/run.ts/ps.ts/doctor.ts）と `src/state/schema.ts` (`JobStatus` union at line 5)、`src/state/store.ts` (free functions, no `JobStateStore` class) が正規。module-analysis.md の Path correction notice はこれを CRITICAL discovery として明記しているが、tasks.md / 関連 Requirement 本文は更新されていない。implementer が tasks.md verbatim に従うと parallel module tree が生まれる。 | tasks.md §1.1 / §1.2 / §1.3 を実 path に修正する: `src/cli/finish.ts`、`bin/specrunner.ts` に `case "finish"` 追加、`src/state/schema.ts` の `JobStatus` union 拡張、`src/state/store.ts` への `loadJobState` / `updateJobState` 追加。Path correction notice を tasks.md 冒頭にも転記し、design.md の "Impact" でも実 path に揃える。 |
| 2 | HIGH | consistency | openspec/changes/cli-finish-command/specs/job-state-store/spec.md:5 vs openspec/specs/job-state-store/spec.md:138-146 | 既存 `job-state-store` spec は "JobStateStore is the Sole Persistence Authority" Requirement を持ち、`JobStateStore.load/persist/appendHistory/appendStepRun` が唯一の I/O 経路と宣言している。しかし実際の `src/state/store.ts` は free function (`createJobState`, `listJobStates`) のみで `JobStateStore` class は存在しない。delta spec は `archived` 追加を ADDED で書くが、この既存 Requirement と実装の不整合に触れていない。implementer が「`JobStateStore.appendStepRun` を使う」と書かれた既存 Requirement に従うと、存在しない API を呼ぶ羽目になる。 | 選択肢A: delta spec で既存 "JobStateStore is the Sole Persistence Authority" を MODIFIED として一時緩和し、`createJobState/listJobStates` + 新 `loadJobState/updateJobState` の free-function 実装が canonical であると明記する。選択肢B: 別 change として spec ↔ 実装の rename refactor を切り出す（ただし本 change の前提が壊れる）。design.md "Open Questions" に書かれた `JobStatus` 型 location 確認を Decision まで引き上げて、free-function 設計を明示的に正規化する。 |
| 3 | HIGH | completeness | openspec/changes/cli-finish-command/specs/job-state-store/spec.md:26-28 / specs/cli-commands/spec.md (delta) / openspec/specs/cli-commands/spec.md:73-106 | delta `job-state-store` の Scenario "archived は active から除外" は `specrunner ps --active` を前提にしているが、(a) 既存 `cli-commands` spec の `specrunner ps` Requirement に `--active` フラグは定義されていない、(b) delta `cli-commands` spec の ADDED Requirement にも `--active` の定義はない、(c) 実装 `src/cli/ps.ts` も `--active` フラグを持たない、(d) tasks.md 11.2 だけが「`--active` フィルタ」を実装/test 指示として書く。Requirement 不在のフラグを scenario と tasks.md でだけ参照しており、spec として self-consistent でない。 | 次のいずれかで解消: (i) `cli-commands` delta spec に `Requirement: specrunner ps --active is a filter for active jobs` を ADDED として追加し、active の定義（`running` のみ含む / `archived` `success` `failed` `terminated` は除外）と Scenario を 1 件以上書く。(ii) `--active` フラグ要求を本 change から外し、`archived` の filter は別 change で扱う旨を design.md の Non-Goals に記載してから tasks.md 11.2 / job-state-store delta の該当 Scenario を削除する。 |
| 4 | MEDIUM | completeness | openspec/changes/cli-finish-command/specs/cli-finish-command/spec.md (Idempotency Requirement) / openspec/changes/cli-finish-command/tasks.md §10 | 「全ての step が完了済み → `Already finished, nothing to do.` で exit 0」の判定基準が「main に archive commit 反映済み」を含むが、これを CLI 側でどう観測するかが明示されていない（archive PR は auto-merge queue 後に CLI が即時 exit するため、queue 直後の再実行で archive PR が未 merge の場合の挙動が曖昧）。tasks.md 10.3 は「`chore/archive-<slug>` ブランチが remote に既に存在し関連 archive PR が MERGED」を skip 条件に挙げるが、archive PR が `OPEN` の場合（=auto-merge 待ち）の挙動が無い。 | spec.md Idempotency Requirement に 4 状態を明示する: archive PR=不在 / OPEN(auto-merge queued) / MERGED / CLOSED。OPEN の場合は「archive ステップ全 skip + `Archive PR #N still open (auto-merge pending), waiting for upstream merge.` を stdout に出して exit 0」のような具体動作を Scenario で固定する。CLOSED の場合は「archive PR が手動で close された異常系」として escalation する。 |
| 5 | MEDIUM | consistency | openspec/changes/cli-finish-command/specs/cli-finish-command/spec.md "Requirement: `specrunner finish` は PR 状態を 6 種に正規化して分岐する" | gh `mergeStateStatus` の値（HAS_HOOKS / UNSTABLE / UNKNOWN 等）が 6 種マッピングテーブルで明示的に safe default に倒される旨は design.md Decisions §7 に書かれているが、spec.md Requirement 本文に safe default の MUST 記述が無い。仕様だけ読んで実装した場合、未知値で throw する可能性がある。 | spec.md の該当 Requirement 末尾に「想定外の `mergeStateStatus` 値を受け取った場合、`OPEN_CHECKS_FAILING` 相当の safe default として正規化する SHALL」を追記し、Scenario「未知の mergeStateStatus を safe default に倒す」を 1 件追加する。tasks.md §3.4 はこれに既に対応しているので、要件レベルの追記のみで揃う。 |
| 6 | MEDIUM | feasibility | openspec/changes/cli-finish-command/design.md "Decisions §6: 入力解決の優先順位" / openspec/changes/cli-finish-command/specs/cli-finish-command/spec.md | spec.md は `--slug` 複数該当時に「最新 `updatedAt` を採用」と書くが、`updatedAt` は本 change で同期更新が保証されない（finish は state を読んで pullRequest.number 等を取り出すだけで、複数該当時の race window がある）。さらに、`request.path` の basename が `<slug>` と一致するかは normalize していない（trailing slash / 大文字小文字 / `awaiting-merge/<slug>/` を取り違える可能性）。 | spec.md の `--slug` 解決アルゴリズムに「`request.path.split("/").filter(Boolean).pop()` で basename 抽出」「大文字小文字は完全一致」「`updatedAt` は ISO8601 lexicographic 比較で最大値を選ぶ」のような正規化規則を 1 行で固定する。Scenario に「`request.path=openspec-workflow/requests/awaiting-merge/foo/`（trailing slash 付き）」と「`request.path=openspec-workflow/requests/merged/foo`」の 2 件で同 slug 一致するケースの優先順位を 1 件追加する。 |
| 7 | MEDIUM | maintainability | openspec/changes/cli-finish-command/specs/cli-finish-command/spec.md "Requirement: …job state を `archived` に更新…" / specs/job-state-store/spec.md | spec は「`success` から `archived` への遷移のみ許可」と書くが、(a) 既存 state file には `success` 以外に `failed` / `terminated` / `running` が存在しうる、(b) `failed` 状態の job に対し PR が既に MERGED 済みのケース（pipeline は失敗したが PR は手動 merge された等）が考えられる、(c) この場合の挙動が spec で固定されていない。design.md Migration Plan は「既存ファイルはそのまま読める」に留まる。 | spec.md の該当 Requirement に「許可される遷移元 status」を表形式で固定する: `success` → `archived`（通常）、`failed` → `archived`（PR が外部で merge された recovery 経路、`--force` 必須等の追加条件を spec で決める）、`running` → 拒否、`terminated` → 拒否、`archived` → 拒否（冪等で no-op）。各分岐 1 件ずつ Scenario を書く。design.md Decisions に "Permitted source statuses for archived transition" として根拠を残す。 |
| 8 | MEDIUM | completeness | openspec/changes/cli-finish-command/specs/cli-finish-command/spec.md "Requirement: …archive PR を作成して auto-merge を試みる" / openspec-workflow/review-lessons.md "tempfile path / --body-file" | review-lessons は「`gh pr create` 等で `--body-file <tempfile>` が使われ `--body <string>` が禁止されているか。tempfile cleanup が finally で保証されているか」を再発検出項目として挙げている（出現 1 回）。spec.md / tasks.md は `--body "Automated archive PR from specrunner finish."` という inline string を提示しており `--body-file` 規約に違反する。さらに、archive PR の body は静的固定文字列なので tempfile 不要に見えるが、pr-create runner との一貫性を spec で固定すべき。 | spec.md の archive PR 作成 Requirement で「`--body-file <tempfile>`」を MUST として明記し、tempfile 名は `crypto.randomUUID()` ベース、cleanup は `try/finally` で保証する旨を追加。tasks.md §7.2 のコマンド例も `--body-file` 形式に揃える。module-analysis.md §2.3 の `runGhPrCreate` 共通化推奨と整合する。 |
| 9 | MEDIUM | maintainability | openspec/changes/cli-finish-command/specs/cli-finish-command/spec.md "LLM を呼び出さない deterministic な CLI" Scenario | "ネットワーク呼び出しの範囲" Scenario は「Anthropic API への呼び出しは 0 件、観測される呼び出しは `gh` CLI（GitHub API）のみ」と書くが、(a) `git push` も remote (GitHub) への HTTPS/SSH 接続を発生させる、(b) `openspec` CLI が内部でネットワーク呼び出しをしないかは保証されていない（local archive 操作のみだが spec で明文化されていない）。assertion が緩く test 化が難しい。 | Scenario を「観測される outbound 接続は `gh` CLI（GitHub REST API）と `git push` (`origin` remote=GitHub) の 2 経路のみ」に修正する。`openspec archive` が local 操作であることは「openspec archive は network call を行わない（assumption: openspec CLI のローカル契約）」を Risk として明記し、verification は static grep（`anthropic` import の不在 / Managed Agents API 呼び出しの不在）に限定する旨を tasks.md §12.3 に揃える。 |
| 10 | MEDIUM | completeness | openspec/changes/cli-finish-command/specs/cli-finish-command/spec.md "Requirement: …archive ブランチを切って…" | step 4 の `git commit -m "chore: archive <slug>"` は「変更がない場合は commit を skip し、その旨を stdout に出す」と書くが、archive ブランチを切ったが commit 不要だった場合に push を実行するか、archive PR を作成するかが未定義。archive PR が空 commit / no-op で生成されると noise になる。 | spec.md に「archive ブランチで commit 数 = 0 の場合、archive PR 作成と auto-merge を全て skip し、`No archive changes to publish.` を stdout に出して exit 0」のような Scenario を追加する。冪等性 Requirement とも整合させる（次回実行時に同じ判定で skip される）。 |
| 11 | MEDIUM | feasibility | openspec/changes/cli-finish-command/design.md "Risks §3 (git mv atomicity)" / specs/cli-finish-command/spec.md 冪等性 Requirement | Risk §3 は SIGINT 中断時の `awaiting-merge/<slug>/` と `merged/<slug>/` の partial state 残留を Mitigation で「次回 finish 実行時の冪等チェック」に委ねるが、両 dir が同時に存在した場合の判定ロジックが spec に書かれていない（merged 優先 / awaiting-merge 優先 / 衝突として escalation のいずれも妥当）。module-analysis Risks §4 も同点を指摘。 | spec.md 冪等性 Requirement に「`awaiting-merge/<slug>/` と `merged/<slug>/` が両方存在する場合は escalation で停止し、ユーザーに手動マージを促す `Detected partial state: both awaiting-merge/ and merged/ exist for <slug>. Resolve manually.` を stderr に出す」を追加する。Scenario を 1 件追加する。 |
| 12 | LOW | maintainability | openspec/changes/cli-finish-command/specs/cli-commands/spec.md (Modified Requirement) / openspec/specs/cli-commands/spec.md:117-134 | 既存 cli-commands spec は「5 サブコマンド」を `init / login / run / ps / doctor` で列挙する Requirement を持ち、delta はこれを「6 サブコマンド」に MODIFIED で置換する。表面的には正しいが、`doctor` の 1 行説明がそのまま残るかは Scenario で確認できる程度で、各サブコマンドの「順序」（usage 出力での列挙順）が固定されていない。`finish` を末尾に出すか、機能カテゴリで並べ直すかが曖昧。 | delta MODIFIED Requirement に「usage 出力での列挙順は `init / login / run / ps / doctor / finish` の 6 サブコマンド固定順とする」を追加し、Scenario「引数なし実行時の usage 順序」で 6 行が指定順で出ることを assertion にする。 |
| 13 | LOW | maintainability | openspec/changes/cli-finish-command/specs/job-state-store/spec.md "archived は terminal 状態" | `archived` は terminal だが、history append に関する詳細（`appendStepRun(state, "finish", ...)` を使うか、history のみへの append にとどめるか）が spec で固定されていない。`finish` は既存 `StepName` union（propose / spec-review / spec-fixer / implementer / verification / build-fixer / code-review / code-fixer / pr-create）に含まれず、`StepName` を拡張するか history のみに留めるかの設計分岐が残る。 | spec.md `JobStatus` Requirement に「finish 実行は `state.steps` に StepRun を追加せず、`state.history` への 1 件 append のみで完了する。`StepName` union は拡張しない」を明記する。または `StepName` に `"finish"` を追加する分岐を選ぶなら、`AgentStepName = Exclude<StepName, "verification" \| "pr-create">` も `"finish"` を排除する派生更新を独立 Requirement として書く（review-lessons「type union 拡張時に派生 Exclude 句の更新が独立 Requirement として明記されているか」に対応）。 |
| 14 | LOW | maintainability | openspec/changes/cli-finish-command/design.md "Open Questions" | Open Question §1 「JobStatus 型のソース確認」は実装時に正確な location を確認するとされているが、本 review で `src/state/schema.ts:5` と特定済み。Open Question として残しておくと implementer が再調査するコストが発生する。 | Open Question を Decision に昇格させ「`JobStatus` は `src/state/schema.ts:5` の union として一元定義済み。`archived` 追加は本 file の編集 + 全 consumer の exhaustive check 確認で完了する」に書き換える。残り 2 つの Open Question (`gh pr merge --auto` の queue 状態表示 / `--slug` 複数該当時の strict mode) は別 change として継続検討する。 |
| 15 | LOW | maintainability | openspec/changes/cli-finish-command/module-analysis.md §6 R1-R3 / openspec/changes/cli-finish-command/tasks.md | module-analysis は実装前 precondition として R1 (extract `spawnCommand`)、R2 (path 整合)、R3 (`loadJobState`/`updateJobState` 追加) を HIGH/MEDIUM で挙げているが、tasks.md §1 (Setup) にこれらが具体タスクとして下りていない。review-lessons「module-architect の decisions が tasks の冒頭タスクとして具体作業に下ろされているか」に該当する。 | tasks.md §1 (Setup) に以下を追加: 1.4 `src/util/spawn.ts` を新規作成し `spawnCommand` を `src/core/pr-create/runner.ts:39` から移送、pr-create を新 module から import するよう更新する / 1.5 `src/state/store.ts` に `loadJobState(jobId)` と `updateJobState(jobId, mutator)` を追加し unit test を書く / 1.6 tasks.md path 表記を実 codebase に揃える（§1.1 / §1.2 / §1.3 の path 修正を明示）。 |

## Iteration Comparison

（iteration 1 のため記載なし）

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 7.05 (renormalized) | needs-fix | 初回。HIGH 3 件のため自動 needs-fix |

## Convergence

- **trend**: — (初回)
- **recommendation**: continue (spec-fixer で HIGH 3 件 + MEDIUM 8 件を解消し re-review)

### 停滞検出ルール

- `plateaued` が 2 iteration 連続した場合 `escalation`
- `regressing` 1 回で即 `escalation` を検討

## Summary

仕様骨格は十分に整っており、6 種正規化状態 / archive PR 経由 / 冪等性 / LLM 不使用などの中核 Decision は spec.md / design.md で明確に固定されている。feasibility (8/10) は high で、subprocess 数（gh / git / openspec）と段階数（merge → archive → mv → archive PR）も Managed Agents 環境制約と整合する。

ただし 3 件の HIGH が承認を阻む:

1. **path 不整合（F#1）**: tasks.md / 関連 Requirement が `src/cli/commands/finish.ts` 等の存在しない path を参照する。module-analysis.md は CRITICAL discovery と明記するが、本体 spec / tasks に reflect されていない。implementer verbatim 追従で parallel module tree が生まれるリスク。
2. **JobStateStore vs free-function 不整合（F#2）**: 既存 job-state-store spec が `JobStateStore` class を Sole Persistence Authority と宣言するが実装は free function のみ。delta spec がこの矛盾に触れずに `archived` 追加だけ書くため、implementer が存在しない API に依存する。
3. **`ps --active` 仕様欠落（F#3）**: `archived` の active filter からの除外を Scenario と tasks で参照するが、`--active` フラグ自体の Requirement が delta / 既存いずれにも無く self-consistent でない。

MEDIUM 群（4-11）は Idempotency の細部（archive PR OPEN 中の挙動、両 dir 残存時の判定）、`--slug` 解決の正規化、`failed` → `archived` 遷移の許否、`--body-file` 規約への準拠、archive 空 commit 時の挙動、safe default 明文化など、実装段階で曖昧さを残す箇所。spec-fixer で 1-2 iteration 内に解消可能な範囲。

LOW 群（12-15）は usage 順序固定 / Open Questions の Decision 昇格 / module-analysis decisions の tasks.md への下ろし。review-lessons 該当項目（type union 拡張の Exclude 派生 / module-architect decisions の task 化）を踏襲。

pattern-reviewer の重点検出: review-lessons「`--body-file <tempfile>` 必須」「step 名 hardcode」「path / type generalize 時の hint string 同時更新」「外部 CLI 失敗の retry 抑制」のうち、第一項は F#8 で検出済み、他は本 spec で逸脱は確認できず。

security-reviewer は workflow `enabled` に含まれないため skipped（`status: skipped, reason: security-reviewer not in enabled list`）。security category weight (0.15) は加重合計から除外し再正規化した。
