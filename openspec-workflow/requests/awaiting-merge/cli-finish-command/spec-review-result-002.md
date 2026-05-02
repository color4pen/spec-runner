# Spec Review Result: cli-finish-command — Iteration 2

## Verdict

- **verdict**: approved
- **score**: 7.53 / 10.0 (pass threshold: 7.0)
- **iteration**: 2 / 2
- **trend**: improving (+0.48 vs iteration 1)
- **agents**: architect, spec-reviewer, pattern-reviewer (security-reviewer skipped — not in enabled list)
- **retries**: 1/2
- **blocking_findings**: CRITICAL: 0, HIGH: 0

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| completeness | 7 | 0.30 | 2.10 |
| consistency | 8 | 0.25 | 2.00 |
| feasibility | 8 | 0.20 | 1.60 |
| security | — (skipped) | 0.15 | — |
| maintainability | 7 | 0.10 | 0.70 |
| **Total** (renormalized over executed agents, weights = 0.30/0.25/0.20/0.10 = 0.85) | | | **6.40 / 0.85 ≈ 7.53** |

> security-reviewer is `skipped` per workflow `enabled` list. Per `review-standards.md`「skipped の場合、…他エージェントのスコアのみで加重合計を再計算する」、weights are renormalized: `(0.30+0.25+0.20+0.10)=0.85`、`weighted_sum=6.40`、`Total = 6.40/0.85 ≈ 7.53`。CRITICAL=0, HIGH=0 かつ Total ≥ 7.0 のため verdict は `approved`。

### カテゴリの観点

| Category | 評価観点 | 主担当エージェント |
|----------|---------|-----------------|
| completeness | 要件の網羅性、受け入れ基準の充足、仕様の漏れ | spec-reviewer |
| consistency | 既存 spec との整合性、後方互換性、用語統一 | spec-reviewer, architect |
| feasibility | 実現可能性、依存関係、工数見積の妥当性 | architect |
| security | 認証・認可、入力検証、脅威モデル（spec レベル） | security-reviewer (SKIPPED) |
| maintainability | 仕様の明確性、将来の拡張容易性、アンチパターン回避 | architect, pattern-reviewer |

## Consolidated Findings

