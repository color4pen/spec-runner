# Design: Codex provider 実行時の scope discipline guidance 注入

## Context

### 何が起きているか

`cross-boundary-invariants` reviewer を `gpt-5.6-sol`（`.specrunner/config.json` の `steps["cross-boundary-invariants"].model`）で実行すると、初回 review では実害のある cross-boundary defect を検出できる一方、再レビューを重ねるにつれて「理論上は実行列を構成できるが、通常利用での到達可能性が極めて低い edge case」まで blocking finding として掘り続ける傾向が観測された（PR #1078）。結果として fixer loop が実質的な merge 価値を伴わないまま継続する。

同じ reviewer を Claude provider で実行した場合にはこの傾向が顕著でないため、pipeline 全体や reviewer 定義の問題ではなく、**Codex provider 利用時のモデル特性に対する局所的な補正**として扱うのが妥当である。

### 現在の実装（確認済み）

- provider の選択は `src/adapter/dispatching/agent-runner.ts` が担う。`resolveProvider(resolvedConfig.model)` が `"openai"` を返した step だけが `CodexAgentRunner` に routing され、それ以外は `ClaudeCodeRunner` に落ちる（`src/config/model-registry.ts` に model→provider の表がある）。
- `CodexAgentRunner.run()`（`src/adapter/codex/agent-runner.ts`）は main work turn の prompt を次の順で組み立てる:
  1. `baseMessage`（step 定義の `buildMessage`）
  2. `artifactSection`（`buildArtifactBundle`）
  3. `touchedFilesSectionStr`（`buildTouchedFilesSection`）
  4. `resumeSection`（`buildResumeSection` — shared）
  5. `additionalInstructions`（`buildAdditionalInstructions` — shared）
     → ここまでが `baseFullPrompt`
  6. `promptRulesSection`（`ctx.policy.promptRules`）
  7. `buildMainTurnCompletionInstruction()`（`reportTool` がある場合のみ、末尾）
- 手順 4 / 5 の builder は `src/adapter/shared/prompt-builder.ts` にあり、`ClaudeCodeRunner`（`src/adapter/claude-code/agent-runner.ts`）と **共有** されている。したがって shared builder に手を入れると Claude 側の prompt も変わる。
- Codex adapter は follow-up turn（completion retry / `postWorkPrompts` / output-verification repair）を **同一 thread** 上で実行するため、main turn の内容は後続 turn でも文脈として保持される。
- resume 経路（`codex.resumeThread` / resume 失敗時の fresh-thread fallback）は同じ `fullPrompt` 変数を再利用しているため、注入点を 1 箇所にすれば全経路に効く。
- managed runtime（`src/adapter/managed-agent/agent-runner.ts`）は Anthropic Managed Agents 専用であり、Codex とは無関係。

### 制約

- Codex provider で実行される step にのみ適用する。
- pipeline transition / convergence budget / `maxIterations` / `specrunner/reviewers/*.md` に diff を出さない。
- Claude provider の prompt 組み立てを変えない（= shared builder / `src/prompts/` を触らない）。
- 新しい provider config protocol や pipeline abstraction を作らない。adapter 内の小さい定数/ヘルパに留める。
- reviewer 以外の Codex step（design / implementer / conformance など）にも不自然な制約を与えないよう、文面は SpecRunner 共通の scope discipline に限定する。

### 既存テストとの衝突（重要な既知事実）

Codex adapter には prompt の **完全一致（byte-identical）** を固定しているテストが 2 箇所ある。guidance を無条件注入すると必ず赤くなる:

- `src/adapter/codex/__tests__/resume-prompt-injection.test.ts:163` — TC-015
- `src/adapter/codex/__tests__/artifact-bundle-injection.test.ts:171` — TC-015

一方 `src/adapter/codex/__tests__/touched-files-injection.test.ts:176` は 2 つの Codex prompt 同士の比較なので影響を受けない。`prompt-rules-injection.test.ts`（TC-018）は「promptRules < completion directive」という順序不等式なので、その間に guidance を挟んでも成立する。

## Goals / Non-Goals

**Goals**:

- Codex adapter 経由で実行される **すべての** agent step の main work turn prompt に、SpecRunner 共通の scope discipline guidance を注入する。
- guidance の文面を adapter 内の単一定数として固定し、unit test で prompt への包含・出現順序を機械的に固定する。
- Claude / managed provider の prompt 組み立てに一切影響しないことを構造的（参照範囲の guard test）に保証する。
- 既存の byte-identity 不変条件を「緩める」のではなく、guidance を含む新しい厳密式へ更新して維持する。

**Non-Goals**:

- Codex の reasoning effort / model 設定の調整。
- reviewer ごとの再レビュー protocol の追加、`specrunner/reviewers/*.md` の変更。
- pipeline の iteration / convergence budget / resume semantics の変更。
- findings severity policy の全面改訂（severity 定義そのものは既存のまま）。
- guidance の on/off や文面を config から差し替える仕組み（新 config protocol になるため明示的に対象外）。
- follow-up / retry / repair turn ごとの再注入。

