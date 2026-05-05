# Spec Review Result: add-local-runtime-agentrunner-port — Iteration 1

## Verdict

- **verdict**: needs-fix
- **score**: 7.4 / 10.0 (pass threshold: 7.0)
- **iteration**: 1 / 2
- **trend**: — (初回)
- **agents**: architect, spec-reviewer, security-reviewer, pattern-reviewer
- **retries**: 0/2
- **blocking_findings**: CRITICAL: 0, HIGH: 2

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| completeness | 7 | 0.30 | 2.10 |
| consistency | 7 | 0.25 | 1.75 |
| feasibility | 8 | 0.20 | 1.60 |
| security | 8 | 0.15 | 1.20 |
| maintainability | 7 | 0.10 | 0.70 |
| **Total** | | | **7.35** |

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | consistency | openspec/changes/add-local-runtime-agentrunner-port/specs/branch-registration/spec.md:6 | 既存 `branch-registration/spec.md` には `register_branch Custom Tool Definition` / `Input Validation` / `Database Persistence` / `Execution Context` / `RequestSummary Type Extension` の 5 Requirement が ADDED として存在する。delta は新規 ADDED Requirement「機構は runtime === "managed" のみで作動する」「CLI 主導 branch が canonical である」を追加するが、既存 Requirement のうち少なくとも `register_branch Database Persistence` は本 change の D4（CLI canonical 値が canonical、agent 値で override しない）と挙動が衝突する（既存 Scenario「Update branch_name on request」「Idempotent re-registration (last-write-wins)」は agent 値を DB に書き込む契約）。既存 Requirement を MODIFIED で更新せず ADDED のみで上書きすると、`openspec validate` は通っても spec の意味が二重化する | `branch-registration` delta に MODIFIED Requirement を追加し、既存「register_branch Database Persistence」の Scenario「Idempotent re-registration (last-write-wins)」を「CLI canonical 値が agent 申告値より優先される（last-write-wins は agent 同士の再登録に限る）」に書き換える。または ADDED Requirement「CLI 主導 branch が canonical である」内で「既存 Database Persistence Scenario の last-write-wins 範囲は agent 申告値同士に限定する」と明示する文を追加 |
| 2 | HIGH | completeness | openspec/changes/add-local-runtime-agentrunner-port/specs/agent-runner-port/spec.md:96-110 | Requirement「AgentRunner adapter は branch / path verification を内部で行う」が `verifyPath` の責務を明文化していない。Scenario は branch のみで、`step.resultFilePath !== null` のとき該当 path が adapter で検証されることを担保する Scenario が欠落している。design.md D5 と request.md task 1.8（verifyPath helper を executor から削除）の両方が「path 検証も adapter 内」を要求しているのに spec の Scenario レベルで穴が開いている | Requirement に Scenario「期待 result file が存在しない場合 error を返す」を追加（GIVEN: agent 完了後 `step.resultFilePath` が指す file を adapter の手段で取得できない、THEN: `result.completionReason === "error"` かつ error.message に「result file not found」相当が含まれる）。このとき managed では GitHub API の 404、local では fs.existsSync false が同等に扱われることを明記 |
| 3 | MEDIUM | completeness | openspec/changes/add-local-runtime-agentrunner-port/specs/claude-code-runtime/spec.md:59-75 | `requiresCommit` guard の Scenario が ProposeStep ベースに偏っている。`step.requiresCommit` が true となる他 step（implementer / build-fixer / code-fixer は agent が commit を行う想定）でも同じ guard が動くことを担保する Scenario が無い。design.md D5 と module-analysis 4-E は「両 adapter の guard を共通契約として保つ」と述べているが spec ではその範囲が不明瞭 | Requirement「ClaudeCodeRunner は requiresCommit guard を fs / git で検証する」に「対象 step」の節を追加し、`step.requiresCommit === true` の step 全般（propose / implementer / build-fixer / code-fixer）に同 guard が適用されることを明記。Scenario「implementer step で branch HEAD が advance しなかった場合 error」を追加 |
| 4 | MEDIUM | consistency | openspec/changes/add-local-runtime-agentrunner-port/specs/managed-agent-runtime/spec.md:65-83 | 「ManagedAgentRunner は CLI 主導 branch を canonical として扱う」Requirement と branch-registration delta の「CLI 主導 branch が canonical である」Requirement が同じ内容を 2 箇所で規定している（duplicate spec ownership）。spec が 2 capability にまたがって同じ規律を述べると、片方を変更したときに他方が drift する | どちらか 1 capability を authoritative にし、他方は「see also」参照に留める。推奨: branch-registration を authoritative（branch ownership は branch-registration capability の責務）にし、managed-agent-runtime spec の該当 Requirement は「`branch-registration` spec の CLI canonical 規律に従う」と参照のみに圧縮 |
| 5 | MEDIUM | completeness | openspec/changes/add-local-runtime-agentrunner-port/specs/cli-config-store/spec.md:33-35 | 不正な runtime 値（`"remote"` 等）の Scenario が「CONFIG_INVALID エラーで `runtime must be "managed" or "local".` を返す」と固定文字列を要求しているが、エラーメッセージの正確な wording を spec で固定すると test brittleness を招く。一方で diagnostic 文字列が一切無いと test が assertion できない | エラーコード `CONFIG_INVALID` は固定維持し、メッセージは「`"managed"` または `"local"` 以外の値である旨を含む」というより緩い表現に変える。既存 cli-config-store spec の他 Scenario（`Run 'specrunner init' first.`）と同水準に留める |
| 6 | MEDIUM | feasibility | openspec/changes/add-local-runtime-agentrunner-port/specs/claude-code-runtime/spec.md:1-15 | `ClaudeCodeRunner.run()` の手順 3 で `query({ cwd, prompt, additionalInstructions, ...sdkOptions })` を呼ぶと書かれているが、`@anthropic-ai/claude-code` SDK の `query()` の実シグネチャが verify されていない（design.md Open Question Q1 が同点に言及）。`additionalInstructions` という SDK パラメータが実在するか、prompt と別枠で渡せるかが未確認のまま spec が API 形を断定している。Phase 2 で SDK 調査の結果が API 形と乖離した場合、spec を修正する手戻りになる | tasks.md 2.2 で SDK 調査を Phase 2 着手前に強制している点は良い。ただし spec 側でも「`query()` の引数 shape は SDK 型定義に従う。`prompt` と `additionalInstructions` は同一 prompt 文字列に concat する形でもよい」と shape を緩める。Scenario「query() に cwd が渡される」は維持して問題ない（cwd は SDK の core feature） |
| 7 | MEDIUM | maintainability | openspec/changes/add-local-runtime-agentrunner-port/specs/agent-runner-port/spec.md:15-32 | `AgentRunContext` 型に `state: JobState` と `branch: string` が併存し、`state.branch` と `ctx.branch` の優先関係を spec が明文化していない（module-analysis 4-C と同主旨）。adapter 実装者が `ctx.state.branch` を読んでしまうと D4 の「CLI canonical」が破られる | Requirement の field 説明に「`branch` は CLI canonical 値であり、adapter は SHALL `ctx.state.branch` を読まない（または読んでも canonical override しない）」を追記。または Scenario「adapter は ctx.branch を canonical として扱う」を追加（GIVEN: ctx.state.branch !== ctx.branch、THEN: adapter は ctx.branch を採用する） |
| 8 | MEDIUM | feasibility | openspec/changes/add-local-runtime-agentrunner-port/specs/runtime-selection/spec.md:87-109 | Requirement「composition root が runtime ごとの依存だけを生成する」で `runtime === "local"` 時 `SessionClient` を「生成しない」と明記しているが、`AgentSyncer` のコンストラクタは作ってもよい（agent-syncer spec Scenario「コンストラクタ自体が呼ばれてもよい」）と非対称。`SessionClient` も「コンストラクタは作ってもよいが session 確立の HTTP 通信を行わない」とするのが現実の DI 構造と整合しやすい（lazy initialization） | 「`SessionClient` のコンストラクタ自体は呼ばれてもよいが、`runtime === "local"` のとき `apiKey` 不在で例外を発生させない / Anthropic API への HTTP リクエストを発行しない」と書き換える。または agent-syncer spec と表現を揃え、両者で「constructor は OK / 副作用 method 呼び出しは禁止」のパターンに統一 |
| 9 | LOW | consistency | openspec/changes/add-local-runtime-agentrunner-port/specs/module-boundary/spec.md:6-22 | Source Layout の図で `src/util/` が「`store` MAY import from `util` only」依存ルールに登場するが、Source Layout の tree 図に `util/` が無い。既存 module-boundary spec も同様であれば変更不要だが、本 delta で図を MODIFIED するなら util を加えて統一感を上げる余地がある | tree 図の `cli/` の下に `└── util/   # shared utilities` を加える。または「src/ は他に util/ などの共有ディレクトリを持つ場合がある」と注記 |
| 10 | LOW | maintainability | openspec/changes/add-local-runtime-agentrunner-port/specs/agent-runner-port/spec.md:60-95 | Scenario「StepExecutor が AgentRunner.run を 1 回呼ぶ」の検証は「`runner.run(ctx)` が 1 回 await される」と書かれているが、retry / iteration loop で再呼び出しされる場合（spec-review iteration 2 以降）に「1 回」が誤解を招く。Step 単位の 1 回か、execute 呼び出しごとの 1 回かを明確にする | 「`StepExecutor.execute(step, state)` の 1 回の呼び出しにつき `runner.run(ctx)` が exactly 1 回 await される」と限定句を追加 |
| 11 | LOW | security | openspec/changes/add-local-runtime-agentrunner-port/specs/cli-config-store/spec.md:7 | `runtime: "local"` で apiKey を空のまま許容するが、`config.json` のパーミッション 0600 invariant（既存 `cli-config-store/spec.md` Requirement「設定ファイルはパーミッション 0600 で保存される」）が runtime 切替後も維持される旨が delta に明示されていない。空 apiKey は機微度が下がるが github.accessToken が同じファイルに残るため 0600 は維持必須 | 「`runtime` 切替に関わらず ConfigStore の 0600 permission invariant は維持される」と Requirement 末尾に追記、または当該既存 Requirement に対する no-op MODIFIED を明示してレビュアー誤読を防ぐ |
| 12 | LOW | maintainability | openspec/changes/add-local-runtime-agentrunner-port/specs/runtime-selection/spec.md:69-86 | Requirement「local runtime では agent ID 解決が不要である」の Scenario「local runtime で getAgentId が呼ばれない」は実装の詳細（function 名）に依存している。将来 `getAgentId` が rename された際に spec が drift する | 「composition root および AgentRunner adapter は `config.agents` の lookup を行わない」と機能ベースの記述に書き換える。`getAgentId` は example として括弧書きに残す程度に |
| 13 | LOW | completeness | openspec/changes/add-local-runtime-agentrunner-port/specs/agent-syncer/spec.md:21-22 | Scenario「local runtime で run 中に syncAll が呼ばれない」で「AgentSyncer のコンストラクタ自体が呼ばれてもよい」と書かれているが、これは spec というより実装ヒント。Scenario としては「syncAll 呼び出しが 0 回」のみで十分 | コンストラクタに関する記述は Notes セクションに移すか、`AND` 句から削除して Scenario を pure な observable behavior に揃える |
| 14 | LOW | feasibility | openspec/changes/add-local-runtime-agentrunner-port/openspec/changes/add-local-runtime-agentrunner-port/tasks.md:42-50 | Phase 4 の e2e 検証 task 4.8 が「手動 dogfood で OK」と書かれているが、受け入れ基準（request.md L86）は「pipeline が local mode で完走する」を要求。手動検証のみで evidence を残さないと regression 検出が難しい | tasks.md 4.8 に「local mode dogfood 実行ログを `dogfood-local-mode.md` として `openspec-workflow/requests/active/<slug>/` 配下に保存する」を追記。または受け入れ基準で「e2e テストの追加」が non-goal であることを request.md 補足に明記 |