iteration 1 で blocking だった HIGH 3 件はすべて解消された。本 iteration の残課題は MEDIUM/LOW の残留 7 件（後続改善で十分）。

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | completeness | openspec/changes/cli-finish-command/specs/cli-finish-command/spec.md "Requirement: …冪等…" | iteration 1 F#4 残留。archive PR が `OPEN`（auto-merge queue 待ち）/ `CLOSED`（手動 close）状態のときの挙動が依然として spec で固定されていない。MERGED と「全 step 完了」のみが冪等チェックされる。queue 直後の即時再実行で archive PR が `OPEN` のまま見つかった場合、現仕様だと「branch だけが remote にある + archive PR が MERGED ではない」状態として archive 全体を再走行してしまうリスクが残る。 | spec.md 冪等性 Requirement に archive PR 4 状態（不在 / OPEN(auto-merge queued) / MERGED / CLOSED）の挙動を追記する。OPEN は archive 全体を skip して `Archive PR #N still open (auto-merge pending), waiting for upstream merge.` を stdout に出して exit 0、CLOSED は escalation。Scenario 2 件追加。 |
| 2 | MEDIUM | consistency | openspec/changes/cli-finish-command/specs/cli-finish-command/spec.md "Requirement: …PR 状態を 6 種に正規化…" | iteration 1 F#5 残留。tasks.md §3.4 では safe default が明記されたが、spec.md Requirement 本文には「想定外 mergeStateStatus → safe default(`OPEN_CHECKS_FAILING`) に倒す SHALL」が依然として書かれていない。Scenario も無い。仕様だけ読んだ実装者が unknown 値で throw を選んでも spec 違反にならない。 | Requirement 末尾に「想定外の `mergeStateStatus` 値（HAS_HOOKS / UNSTABLE / UNKNOWN 等）を受け取った場合、`OPEN_CHECKS_FAILING` 相当の safe default に正規化する SHALL」を追記し、Scenario「未知の mergeStateStatus を safe default に倒す」を 1 件追加する。 |
| 3 | MEDIUM | consistency | openspec/changes/cli-finish-command/specs/cli-finish-command/spec.md "Requirement: …archive PR を作成して auto-merge を試みる" line 116 | iteration 1 F#8 部分残留。tasks.md §7.2 は `--body-file <tempfile>` + `try/finally` cleanup に修正されたが、spec.md の同 Requirement 本文には依然として `gh pr create … --body "Automated archive PR from specrunner finish."` という `--body <string>` 形式が書かれている。tasks ↔ spec の表現が divergent で、review-lessons「`--body-file <tempfile>` 必須」の規約に spec レベルで違反している。 | spec.md の該当 Requirement 本文を `--body-file <tempfile>` 形式に書き換え、「tempfile は `os.tmpdir()` 下の `crypto.randomUUID()` ベースで作成し、`try/finally` で cleanup を保証する MUST」を追加する。Scenario「archive PR の body を tempfile 経由で渡す」を 1 件追加。 |
| 4 | MEDIUM | feasibility | openspec/changes/cli-finish-command/specs/cli-finish-command/spec.md "Requirement: jobId / slug / awaiting-merge dir の 3 段階…" / design.md "Decisions §6" | iteration 1 F#6 残留。`--slug` 複数該当時の「最新 `updatedAt`」採用ルールはあるが、(a) `request.path` の basename 抽出方法（trailing slash / 大文字小文字）、(b) `updatedAt` の比較方法（ISO8601 lexicographic）が spec で固定されていない。実装者が `path.basename` で trailing slash 付きを誤判定する可能性が残る。 | Requirement に正規化規則を 1 行追記する: 「`request.path.split("/").filter(Boolean).pop()` で basename を抽出、大文字小文字は完全一致、`updatedAt` は ISO8601 lexicographic で最大値を採用する SHALL」。Scenario「trailing slash 付き request.path で同 slug 一致」を 1 件追加。 |
| 5 | MEDIUM | maintainability | openspec/changes/cli-finish-command/specs/cli-finish-command/spec.md "Requirement: …archive ブランチを切って…" Step 4 | iteration 1 F#10 残留。「変更がない場合は commit を skip」と書くが、commit 数 = 0 のときに push / archive PR 作成を skip するかが未定義。空コミット PR が生成されると noise になる。 | spec.md に Scenario 追加: 「archive ブランチで commit 数 = 0 の場合、`git push` / `gh pr create` / `gh pr merge --auto` を全て skip し、`No archive changes to publish.` を stdout に出して exit 0」。冪等性 Requirement とも整合させる。 |
| 6 | MEDIUM | feasibility | openspec/changes/cli-finish-command/specs/cli-finish-command/spec.md 冪等性 Requirement / design.md "Risks §3" / module-analysis Risks §4 | iteration 1 F#11 残留。`awaiting-merge/<slug>/` と `merged/<slug>/` が両方存在する partial-state の判定が依然として spec で固定されていない（merged 優先 / awaiting-merge 優先 / escalation のいずれも未確定）。 | 冪等性 Requirement に「両 dir が同時に存在する場合は escalation で停止し `Detected partial state: both awaiting-merge/ and merged/ exist for <slug>. Resolve manually.` を stderr に出す」を追加。Scenario 1 件追加。 |
| 7 | MEDIUM | maintainability | openspec/changes/cli-finish-command/specs/cli-finish-command/spec.md "Requirement: …LLM を呼び出さない…" Scenario "ネットワーク呼び出しの範囲" | iteration 1 F#9 残留。assertion は依然として「観測される呼び出しは `gh` CLI（GitHub API）のみ」のままで、`git push` (HTTPS/SSH to GitHub) と `openspec archive`（local 操作の前提）が網羅されていない。test 化の境界が曖昧。 | Scenario を「観測される outbound 接続は `gh` CLI（GitHub REST API）と `git push` (`origin` remote=GitHub) の 2 経路のみで、`openspec archive` は network call を行わない（assumption: openspec CLI のローカル契約）」に修正する。verification は static grep（`anthropic` import の不在）に限定する旨を tasks.md §12.3 に揃える。 |
| 8 | LOW | maintainability | openspec/changes/cli-finish-command/specs/cli-commands/spec.md "MODIFIED: 6 サブコマンドを提供する" | iteration 1 F#12 残留。delta MODIFIED Requirement で 6 サブコマンドを `init / login / run / ps / doctor / finish` の順で列挙するが、usage 出力の列挙順は MUST として固定されていない。Scenario も順序を assert していない。 | Requirement に「usage 出力での列挙順は `init / login / run / ps / doctor / finish` の 6 サブコマンド固定順とする」を追記し、Scenario「引数なし実行時の usage 順序」を順序 assertion 付きで 1 件追加する。 |
| 9 | LOW | maintainability | openspec/changes/cli-finish-command/specs/job-state-store/spec.md "Requirement: `JobStatus` 型は `archived` を terminal 状態として定義する" | iteration 1 F#13 残留。`finish` 実行が `state.steps` に StepRun を追加するか / `history` のみ append かが spec で固定されていない。`StepName` union 拡張の必要性も未確定。design.md の Open Questions に近い扱いで残っている。 | spec.md `JobStatus` Requirement に「finish 実行は `state.steps` に StepRun を追加せず、`state.history` への 1 件 append のみで完了する。`StepName` union は拡張しない」を明記する。 |
| 10 | LOW | maintainability | openspec/changes/cli-finish-command/specs/job-state-store/spec.md "Requirement: `JobStatus` 型…" "success から archived への遷移のみが許可" | iteration 1 F#7 部分残留。`running` 拒否は明記されたが、`failed` / `terminated` / `archived` からの遷移可否が表形式で固定されていない。`failed` 状態の job が外部で手動 merge されたケース（recovery 経路）の挙動が未定義。 | Requirement に「許可される遷移元 status」を表形式で固定する: `success` → `archived`（通常）、`failed` → `archived`（PR が外部で merge された recovery 経路、`--force` 必須）、`running` → 拒否、`terminated` → 拒否、`archived` → 拒否（冪等で no-op）。各分岐 1 件ずつ Scenario を書く。design.md Decisions §10 として根拠を残す。 |

