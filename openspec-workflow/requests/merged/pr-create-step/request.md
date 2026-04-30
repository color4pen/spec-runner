# pr-create step 追加（self-host pipeline 完成形）

## Meta

- **type**: new-feature
- **date**: 2026-04-30
- **author**: color4pen
- **depends-on**: openspec-workflow/requests/merged/code-review-fixer（PR #38 で merge 済み code-review + code-fixer step）

## ワークフローオプション

- **enabled**:
  - test-case-generator
  - adr

## 背景

PR #36 + #38 の累積で SpecRunner pipeline は

```
propose → spec-review (loop with spec-fixer) → implementer → verification (loop with build-fixer) → code-review (loop with code-fixer) → end
```

まで自走可能になり、spec → 実装 → build/test self-correct → 人間相当のレビュー → 修正 loop までが 1 つの `specrunner run` コマンドで完結する。残るは「approved した branch を GitHub に PR として上げる」最後の 1 ピース。

現状は code-review approved の後で pipeline が `end` に至り、ユーザーが手動で `gh pr create` を打つ必要がある。本 request で **`pr-create` step を追加し transition を `code-review → approved → pr-create → end` に書き換える** ことで、SpecRunner が要件 (request.md) → PR 作成まで完全自走する self-host 完成形に到達する。

設計対称性（拡張）:

| Layer | 創造的 step | Verdict 生成 | Fixer | Loop 構造 |
|-------|-----------|------------|------|-----------|
| spec | propose | spec-review | spec-fixer | review needs-fix → spec-fixer → review |
| code（build） | implementer | verification | build-fixer | verify fail → build-fixer → verify |
| code（review） | — | code-review | code-fixer | review needs-fix → code-fixer → review |
| **publish（本 request）** | **pr-create** | — | — | 単発 step（loop なし） |

pr-create は loop を持たない単発 step である点が他の step 群と異なる（PR 作成は idempotent でない / 1 回成功すれば終わり / 失敗時は escalation）。verification と同じく **CLI-resident（kind=cli）** にすべきか **agent-resident（kind=agent）** にするかは ADR で確定する設計分岐点（後述）。

## 目的

`code-review --approved→ end` を `code-review --approved→ pr-create` に書き換え、PR 作成を pipeline 内で実行する。具体的に:

1. **pr-create step の実装**: branch を origin に push 済みの状態を前提として、`gh pr create` 経由で PR を立てる。PR body には request.md の主要セクション（タイトル / 背景 / 目的）+ pipeline 実行サマリ（spec-review / verification / code-review の最終 iteration の verdict と path）を含める
2. **Pipeline transition 書き換え**: `code-review → approved → end` を **削除** し、以下を追加:
   - `{ step: "code-review", on: "approved", to: "pr-create" }`
   - `{ step: "pr-create", on: "success", to: "end" }`
   - `{ step: "pr-create", on: "error", to: "escalate" }`
3. **PR URL の state への記録**: pr-create が成功したら `state.pullRequest = { url, number, createdAt }` を記録し、次回 specrunner ps で参照可能にする
4. **冪等性の確保**: 同 branch に対する PR が既に存在する場合は `gh pr view` で既存 PR を検出して URL を state に記録するだけで success を返す（重複作成を避ける）

## 要件

### pr-create step の実装

1. **kind の選択**: `kind: "cli"` を採用する。理由は ADR で確定（候補: gh CLI 直接呼び出しが LLM agent 不要 / verification と同じ pattern / cost 削減 / 失敗時の retry 制御が機械的）
2. **Step 実装**: `src/core/step/pr-create.ts` を新設。`CliStep` を満たす `PrCreateStep` を export
3. **CLI runner**: `src/core/pr-create/runner.ts` を新設し、以下を実装
   - `gh pr view <branch> --json url,number,state` で既存 PR 検出（冪等性）
   - 既存 PR が `OPEN` の場合: URL を state に記録して success を返す
   - 既存 PR が `MERGED` / `CLOSED` の場合: 新規作成（force-recreate ではなく新規ブランチ前提だが、本 request では escalation で停止）
   - 存在しない場合: `gh pr create --title <title> --body <body> --base main --head <branch>` で作成