## Decisions

### D1: 注入点は `CodexAgentRunner` の main-turn prompt 組み立て 1 箇所、step による分岐なし

Codex adapter に到達すること自体が「その step が openai provider で実行されている」ことの証明である（`DispatchingAgentRunner` が `resolveProvider === "openai"` の場合にのみ `CodexAgentRunner` を生成する）。したがって adapter 内で無条件に注入すれば、「Codex provider で実行される step にのみ適用」という要件は追加の判定ロジックなしで満たされる。

**Rationale: why X not Y**

- step 名や reviewer 種別で出し分けると、adapter が step 分類表を持つことになり、実質的に「provider × step の設定 protocol」が生えてしまう（要件で禁止）。文面を SpecRunner 共通の scope discipline に留めることで、全 step 無条件でも不自然にならない設計にする。
- 判定を core（StepExecutor / policy）側に置くと `ctx.policy` に provider 由来のフィールドが増え、provider config protocol の新設に該当する。

**Alternatives considered**

- (a) reviewer step のみに適用: step 分類表が必要。かつ実際には design / implementer の過剰防御的スコープ拡大も同じ症状であり、限定する積極的理由がない。→ 却下。
- (b) `ctx.policy.providerGuidance` を core が組み立てて渡す: pipeline 側に provider 概念を持ち込む。→ 却下（要件違反）。
- (c) `src/adapter/shared/prompt-builder.ts` に provider フラグ引数を追加: shared builder のシグネチャ変更は Claude 側の呼び出しにも波及し、「Claude provider の prompt 組み立てに変更がない」という受け入れ基準を構造的に危うくする。→ 却下。

### D2: 挿入位置は `promptRules` の直後、completion 指示の直前

main-turn prompt の連結順を `baseFullPrompt` → `promptRulesSection` → **guidance** → `buildMainTurnCompletionInstruction()` とする。

**Rationale: why X not Y**

- completion 指示は Codex に structured JSON 出力を要求する終端 contract であり、末尾に置かれていることが出力形式の安定に効いている。guidance を末尾に置いてこれを押し下げるのは、既存の completion-report parse 経路に対する不必要なリスク。
- 一方、`baseMessage` 直後に置くと artifacts / touched files / rules に埋もれ、recency の効果を失う。scope discipline は「掘り続けるかどうか」の判断に直接効かせたいので、可能な限り後方に置く。
- 既存 TC-018（`resume < promptRules < completion`）の順序不等式を壊さない位置でもある。

**Alternatives considered**

- (a) `promptRules` の直前: project rules（`specrunner/rules/<step>/*.md`）が最後に来て guidance が埋もれる。→ 却下。
- (b) completion 指示の後（prompt 末尾）: 終端 contract を押し下げる。→ 却下。
- (c) `baseMessage` の直後: 埋没する。→ 却下。

### D3: 文面は Codex adapter 内の単一定数モジュールに置く

`src/adapter/codex/` 配下に小さな定数モジュールを 1 つ追加し、guidance 文字列をそこから export する。`completion-report-prompt.ts`（`COMPLETION_REPORT_MEANS` を main turn と retry prompt で単一ソース化している）と同じパターンに揃える。

**Rationale: why X not Y**

- test が期待文面を独自に literal で持つと drift する。定数を test から import することで「文面が prompt に入る」ことを単一ソースで固定できる（受け入れ基準の「unit test で固定されている」に直結）。
- `src/prompts/` は provider 中立な core prompt surface であり、そこに provider 固有文面を置くと Claude 側の prompt 資産と混線する。adapter 内に閉じることが provider 分離の担保になる。
- `agent-runner.ts` にインライン literal で書くのは最小に見えるが、test 側に同じ literal を再掲する必要が生じ、上記 drift を招く。

**Alternatives considered**

- (a) `agent-runner.ts` 内のローカル定数（非 export）: test から参照できず literal 二重管理。→ 却下。
- (b) `src/prompts/` に fragment として追加: provider 中立面の汚染 + Claude 系 prompt drift guard test（`src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts`）の対象面に踏み込む。→ 却下。
- (c) `specrunner/rules/` として運用で入れる: rules は step 単位・provider 非依存であり Claude 実行時にも効いてしまう。→ 却下（要件違反）。

### D4: main work turn のみに注入し、follow-up / retry / repair turn には再注入しない

**Rationale: why X not Y**

- Codex adapter の follow-up turn はすべて同一 thread（`activeThread`）で実行され、main turn の内容は文脈として保持される。再注入は token を消費するだけで意味的な追加がない。
- completion retry prompt は「JSON だけを返せ」という極めて狭い contract であり、そこに scope discipline を混ぜると retry の意図がぼやける。

**Alternatives considered**