## Iteration Comparison

### Improvements（iteration 1 → 2 で解消）

| # | iter1 Severity | Description | Resolution |
|---|----------------|-------------|------------|
| F#1 | HIGH | tasks.md / spec が `src/cli/commands/finish.ts` 等の存在しない path を参照 | tasks.md 冒頭に "Path Convention (read before implementing)" セクション追加（旧→正の対応表）。§1.1 / 1.2 / 1.3 が `src/cli/finish.ts` / `bin/specrunner.ts` / `src/state/schema.ts` に修正済み |
| F#2 | HIGH | 既存 `JobStateStore class` Requirement と実装（free function）の不整合 | `specs/job-state-store/spec.md` に MODIFIED Requirement 追加。"store module functions are the Sole Persistence Authority" として読み替え、`createJobState / listJobStates / loadJobState / updateJobState` の 4 関数を canonical と明示 |
| F#3 | HIGH | `ps --active` の Requirement が delta / 既存いずれにも無く、Scenario が self-consistent でない | `specs/cli-commands/spec.md` に `Requirement: specrunner ps --active は active 状態のジョブのみを表示する` 追加。`active = running のみ` の定義と Scenario 2 件追加 |
| F#15 | LOW | module-analysis R1-R3 が tasks.md §1 (Setup) に下りていない | tasks.md §1 に 1.4 (`spawnCommand` 抽出) / 1.5 (`loadJobState/updateJobState` 追加) / 1.6 (consumer exhaustive 更新) が追加済み |
| F#14 | LOW | Open Question §1 (`JobStatus` 型 location) を Decision に昇格すべき | design.md "Decisions (追加)" §9 として `JobStatus` は `src/state/schema.ts:5` の union と確定、`src/lib/jobs/state.ts` は不在と明示 |

### Partial Improvements（部分的に対応されたが残課題あり）

| # | iter1 Severity | Resolution status |
|---|----------------|------------------|
| F#7 | MEDIUM | `running` 拒否 Scenario は追加されたが、`failed / terminated / archived` の遷移可否表が未追加 → 本 iter F#10 として継続 |
| F#8 | MEDIUM | tasks.md §7.2 は `--body-file <tempfile>` + `try/finally` に修正済みだが spec.md 本文は `--body <string>` のまま → 本 iter F#3 として継続 |

### Regressions（前回から悪化した点）

なし。

### Unchanged Issues（iteration 1 から未対応の指摘）

| iter1 # | Severity | Status in iter2 |
|---------|----------|----------------|
| F#4 | MEDIUM | 未対応（archive PR OPEN/CLOSED 挙動）→ 本 iter F#1 |
| F#5 | MEDIUM | 未対応（spec.md Requirement に safe default 不記載）→ 本 iter F#2 |
| F#6 | MEDIUM | 未対応（`--slug` 解決の正規化規則不記載）→ 本 iter F#4 |
| F#9 | MEDIUM | 未対応（network call assertion の境界）→ 本 iter F#7 |
| F#10 | MEDIUM | 未対応（archive 空 commit 時の push / PR skip）→ 本 iter F#5 |
| F#11 | MEDIUM | 未対応（両 dir 同時存在の判定）→ 本 iter F#6 |
| F#12 | LOW | 未対応（usage 列挙順の固定）→ 本 iter F#8 |
| F#13 | LOW | 未対応（StepName union 拡張の方針）→ 本 iter F#9 |

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 7.05 (renormalized) | needs-fix | 初回。HIGH 3 件のため自動 needs-fix |
| 2 | 7.53 (renormalized) | approved | HIGH 3 件全解消（path / JobStateStore / `ps --active`）。consistency が 6→8、completeness が 7、feasibility 8、maintainability 7 に維持。+0.48 改善で improving |