## Iteration Comparison

（iteration 1 のため該当なし）

### Improvements
- N/A

### Regressions
- N/A

### Unchanged Issues
- N/A

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 7.35 | needs-fix | 初回。HIGH × 2 で needs-fix（score は閾値超え） |

## Convergence

- **trend**: — (初回)
- **recommendation**: continue（spec-fixer で HIGH × 2 を解消後、approved 見込み）

### 停滞検出ルール

- 初回のため停滞判定は対象外

## Summary

設計の骨格（AgentRunner port、adapter 命名 rename、register_branch の adapter 移管、CLI canonical branch、runtime field と AgentSyncer gating）はいずれも筋が通っており、4 Phase 分割と Phase 1 完了時点で revert 可能という移行戦略は健全。`openspec validate --strict` も pass しており、MODIFIED header は既存 spec と完全一致している。

ただし 2 点の HIGH findings — (1) branch-registration 既存 Requirement「Database Persistence」の last-write-wins 規律と本 change D4 の「CLI canonical」規律が衝突している点（MODIFIED で更新せず ADDED のみで重ねている）、(2) AgentRunner adapter の path verification Scenario が欠落している点（design D5 の責務が spec の Scenario レベルで担保されていない）— は実装前に必ず解消する必要がある。前者は spec の二重定義リスク、後者は実装が「branch だけ検証 / path 未検証」に流れる漏れリスクを生む。

そのほか MEDIUM 6 件は spec ownership の重複（managed-agent-runtime と branch-registration で同一規律が併記）、エラーメッセージの brittleness、SDK API 形の verify 待ち、`ctx.branch` vs `ctx.state.branch` の優先関係未明文化、`SessionClient` 生成の可否表現の非対称性、`requiresCommit` guard 適用範囲。いずれも spec 段階で解消可能で、実装時の手戻りを大きく減らせる。

spec-fixer で HIGH 2 件と可能な範囲の MEDIUM を解消すれば iteration 2 で approved 到達見込み。