- (a) 全 turn に付加: 上記の理由で却下。
- (b) resume 時のみ別文面: resume 経路も同じ `fullPrompt` を使う構造なので分岐が必要になり、adapter が複雑化する。→ 却下。

### D5: 既存 byte-identity テストは「削除・緩和」ではなく期待式の更新で維持する

TC-015 の 2 件は「artifacts / resume が無いとき prompt に余計な section が付かない」ことを守る drift guard である。guidance は仕様として常に付くので、期待式を guidance 定数を含む形へ更新し、**厳密一致のまま**維持する。

**Rationale: why X not Y**

- `toContain` へ緩めると、将来の意図しない section 混入を検知できなくなる（この guard は Codex prompt の唯一の完全一致検査）。
- テスト削除は不変条件そのものを失う。

**Alternatives considered**

- (a) `toContain` へ緩和 → 却下。
- (b) 当該 test の削除 → 却下。

### D6: provider 分離は「参照範囲の guard test」で構造的に証明する

guidance 定数（およびそのモジュール）が `src/adapter/codex/` の外から参照されていないこと、および guidance 文面が Claude / managed / shared の prompt 組み立て経路のソースに現れないことを、ソース走査型の guard test で固定する。

**Rationale: why X not Y**

- 「Claude の prompt に guidance が含まれない」を実行時 assertion だけで示すと、将来 shared builder 経由で混入した場合に見落とす経路が残る（Claude 側は rollover 経路など prompt 構築点が複数ある）。参照範囲を構造的に禁止するほうが不変条件として強い。
- 既存リポジトリにも同種の grep 型 guard test（`tests/grep-no-bun-imports.test.ts` など）があり、様式が揃う。

**Alternatives considered**

- (a) `ClaudeCodeRunner` を mock 実行して `not.toContain` を見るだけ: 経路網羅が保証できない。補助としては可だが単独では却下。

### D7: 文面は request 記載の 6 行をそのまま採用する

request で提示された英語 6 項目を一字一句そのまま定数化する。severity の再定義や「blocking を減らせ」という指示ではなく、「finding は具体的な user/runtime impact を説明できること」「不可能ではないが merge を止める価値がないものは observation として報告するか省く」という **報告品質の要求** として書かれており、探索能力（cross-boundary の掘り下げ）自体は抑制しない。

**Rationale: why X not Y**

- 文面が review 寄りの語彙（finding / blocking）を含むが、producer step（design / implementer）に対しても「要件を発明しない」「防御的に一般化してスコープを広げない」の部分が有効に働き、逆方向の害がない。SpecRunner 共通の scope discipline という要件の範囲に収まる。
- 独自に文面を書き換えると、request が期待した効果との対応関係が検証できなくなる。

**Alternatives considered**

- (a) reviewer 向け・producer 向けで文面を分ける: step 分類が必要になり D1 と矛盾。→ 却下。
- (b) 文面を日本語化する: 既存 Codex prompt は日英混在で統一の実益がなく、request 文面の忠実性を優先。→ 却下。

## Risks / Trade-offs

- [guidance が実害のある finding まで抑制し、レビュー品質が下がる] → 文面は severity 閾値ではなく「impact を説明できること」を要求する形に留める。reviewer 定義・`maxIterations`・convergence budget は不変で、blocking の判断基準そのものは変えない。抑制対象には "observation として報告する" という代替経路を明示的に残す。
- [全 Codex step 無条件適用により、producer step が必要な実装まで「スコープ拡大」と誤解して省略する] → 文面は「supplied request/spec/reviewer criteria を超えて要件を発明しない」であり、与えられた spec/tasks の履行を否定しない。producer 相当の step 名でも同一文面が注入されることを test で明示し、文面の一般性をレビュー可能にする。
- [byte-identity test の期待式更新が regression の隠蔽に見える] → 更新後も厳密一致を維持し、期待式に guidance 定数を連結する形にする（literal 再掲はしない）。design の D5 が意図の記録になる。
- [completion-report の JSON パースが prompt 追記で不安定化する] → guidance は completion 指示より **前** に置き、終端 contract の位置を変えない。既存の completion-contract / prompt-rules test で順序不変を確認する。
- [将来 Claude 側にも同種 guidance が欲しくなり、shared 化の圧力がかかる] → 現時点では provider 固有補正として adapter 内に閉じる。共有が必要になった時点で改めて設計する（Open Questions 参照）。

## Open Questions

- 効果測定の方法: 本変更は prompt 変更であり、効果は実 job（Codex reviewer の再レビュー回数 / observation 比率）でしか観測できない。定量ゲートは本 change の受け入れ基準には含めない。運用で数 job 観測後に文面を増減するかは別 request で扱う。
- 将来 `gpt-5.6-*` 以外の openai model や reviewer 以外の Codex step 比率が増えた場合に、文面の出し分けが必要になるか。現時点では不要と判断（D1）。必要になった時点で初めて step 分類の是非を検討する。
- Claude provider 側に同等の scope discipline を入れるべきか否かは、本 change では判断しない（非目標）。