### カテゴリ別スコア推移

| Category | iter1 | iter2 | Δ | 主な根拠 |
|----------|-------|-------|---|---------|
| completeness | 7 | 7 | 0 | F#3 (`--active` 仕様) 解消、F#4/9/10/11 残留で相殺 |
| consistency | 6 | 8 | +2 | F#1 (path) / F#2 (JobStateStore) の HIGH 2 件解消が支配的。F#5/8 の MEDIUM は残るが consistency 軸の致命傷ではない |
| feasibility | 8 | 8 | 0 | F#6 残留のみで実現可能性は変わらず |
| maintainability | 7 | 7 | 0 | F#15 (R1-R3 タスク化) / F#14 (Decision 昇格) 解消、F#7/12/13 は残留で相殺 |

## Convergence

- **trend**: improving (+0.48)
- **recommendation**: approve（CRITICAL: 0, HIGH: 0, Total ≥ 7.0 達成）
- **note**: 残 MEDIUM 7 件 / LOW 3 件は実装段階で曖昧さを残すが、approve 後に implementer フェーズで spec 補強もしくは ADR 反映で対応可能な範囲。承認阻止条件には該当しない

### 停滞検出ルール

- iter1 → iter2 で Total +0.48 (≥ 0.3) のため `improving` 判定。停滞検出には該当しない
- approve verdict のため次 iteration は実行されない

## Summary

iteration 1 で blocking だった HIGH 3 件（F#1: path 不整合、F#2: JobStateStore vs free-function、F#3: `ps --active` 仕様欠落）はすべて解消された。

- **F#1**: tasks.md 冒頭に "Path Convention" 対応表が追加され、§1.1 / 1.2 / 1.3 が実 codebase の path（`src/cli/finish.ts` / `bin/specrunner.ts` / `src/state/schema.ts`）に揃えられた。implementer が verbatim 追従しても parallel module tree が生まれない
- **F#2**: `specs/job-state-store/spec.md` に MODIFIED Requirement が追加され、既存 spec の "JobStateStore is the Sole Persistence Authority" を "store module functions are the Sole Persistence Authority" として読み替える正規化が完了。`createJobState / listJobStates / loadJobState / updateJobState` の 4 関数を canonical I/O 経路として明示
- **F#3**: `specs/cli-commands/spec.md` に `Requirement: specrunner ps --active は active 状態のジョブのみを表示する` が追加され、`active = running のみ`、`archived/success/failed/terminated は除外` の定義と Scenario 2 件で self-consistent になった

加えて F#15（module-analysis R1-R3 のタスク化）と F#14（Open Question の Decision 昇格）も解消。tasks.md §1.4-1.6 で `spawnCommand` 抽出 / `loadJobState/updateJobState` 追加 / consumer exhaustive 更新が前提タスクとして並んでいる。

残 MEDIUM 7 件は (a) archive PR 状態判定の網羅、(b) safe default の Requirement 本文記載、(c) `--body-file` の spec ↔ tasks 整合、(d) `--slug` 解決の正規化規則、(e) 空 commit 時の skip、(f) 両 dir 同時存在時の判定、(g) network call assertion の境界——いずれも spec の細部曖昧性であり、CRITICAL/HIGH 化する実装 blocker ではない。implementer が tasks.md ベースで実装可能で、必要に応じて spec 補強を後追いできる。

LOW 3 件（usage 順序固定 / StepName 非拡張の明文化 / `failed → archived` recovery 経路）も、いずれも後方互換性を破壊しないため approve を阻まない。

pattern-reviewer の review-lessons 重点項目：
- 「`--body-file <tempfile>` 必須」: tasks.md レベルでは解消、spec.md レベルでは F#3 として残留
- 「step 名 hardcode」: 該当なし（`StepName` 拡張可否は LOW F#9 で言及）
- 「path / type generalize 時の hint string 同時更新」: F#1 解消で適合
- 「外部 CLI 失敗の retry 抑制」: design.md "escalation philosophy" で明示的に LLM auto-recovery 禁止としており適合
- 「module-architect の decisions が tasks の冒頭タスクとして具体作業に下ろされているか」: F#15 解消で適合

security-reviewer は workflow `enabled` に含まれないため引き続き skipped（`status: skipped, reason: security-reviewer not in enabled list`）。security category weight (0.15) は加重合計から除外し再正規化した。
