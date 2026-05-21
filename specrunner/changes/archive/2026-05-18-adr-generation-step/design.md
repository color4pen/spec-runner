# Design: adr-generation-step

## Context

OSS 公開に向け、アーキテクチャ判断の経緯を外部の人が理解できる形で残す必要がある。現状 `specrunner/adr/` ディレクトリは存在しない。archived `design.md` に判断経緯の一部はあるが、横断的なアーキテクチャ判断 (= なぜ Hexagonal-lite か、なぜ LLM session に state を持たせないか等) は記録されていない。

openspec-workflow は `adr-create` skill を `request-execute` Step 7 から自動呼び出しし、50+ ADR を蓄積している。本変更はその思想を参考に、spec-runner 独自の流儀 (= pipeline step / `specrunner/adr/` namespace / `adr` フィールド宣言的分岐) で構成する。

## Goals

- pipeline に `adr-gen` step を新設し、`code-review --approved→ adr-gen → pr-create` の位置で ADR 生成を実行する
- request.md の `adr` フィールド (= 必須 boolean) で起動を宣言的に制御する
- 2 段階フィルタ (= 人間宣言 + agent judge) で ADR 量産を防ぐ

## Non-Goals

- 過去 design.md からの遡及 ADR 化
- `specrunner adr create <slug>` 等の単独 ADR 作成コマンド
- ADR status 遷移 (= proposed → accepted → deprecated → superseded) の自動管理
- 並列 finish 時の ADR 番号採番競合対策

## Decisions

### D1: adr-gen は AgentStep (kind: "agent")

ADR-worthy 判定 (= judge) と ADR draft 生成を LLM に委ねるため、AgentStep とする。CliStep では judge ロジックを実装できない。

completionVerdict は `"success"` (= implementer と同じ)。resultFilePath は null (= ADR を `specrunner/adr/` に直接書き、verdict file は不要)。parseResult は `NULL_PARSE_RESULT` を返す。

**Alternative A: CliStep + 外部 LLM 呼び出し**
CliStep.run() 内で直接 Anthropic API を叩く案。Pipeline の agent 抽象を迂回するため非採用。

**Alternative B: 2 step 分離 (= judge step + gen step)**
judge を独立 CliStep にする案。遷移テーブルが複雑化し、step 数が増えるため非採用。

### D2: pipeline 内位置は code-review --approved→ adr-gen → pr-create

code-review が approved を返した時点で実装 + レビュー完了。その直後に adr-gen を挟み、success で pr-create に進む。PR には ADR が含まれて review 可能。

既存行 `code-review --approved→ pr-create` を `code-review --approved→ adr-gen` に置換し、`adr-gen --success→ pr-create` + `adr-gen --error→ escalate` を追加する。

adr-gen は loop 外 (= `STANDARD_LOOP_NAMES` に含めない、`LOOP_ERROR_CODES` に登録しない)。approved 抜けで一度のみ実行。

### D3: request.adr === false → step 内 no-op 通過

skip 条件を pipeline 外 (= transition table の分岐) ではなく step 内で判定する。理由:

- transition table に条件分岐 (= request の field 値で遷移先を変える) のメカニズムが無い
- step 内 no-op は既存パターン (= completionVerdict: "success" で即 return) に沿っている
- pipeline 層は step の中身を知らない原則を維持

buildMessage 内で `request.adr === false` を検出し、agent に「ADR 生成不要、即 complete」を指示する短い message を返す。agent は no-op で終了し、completionVerdict: "success" で pr-create に遷移する。

**Alternative: Pipeline 層で skip**
Pipeline.runInternal に `if (nextStep === "adr-gen" && !request.adr) skip()` を入れる案。Pipeline が request 構造を知る必要があり、責務違反。非採用。

### D4: ParsedRequest に adr: boolean を必須追加

parser で `/^\s*-\s+\*\*adr\*\*:\s+(true|false)\s*$/` パターンで抽出。欠落・不正値は `requestMdInvalidError` で reject (= `base-branch` と同等の validation)。

ParsedRequest interface に `adr: boolean` を追加。既存の全 request.md は `adr` フィールドを持つ前提 (= active request は既に追記済み)。

### D5: ADR 保存先は specrunner/adr/、命名は ADR-{NNNN}-{YYYY-MM-DD}-{slug}.md

- `specrunner/` namespace 配下に集約 (= specs/ / changes/ と並列)
- NNNN: 4 桁連番 (= 既存 ADR 数 + 1)
- 日付 + slug で一意性と可読性を確保
- category 分類は不要 (= spec-runner は単一製品)

### D6: 2 段階フィルタ設計

| 段階 | 主体 | 役割 |
|---|---|---|
| 段階 1 | 人間 | `adr: false` → step 起動するが no-op (= LLM に短い no-op message を送る) |
| 段階 2 | agent | delta spec + git diff + review-feedback を見て ADR-worthy か判定 |

`adr: true` で起動後、agent が「アーキテクチャ判断なし」と判定したら ADR 生成スキップ + 理由を commit message / step log に残す。

### D7: ADR フォーマットは Michael Nygard 方式

Context / Decision / Alternatives Considered / Consequences の 4 セクション構造。Known Design Debt セクションは該当時のみ追加。system prompt でフォーマットを指定する。

### D8: agent への入力材料

- `request.md` (= adr: true の宣言、type、要件)
- change folder の delta spec (`specrunner/changes/<slug>/specs/` 配下)
- `design.md` (= 設計判断の主出典)
- `review-feedback-*.md` の Known Design Debt セクション (= 存在する場合)

git diff は agent が自力で取得可能 (= agent_toolset に bash tool が含まれる) なので、buildMessage で渡す必要はない。

### D9: docs/architecture.md は削除

untracked で残っている場合は implementer が削除する。横断 overview は ADR の集合に責務を集約する。

### D10: requiresCommit は false

ADR 生成は judge=yes の場合のみ書き出しがあり、judge=no / adr=false では commit 不要。agent の prompt で「judge=yes の場合は git add + commit + push せよ」と指示し、agent 側で完結させる。commit 強制の機械的 guard は不要 (= ADR は append-only で漏れても致命的ではない)。

**検討経緯**: requiresCommit を true にすると `adr: false` の no-op 経路と `adr: true` + judge=no の経路で NO_COMMIT_DETECTED エラーが発生するため採用しない。

## Risks / Trade-offs

- **adr: false no-op 時の LLM コスト**: step 起動で短い session が走る。ただし no-op message → 即 complete で 1 turn のみ。pipeline 層 skip を避けるためのコスト。受容する。
- **ADR 品質のばらつき**: agent の judge 精度と draft 品質は prompt 依存。初期は dogfood で品質を観察し、prompt を調整する。
- **番号採番の競合**: 並列 finish で同番号になる可能性。運用上並列 finish しない前提。スコープ外。