4. **PR body の生成**: `src/core/pr-create/body-template.ts` で template を定義。含めるべき内容:
   - request.md の `# {タイトル}` を PR title に流用
   - request.md の `## 背景` / `## 目的` セクションを PR body の `## Summary` に圧縮
   - 各 step の最終 iteration verdict（spec-review / verification / code-review）を `## Workflow` セクションに表形式で
   - `## Test plan` セクション（verification phase の結果から自動生成）
   - 末尾に `🤖 Generated with SpecRunner` の signature
5. **resultFilePath**: `openspec/changes/<slug>/pr-create-result.md`（PR URL / number / 作成成否を記録）
6. **parseResult**: pr-create-result.md の `## Status: success | failed` を regex 抽出して verdict 生成
7. **State 拡張**: `JobState` に `pullRequest?: { url, number, createdAt }` field を追加

### Pipeline 拡張

1. **`STANDARD_TRANSITIONS` 書き換え**:
   - 既存: `{ step: "code-review", on: "approved", to: "end" }` を **削除**
   - 追加:
     - `{ step: "code-review", on: "approved", to: "pr-create" }`
     - `{ step: "pr-create", on: "success", to: "end" }`
     - `{ step: "pr-create", on: "error", to: "escalate" }`
2. **loop guard**: pr-create は loop を持たないため `loopNames` には追加しない
3. **`LOOP_ERROR_CODES` 追加なし**: pr-create は loop ではないため lookup table への entry 不要

### init.ts と AgentRegistry

1. **`src/cli/init.ts`**: pr-create は `kind: "cli"` で agent を持たないため `AgentRegistry.fromSteps()` への追加は **不要**（verification と同じ扱い）
2. **`src/cli/run.ts`**: `Pipeline` constructor に渡す `steps` Map に `PrCreateStep` を追加

### request.md パース helper

PR body に request.md の `## 背景` / `## 目的` を埋め込むため、既存の `src/parser/request-md.ts` を拡張するか、新規 helper を追加する必要がある。
既存 `ParsedRequest` 型に欠落している場合は、最小限の section 抽出 helper を `src/core/pr-create/request-md-extract.ts` 等に新設。

### 環境前提

- `gh` CLI がインストールされ、認証済みであること（`specrunner login` で github token を取得済みなら可）
- branch が origin に push 済みであること（implementer / build-fixer / code-fixer のいずれかが push 完了している前提。state.branch から取得可能）

## 受け入れ基準

- [ ] 既存テストが全 PASS する（regression 0 件）
- [ ] `specrunner run` で code-review approved → pr-create → end の遷移が pipeline state machine 上で動く
- [ ] pr-create が正常に PR を作成し、`state.pullRequest = { url, number, createdAt }` が記録される
- [ ] pr-create が既存 OPEN PR を検出した場合、新規作成せず success を返す（冪等性）
- [ ] pr-create-result.md が PR URL / number を含む形式で生成される
- [ ] PR body に request.md の `## 背景` / `## 目的` が埋め込まれている
- [ ] PR body に各 step の最終 verdict（spec-review / verification / code-review）が含まれている
- [ ] PR title が request.md の `# {タイトル}` から導出される
- [ ] `tests/unit/core/pr-create/runner.test.ts` で 4 シナリオ（新規作成成功 / 既存 OPEN 検出 / 既存 MERGED → escalation / gh CLI 失敗）がカバーされている
- [ ] `tests/unit/step/pr-create.test.ts` が CliStep interface 適合性を検証する
- [ ] `tests/unit/core/pipeline/pipeline.transitions.test.ts` に新 transition（code-review → pr-create、pr-create → end / escalate）を追加
- [ ] ADR が `openspec-workflow/adr/` に出力され、kind=cli 採用判断 / merge 戦略 / commit message 規約 / PR body template 設計が記録されている
- [ ] CLI snapshot test が `--update-snapshot` なしで PASS する

## スコープ外（後続 request 候補）

- **学習層実装**: EventBus subscriber は予約席のまま
- **cost ledger**: 別系統
- **E2E 実機検証 + self-hosting 検証**: 本 request 完了後に dogfooding として別途実施
- **PR template の rich format**: 初版は最小限（背景 / 目的 / workflow summary）に留め、後続で findings table / spec link 等の rich content を検討
- **PR auto-merge / auto-approve**: 本 request では PR 作成までで停止。merge は別 request の `/request-merge` skill 経由（既存）
- **release notes 生成**: PR body と独立した release notes 自動生成は別 request

