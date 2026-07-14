# Design: postwork-no-tool-fix

## Context

Agent step の実行は 2 相からなる:

- **main work turn**: `report_result` MCP tool が `mcpServers` として登録され、tool call が捕捉される唯一の turn。code-review の typed findings（verdict 導出の入力）はここで captured tool result として受け取られる。
- **post-work turn**（`followUpPrompt` / rules follow-up）: `src/adapter/claude-code/agent-runner.ts:724-733` で `mcpServers` を削除して起動され、tool call は意図的に捕捉されない（`tool detection applies only to main work turn` — 同ファイルの設計コメント）。managed / codex adapter も同じ設計（tool detection は main-work-turn のみ）。

この非対称性のもとで、`src/core/step/code-review.ts:138-159` の `followUpPrompt`（post-work self-check）は項目 4 で「`report_result` の findings 配列が提出されているか」を確認させ、末尾（:157）で「違反があれば review-feedback ファイルまたは `report_result` findings を修正してください」と指示している。

post-work turn では `report_result` が登録されておらず tool call も捕捉されないため、post-work で findings を「修正」しても CLI は受け取らない。この指示は構造上成立せず、契約上の欠陥になっている。一方、review-feedback（Markdown）ファイルは `Edit` tool で修正でき、`Edit` は post-work turn でも常に利用可能なので、Markdown の形式検査・修正は post-work でも有効に機能する。

typed findings の正当性（必須フィールド・空なら `[]`）は、captured tool result を受け取る唯一の経路である main work turn の完了契約——`CODE_REVIEW_SYSTEM_PROMPT` の Completion セクション + `CODE_REVIEW_REPORT_TOOL.description`——に既に記述されている。

## Goals / Non-Goals

**Goals**:

- code-review の post-work self-check を Markdown result file の形式検査・修正のみに限定し、`report_result`（typed tool result）の提出確認・修正を指示する記述を除去する。
- typed findings の正当性の担保を main work turn の完了契約に一元化し、post-work に依存させないことを確認・固定する。
- 「post-work / rules follow-up prompt は captured tool（`report_result`）の生成・修正を指示してはならない」という越境不変を確立し、全 agent step の post-work / follow-up prompt を走査する機械的な歯（テスト）で固定する。
- code-review の verdict 導出・Markdown result file 検査の観測挙動を不変に保つ（既存テスト無変更で green）。

**Non-Goals**:

- post-work 実行そのものの条件化（無条件実行 → detector 検出時のみ repair）。別 request。
- 完了契約の初回 turn 注入方法（system prompt / tool description をいつ・どう注入するか）の変更。別 request。
- code-review の verdict 導出ロジック・findings routing の変更。本 request は挙動保存。
- adapter（`agent-runner.ts`）側で post-work turn の tool 捕捉を有効化する変更。設計意図に反するため採らない（D3 の却下案）。

## Decisions

### D1: code-review `followUpPrompt` を Markdown 専用の self-check に限定する

`src/core/step/code-review.ts` の `followUpPrompt` から、`report_result` / typed findings に言及する記述を除去する:

- 項目「`report_result` の findings 配列が提出されているか」（およびその sub-bullet「各 finding に severity … が含まれているか」「findings が空の場合は `[]` を渡してあるか」）を削除する。
- 残る Markdown 検査項目（テーブル形式 / 必須カラム / Fix カラム値 / Severity 定義準拠）を連番付け直す。
- 末尾の指示を「違反があれば review-feedback ファイルを修正してください」に変更し、`report_result findings` への言及を除去する。

self-check は「出力した review-feedback（Markdown）ファイルを `Read` で読み、形式違反があれば `Edit` で修正、なければ変更せず end_turn」という post-work で確実に機能する内容だけになる。

**Rationale**: post-work turn は `mcpServers` 非登録・tool 非捕捉である。この turn に `report_result` 修正を指示するのは「受け取れない結果を作れ」という空指示であり、agent の turn 予算を無駄にし、契約の意図を誤認させる。Markdown 修正は `Edit` で成立するため、post-work の責務を Markdown 検査に純化するのが構造に合致する。

**Alternatives considered**:
- *post-work turn でも `report_result` を捕捉できるよう adapter を変更する*: `mcpServers` を post-work に再登録すると、agent が work turn と post-work turn の両方で `report_result` を呼び、tool の重複実行・二重 report が起き得る。tool detection を main-work-turn のみとする adapter の設計意図に反する。却下。
- *現状維持（指示を残す）*: 構造上成立しない指示を残すことは契約欠陥の温存であり、将来の誤読・模倣（他 step が post-work で tool 修正を指示する）を招く。却下。

### D2: typed findings の担保は main work turn の完了契約に一元化する（source 変更なし）

typed findings の正当性（`findings` 配列必須・必須フィールド・空なら `[]`）は、captured tool result を受け取る唯一の turn である main work turn の完了契約に既に存在する:

- `CODE_REVIEW_SYSTEM_PROMPT`（`src/prompts/code-review-system.ts`）の `## Completion`: 「`findings` 配列を必ず含めてください」＋各要素の形式（severity / resolution / file / line? / title / rationale）＋「指摘がない場合は `findings: []` を渡してください」。
- `CODE_REVIEW_REPORT_TOOL.description`（`src/core/step/report-tool.ts`）: 「REQUIRED when ok=true: provide a 'findings' array …」＋「The CLI derives the verdict from findings」。

本 request では、この担保を post-work から除去する（D1）代わりに、担保が main work turn 側に残っていることを恒久化するための lock test を追加する（source の完了契約自体は変更しない）。

**Rationale**: report_result が登録・捕捉される turn に担保が置かれていれば、agent が typed findings を正しく提出しないケースは main work turn の retry（`toolReportRetry`）で対処される。post-work は捕捉できないため、そこに担保を置くのは false assurance になる。担保の所在を post-work→main-work に固定することが本 request の核心。

**Alternatives considered**:
- *担保を post-work に（も）置く*: post-work は tool 非捕捉なので担保として機能しない。D1 と矛盾。却下。
- *担保を lock test なしで暗黙に残す*: D1 で post-work から除去した後、将来 completion 契約から findings 記述が消えても検出できない。恒久化のため lock test を置く。採用。

### D3: 越境不変を機械的な歯で固定する

**不変条件**: post-work / rules follow-up prompt は、captured tool（現状 `report_result` が唯一）の呼び出し・提出・修正を指示してはならない。post-work turn は captured tool を検出しないため。

**機械的な歯**（新規テスト）:
- pipeline registry（`STANDARD_DESCRIPTOR` / `FAST_DESCRIPTOR` の `steps`）から全 agent step（`kind === "agent"`）を列挙し重複排除する。
- 各 step の post-work prompt 文字列を収集する: 静的 `step.followUpPrompt` と、動的 `step.getFollowUpPrompt(state, deps)`（adr-gen は `deps.request.adr === true` で発火するため、その条件で評価する）。
- 収集した各文字列に禁止マーカー `report_result`（大文字小文字無視）が含まれていれば fail する。
- 補助として rules follow-up wrapper（`buildRulesFollowUpPrompts` の生成する定型枠）にもマーカーが含まれないことを確認する。

**禁止マーカーを `report_result` に限定する理由**: post-work turn で無効になるのは「結果が捕捉される tool」だけである。`Edit` / `Write` / `Read` / `Bash` / `Grep` / `Glob` は post-work でも有効に機能し（Markdown 修正は `Edit` に依存する）、prompt 中に「`Read` tool で読み」等の正当な言及がある。したがって汎用に「tool」を禁止語にすると false positive を生む。pipeline 内で結果が captured typed result になる tool は `report_result` のみであり、これが不変違反の唯一かつ厳密なマーカーになる。

**Rationale**: emergent / 越境不変（複数ファイル × 実行相の非対称性）は owner と機械的な歯がないと規模で必ず漏れる。code review だけに頼らず、全 agent step を静的に走査する歯で退行を fail-closed に固定する。

**Alternatives considered**:
- *歯を置かず code-review 指摘のみで担保*: 越境不変は人手レビューで漏れる。却下。
- *汎用「tool」語を禁止*: `Read` / `Edit` の正当な言及に false positive。`report_result` が唯一の captured tool なので過剰。却下。

## Risks / Trade-offs

- [Risk] マーカー `report_result` が将来 captured tool が増えたとき網羅しない → **Mitigation**: 現状 pipeline の captured typed tool は `report_result` のみ。新たな captured tool を追加する変更が入る場合、その request でマーカー集合を拡張する。テストに「captured tool を追加したらマーカーを追加せよ」旨のコメントを残す。
- [Risk] 項目除去が findings 担保の弱体化と誤解される → **Mitigation**: D2 の lock test が、担保が main work turn の完了契約（system prompt + tool description）に残存することを固定する。post-work からの除去と main-work での担保存置は同時に検証される。
- [Risk] 既存テストが除去対象の文言に依存していると赤化する → **Mitigation**: `tests/unit/step/code-review.test.ts` / `tests/unit/core/step/types.test.ts` を確認済み。code-review の `followUpPrompt` 文言（`report_result` 行）を assert するテストは存在しない。新規テストは全て別ファイルで追加し、既存テストは無変更で green を保つ。
- [Trade-off] post-work の責務を Markdown 検査に純化することで、typed findings の「二重チェック」は失われる。しかし元々 post-work のそれは機能していなかった（捕捉されない）ため、観測挙動の損失はない。

## Open Questions

- custom reviewer（`specrunner/reviewers/*.md`）は動的合成され静的 `followUpPrompt` を持たない（post-work prompt は rules follow-up 経由のみ）。機械的な歯は registry 上の静的 agent step を走査対象とし、custom reviewer の動的合成 prompt は不変の原則が適用されるが静的走査の対象外とする。これは受容される制約とする（本 request では拡張しない）。
