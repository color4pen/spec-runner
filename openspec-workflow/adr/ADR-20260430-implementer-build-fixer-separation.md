# ADR-20260430: implementer / build-fixer を独立 Agent として分離する

> 本 ADR は `implementer-verify-buildfix` request の design.md D5 を ADR 化したもの。「creative な初期実装」と「mechanical な build error 修正」を 1 つの Agent に統合せず、独立 Agent として分離する判断を記録する。

## ステータス

accepted

## コンテキスト

implementer-verify-buildfix request では、spec 層と対称な実装層 self-correct loop を追加する：

| Layer | 創造的 step | Verdict 生成 | Fixer |
|-------|-----------|------------|------|
| spec（既存） | propose | spec-review | spec-fixer |
| code（本 request） | **implementer** | verification（CLI） | **build-fixer** |

ここで **implementer**（spec / tasks.md を読み実装、git push まで実行）と **build-fixer**（verification の error log を読み mechanical な修正を行う）の責務をどう Agent にマッピングするかが分岐点になる。

PR #22 で「同一 Agent を異なる role で使うと system prompt と user message が矛盾する」failure pattern を踏んでいる。当時 spec-review が propose Agent を流用していたため、Agent の system prompt（propose 用）と session ごとの user message（spec-review 指示）が矛盾し、出力品質が著しく低下した。この anti-pattern は D4-D6（PR #28）で「Step が AgentDefinition を所有する」規律によって解消された。

### 制約

- **Anthropic Managed Agents SDK の制約**:
  - `SessionCreateParams` は `system` 上書き不可。Agent ごとに固定の system prompt を持つ
  - Custom Tool は Agent レベル定義であり、session 単位の出し分けができない
  - 結果として「同一 Agent を異なる role で使う」と system prompt（Agent 固定）と user message（role 別）が矛盾する
- 既存 spec 層（D4-D6）で「Step が独立 AgentDefinition を所有する」規律が確立済み

## 決定

implementer と build-fixer を **それぞれ独立した Agent** として定義する。

- `src/prompts/implementer-system.ts` → `IMPLEMENTER_SYSTEM_PROMPT`
  - 「spec / tasks.md を読み実装、git commit + push まで実行、テストも追加」
  - Agent name: `specrunner-implementer`
- `src/prompts/build-fixer-system.ts` → `BUILD_FIXER_SYSTEM_PROMPT`
  - 「**mechanical な build/test/lint/typecheck エラー修正のみ**。仕様変更や設計判断は行わない。verification-result.md に記載された failed phase の error log を読み修正、git commit + push」
  - Agent name: `specrunner-build-fixer`

両者とも `agent_toolset_20260401` + `capabilities.gitWrite = true`。custom tool は不要（branch register は propose 済み）。

`AgentRegistry.fromSteps([..., ImplementerStep, BuildFixerStep])` で 2 つの新 Agent が `specrunner init` 時に Anthropic に登録される。

## 却下した代替案

### 案 A: 単一 Agent + role 切替プロンプト — `specrunner-coder` 1 つに統合

- 1 つの Agent に「実装も修正も両方できる」system prompt を持たせ、user message で role を切り替える
- session 1 で「implementer モード」、session 2 で「build-fixer モード」のメッセージを送る
- **Pros**:
  - Agent 数が 1 つで済む（registry / config schema が小さい）
  - `specrunner init` の Agent 同期コストが減る
- **Cons**:
  - **PR #22 の failure pattern を再現する**。Agent の system prompt（兼用）と user message（role 別指示）が矛盾し、出力品質が低下する
  - 「mechanical 修正のみ」という制約が system prompt に書きづらい（implementer 時には逆に creative であってほしい）。結果として system prompt は曖昧になり、build-fixer が仕様変更まで踏み込む副作用が出やすい
  - Managed Agents SDK の `SessionCreateParams.system` 上書き不可の制約により、user message での「上書き指示」に頼ることになる。これは構造的に脆い（system prompt の優先度が高いため、user message 側の制約は無視されやすい）
  - capability isolation が不可能。implementer の `gitWrite = true` を build-fixer にも与えることになるが、両者の権限境界を将来分けたくなった時に分離できない
- **Why not**: PR #22 の anti-pattern を構造的に再現するため。SDK 制約の本質的な不適合

### 案 B: 1 Agent + Custom Tool による role 宣言