## 補足

### 設計分岐点（ADR で確定すべき項目）

1. **`kind` の選択（推奨: cli）**:
   - (a) `kind: "cli"` — gh CLI を spec-runner CLI 内で直接 spawn。verification と同じ pattern。LLM コスト不要、retry 機械的、test 容易
   - (b) `kind: "agent"` — pr-create 専用 agent を作成し、agent が gh CLI を tool で呼ぶ。LLM が body content を生成する自由度がある反面、cost と非決定性が増える
   - 推奨は (a)。LLM が必要なのは「PR body の整形」だが、これは template + state からの mechanical 抽出で十分。仮に rich body が必要になっても implementer / code-fixer の commit message を流用できる
2. **既存 PR 検出時の挙動**:
   - (a) 同 branch の OPEN PR があれば URL 記録のみで success
   - (b) 同 branch の MERGED PR があれば escalation（branch 再利用ケース）
   - (c) 同 branch の CLOSED PR があれば escalation（人間判断要）
3. **PR base branch**: `main` 固定 vs config 経由可変
   - 推奨: `main` 固定（後続 request で config 経由可変に拡張）
4. **commit message → PR body の関係**: implementer / code-fixer が作る commit messages を PR body に集約するか、独立に request.md ベースで生成するか
   - 推奨: 独立生成（commit messages は noisy になりがち）
5. **失敗時の retry**: gh CLI 失敗（rate limit / network / auth expired）時の retry 戦略
   - 推奨: retry なし、即 escalation。pipeline 全体の冪等性で再実行可能（同 branch から再 run 時に既存 OPEN PR を検出）

### Managed Agents SDK 制約（参考）

pr-create が `kind: "cli"` の場合は SDK 制約は無関係。`kind: "agent"` を選ぶ場合のみ、capabilities.gitWrite と独立した system prompt が必要（spec-fixer / code-fixer と同パターン）。

### 参照 ADR

- `openspec-workflow/adr/ADR-20260424-session-pipeline-design.md` — 4 直列セッションモデル
- `openspec-workflow/adr/ADR-20260429-step-and-agent-class-architecture.md` — Step 抽象 + AgentDefinition 所有
- `openspec-workflow/adr/ADR-20260430-step-kind-discriminator.md`（PR #36）— `kind: "agent" | "cli"` discriminator design
- `openspec-workflow/adr/ADR-20260430-code-review-fixer-agent-design.md`（PR #38）— review/fixer 分離パターン

### 参照 learned-patterns

- 「lifecycle 等の実行戦略はデータ存在で推論せず明示的 discriminator で宣言」 — pr-create の kind 選択
- 「migration の完了判定は production 経路の grep」 — 既存 step との並行運用期を作らず 1 PR で完結
- 「rename-as-MODIFIED」 — delta spec の MODIFIED ブロックで header 改変は禁止（archive 時の bug を避ける）
- 「openspec validate --strict は Requirement の最初の段落だけを SHALL/MUST 対象として scan する」

### 参照 PR

- PR #36（implementer + verification + build-fixer）— `kind` discriminator 導入
- PR #38（code-review + code-fixer）— review/fixer 分離パターン、本 request の直前段
- PR #34（port-tidying）— GitHubClient port purity（gh CLI は port を経由しない別系統）

### self-host 完成後のロードマップ

本 request 完了で SpecRunner は要件 → PR 作成まで自走する。続く dogfooding phase で:

1. **E2E 実機検証**: 過去の simple request（例: typo fix request）を SpecRunner 自身で再実行し、要件 → PR 作成まで通ることを確認
2. **学習層 v1**: EventBus subscriber を実装し、observation → instinct → rule の蓄積を始める（既に予約席は確保済み）
3. **cost ledger**: token / model 単位の cost 計測を pipeline state に集約
4. **rich PR body**: findings table / spec link / verification log link など PR body の rich format 化

これらは順序問わず並行可能。本 request の完成が dogfooding の入り口。
