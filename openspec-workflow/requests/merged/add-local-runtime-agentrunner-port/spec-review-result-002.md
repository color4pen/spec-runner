# Spec Review Result: add-local-runtime-agentrunner-port — Iteration 2

## Verdict

- **verdict**: approved
- **score**: 7.90 / 10.0 (pass threshold: 7.0)
- **iteration**: 2 / 2
- **trend**: improving (+0.55 vs iteration 1)
- **agents**: architect, spec-reviewer, security-reviewer, pattern-reviewer
- **retries**: 1/2
- **blocking_findings**: CRITICAL: 0, HIGH: 0

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| completeness | 8 | 0.30 | 2.40 |
| consistency | 8 | 0.25 | 2.00 |
| feasibility | 8 | 0.20 | 1.60 |
| security | 8 | 0.15 | 1.20 |
| maintainability | 7 | 0.10 | 0.70 |
| **Total** | | | **7.90** |

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | completeness | openspec/changes/add-local-runtime-agentrunner-port/specs/claude-code-runtime/spec.md:59-75 | `requiresCommit` guard の Scenario が ProposeStep ベースに偏ったまま。`step.requiresCommit === true` となる他 step（implementer / build-fixer / code-fixer）に同 guard が適用されることを担保する Scenario が無い | Requirement「ClaudeCodeRunner は requiresCommit guard を fs / git で検証する」に「対象 step」の節を追加し、`step.requiresCommit === true` の step 全般に同 guard が適用されることを明記。Scenario「implementer step で branch HEAD が advance しなかった場合 error」を追加（実装段階で対応可、blocking ではない） |
| 2 | MEDIUM | consistency | openspec/changes/add-local-runtime-agentrunner-port/specs/managed-agent-runtime/spec.md:65-83 | 「ManagedAgentRunner は CLI 主導 branch を canonical として扱う」Requirement と branch-registration delta の「CLI 主導 branch が canonical である」Requirement が同じ規律を 2 capability で規定している（duplicate spec ownership は依然存在）。文言は微妙に差別化されたが、片方を変更したときに他方が drift する構造は残る | branch-registration を authoritative（branch ownership の責務）にし、managed-agent-runtime spec の該当 Requirement は「`branch-registration` spec の CLI canonical 規律に従う」と参照のみに圧縮。実装後の小規模 spec-change で対応可 |
| 3 | MEDIUM | maintainability | openspec/changes/add-local-runtime-agentrunner-port/specs/agent-runner-port/spec.md:15-32 | `AgentRunContext` 型に `state: JobState` と `branch: string` が併存し、`state.branch` と `ctx.branch` の優先関係を spec が明文化していない（iter 1 finding #7 と同じ）。adapter 実装者が `ctx.state.branch` を読んでしまうと D4「CLI canonical」が破られる | Requirement の field 説明に「`branch` は CLI canonical 値であり、adapter は SHALL `ctx.state.branch` を読まない（または読んでも canonical override しない）」を追記。実装段階で test-cases.md の must シナリオに含めれば実害は防げる |
| 4 | MEDIUM | feasibility | openspec/changes/add-local-runtime-agentrunner-port/specs/runtime-selection/spec.md:87-109 | `runtime === "local"` 時 `SessionClient` を「生成しない」と明記しているが、agent-syncer spec は「コンストラクタ自体が呼ばれてもよい」と非対称（iter 1 finding #8 と同じ） | 「`SessionClient` のコンストラクタ自体は呼ばれてもよいが、`runtime === "local"` のとき Anthropic API への HTTP リクエストを発行しない」と書き換える。または agent-syncer 側を「コンストラクタも呼ばれない」に揃える。実装段階で DI 構造を見て判断 |
| 5 | LOW | completeness | openspec/changes/add-local-runtime-agentrunner-port/specs/cli-config-store/spec.md:33-35 | エラーメッセージ `runtime must be "managed" or "local".` を spec で固定文字列指定すると test brittleness を招く（iter 1 finding #5 と同じ） | エラーコード `CONFIG_INVALID` は維持し、メッセージは「`"managed"` または `"local"` 以外の値である旨を含む」というより緩い表現に変える |
| 6 | LOW | feasibility | openspec/changes/add-local-runtime-agentrunner-port/specs/claude-code-runtime/spec.md:1-15 | spec が `query({ cwd, prompt, additionalInstructions, ...sdkOptions })` の API 形を断定している（iter 1 finding #6 と同じ）。tasks.md 2.2 で SDK 調査を Phase 2 着手前に強制している点が partial mitigation | spec 側でも「`query()` の引数 shape は SDK 型定義に従う。`prompt` と `additionalInstructions` は同一 prompt 文字列に concat する形でもよい」と shape を緩める |
| 7 | LOW | consistency | openspec/changes/add-local-runtime-agentrunner-port/specs/module-boundary/spec.md:6-22 | tree 図に `util/` が無いまま `store` MAY import from `util` only の依存ルールが登場する（iter 1 finding #9 と同じ） | tree 図の `cli/` の下に `└── util/   # shared utilities` を加える、または注記 |
| 8 | LOW | maintainability | openspec/changes/add-local-runtime-agentrunner-port/specs/agent-runner-port/spec.md:60-95 | Scenario「StepExecutor が AgentRunner.run を 1 回呼ぶ」の「1 回」が retry / iteration loop での再呼び出しを誤解させる余地（iter 1 finding #10 と同じ）。step-execution-architecture spec 側で「awaited exactly once with `ctx.step === step`」と上位補強あり、実害は低い | 「`StepExecutor.execute(step, state)` の 1 回の呼び出しにつき `runner.run(ctx)` が exactly 1 回 await される」と限定句を追加 |
| 9 | LOW | security | openspec/changes/add-local-runtime-agentrunner-port/specs/cli-config-store/spec.md:7 | `runtime: "local"` で apiKey を空のまま許容する経路で、`config.json` のパーミッション 0600 invariant が runtime 切替後も維持される旨が delta に明示されていない（iter 1 finding #11 と同じ）。github.accessToken が同じファイルに残るため 0600 は維持必須 | 「`runtime` 切替に関わらず ConfigStore の 0600 permission invariant は維持される」と Requirement 末尾に追記、または当該既存 Requirement に対する no-op MODIFIED を明示 |
| 10 | LOW | maintainability | openspec/changes/add-local-runtime-agentrunner-port/specs/runtime-selection/spec.md:69-86 | Scenario「local runtime で getAgentId が呼ばれない」が実装の詳細（function 名）に依存（iter 1 finding #12 と同じ） | 「composition root および AgentRunner adapter は `config.agents` の lookup を行わない」と機能ベースの記述に書き換える |
| 11 | LOW | completeness | openspec/changes/add-local-runtime-agentrunner-port/specs/agent-syncer/spec.md:21-22 | Scenario の AND 句「コンストラクタ自体が呼ばれてもよい」が実装ヒント混入（iter 1 finding #13 と同じ） | コンストラクタに関する記述は Notes セクションに移すか、`AND` 句から削除して Scenario を pure な observable behavior に揃える |
| 12 | LOW | feasibility | openspec/changes/add-local-runtime-agentrunner-port/tasks.md:50 | Phase 4 task 4.8「手動 dogfood で OK」が evidence を残さない（iter 1 finding #14 と同じ） | tasks.md 4.8 に「local mode dogfood 実行ログを `dogfood-local-mode.md` として `openspec-workflow/requests/active/<slug>/` 配下に保存する」を追記 |