- 1 つの Agent に共通 system prompt を持たせ、`declare_role` Custom Tool で session 開始時に role を宣言させる
- **Pros**: Agent 数 1、role 切替が明示的になる
- **Cons**:
  - Custom Tool は Agent レベル定義のため全 role に露出する。implementer 用の tool が build-fixer session でも見える（ノイズ）
  - role 宣言が「Agent の出力（tool call）」に依存するため、入力時点で role を強制できない。Agent が誤った role を宣言した場合の検出も困難
  - 案 A と同様、system prompt が role 横断で曖昧になる
- **Why not**: SDK 構造（Custom Tool は Agent 単位）と role 別出し分けのミスマッチ

### 案 C（採択）: 独立 2 Agent

- implementer / build-fixer をそれぞれ独立 Agent として登録
- **Pros**:
  - 各 Agent の system prompt が role 専用で済む。「mechanical 修正のみ」を build-fixer 側で強制できる
  - Custom Tool が role 別に独立（将来必要になった場合）
  - capability isolation の余地（implementer = git write、build-fixer = git write + read-only review tool 等）を Phase 2 に残す
  - PR #28 で確立した「Step が AgentDefinition を所有する」規律と一貫
  - definitionHash が role 別に算出されるため、片方の prompt 変更で他方は再同期不要
- **Cons**:
  - Agent 数が 2 つ増える（registry / config schema が膨らむ）
  - `specrunner init` の同期コストが 2 Agent 分増える

採択根拠は **SDK 制約と PR #22 failure pattern からの構造的な必然**。コスト面のデメリット（Agent 数増）は registry / config schema の自動集約により吸収される（D4-D6 で確立済み）。

## 結果

### Positive

- PR #22 の system prompt + user message 矛盾 anti-pattern を構造的に回避
- 各 Agent の system prompt が role 専用で記述可能（「mechanical 修正のみ」の制約が build-fixer に強制される）
- capability isolation の Phase 2 移行余地が確保される
- Step が AgentDefinition を所有する規律（D4-D6）と一貫した設計
- definitionHash が role 別に算出されるため、prompt 変更時の再同期粒度が最小化される
- spec 層（propose / spec-review / spec-fixer = 3 独立 Agent）と code 層（implementer / build-fixer = 2 独立 Agent）の対称性が保たれる

### Negative

- Agent 数が 2 つ増える（合計: propose / spec-review / spec-fixer / implementer / build-fixer = 5 Agent）
- `specrunner init` の Anthropic API 呼び出し回数が増える（5 Agent 分の retrieve / create / update）

### Risks

- **risk**: build-fixer が「mechanical 修正のみ」を逸脱して仕様変更まで踏み込む
  - **mitigation**: system prompt で「仕様変更や設計判断は行わない」を明示。verification の loop guard（max 3 iterations）で暴走を制限。逸脱が発覚した場合は learned-pattern に記録し prompt を強化
- **risk**: implementer と build-fixer の prompt drift（似た指示が両方に必要になる）
  - **mitigation**: design.md D11 / module-analysis.md 4.5 で示された「git commit + push 指示」のテンプレを `src/prompts/git-push-instruction.ts` に切り出し共有
- **risk**: Agent 数が増えることで `specrunner init` の部分失敗時の rollback が複雑化
  - **mitigation**: AgentSyncer の per-role retrieve / create / update / orphan rollback ロジック（D5）が既に対応済み

## 関連 ADR

- **ADR-20260429-step-and-agent-class-architecture** — D4「AgentDefinition は Step が所有」規律。本 ADR はこの規律を implementer / build-fixer に適用する具体例
- **ADR-20260429-spec-fixer-iteration-loop** — spec-fixer を独立 Agent として分離した先例。本 ADR は code 層で同じ規律を踏襲

## 参照

- `openspec/changes/implementer-verify-buildfix/design.md` D5 — 本 ADR の根拠
- `openspec-workflow/requests/active/implementer-verify-buildfix/request.md` — 「Managed Agents SDK の制約（再掲）」セクション
- PR #22 — 同一 Agent + 異 role による system prompt 矛盾の failure 事例
- PR #28 — D4-D6 で「Step が AgentDefinition を所有する」規律を確立した implementation
- learned-pattern「同一 Agent を異なる role で使うと system prompt と user message が矛盾する」