## Iteration Comparison

### Improvements

- **iter 1 #1 (HIGH consistency)** → resolved: `branch-registration/spec.md` に `## MODIFIED Requirements` ブロックが追加され、既存 `register_branch Database Persistence` Requirement の `Update branch_name on request` Scenario と `Idempotent re-registration (last-write-wins)` Scenario が CLI canonical を優先する書き換えに更新された。`openspec validate --strict` も pass。
- **iter 1 #2 (HIGH completeness)** → resolved: `agent-runner-port/spec.md` の Requirement「AgentRunner adapter は branch / path verification を内部で行う」に Scenario「期待 result file が存在しない場合 error を返す」が追加され、managed (GitHub API 404) と local (fs.existsSync false) を同等に扱うことが明示された。
- スコア: completeness 7→8、consistency 7→8、Total 7.35→7.90 (+0.55)

### Regressions

- 検出なし。spec-fixer の修正は他 Requirement に副作用を生まなかった（`openspec validate --strict` も pass 継続）。

### Unchanged Issues

- iter 1 finding #3 (MEDIUM completeness, claude-code-runtime requiresCommit 非Propose step)
- iter 1 finding #4 (MEDIUM consistency, managed-agent-runtime ↔ branch-registration duplicate ownership)
- iter 1 finding #5 (MEDIUM completeness, cli-config-store error message 固定文字列)
- iter 1 finding #6 (MEDIUM feasibility, claude-code-runtime SDK signature 未確認 — tasks.md 2.2 で partial mitigation)
- iter 1 finding #7 (MEDIUM maintainability, ctx.branch vs state.branch 優先関係)
- iter 1 finding #8 (MEDIUM feasibility, SessionClient 生成可否の非対称表現)
- iter 1 finding #9-14 (LOW 6 件)

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 7.35 | needs-fix | 初回。HIGH × 2 で needs-fix |
| 2 | 7.90 | approved | HIGH 2 件解消。completeness / consistency が +1 ずつ。MEDIUM 6 件は実装段階で対応可能と判断 |

## Convergence

- **trend**: improving (+0.55)
- **recommendation**: approve and proceed to module-architect / test-case-generator → implementation phase

### 停滞検出ルール

- 2 iteration 連続で改善なし（plateaued）には該当しない（improving）。escalation 条件不該当。

## Summary

iteration 1 で HIGH × 2 と MEDIUM × 6、LOW × 6 を指摘した。spec-fixer は HIGH 2 件（branch-registration の MODIFIED 不在問題、agent-runner-port の path verification Scenario 欠落）を完全に解消した。`openspec validate --strict` も pass を継続している。

完成度（completeness 7→8）と整合性（consistency 7→8）が 1 ポイントずつ向上し、Total 7.90 で pass threshold (7.0) を上回った。CRITICAL: 0、HIGH: 0 のため verdict は **approved**。

残る MEDIUM 6 件と LOW 6 件はいずれも spec ownership の整理（duplicate 削減）、エラーメッセージの brittleness、ctx.branch 優先関係の明文化、SessionClient 非対称表現、tree 図の util/ 追記、SDK API shape の wording 緩和、tasks.md 4.8 の dogfood evidence など、実装フェーズで test-cases.md の must シナリオや code-review で十分捕捉できる範囲。実装後の小規模 spec-change（または fixup）で対応可能で、本 iteration での修正必須事項ではない。

設計の骨格（AgentRunner port の単一メソッド `run`、adapter 命名 rename、register_branch の adapter 移管、CLI canonical branch、runtime field と AgentSyncer gating、Phase 1-4 段階的リリース）は依然として筋が通っており、Phase 1 完了時点で revert 可能という移行戦略も健全。次フェーズ（module-architect → test-case-generator → implementation）への進行を推奨。
