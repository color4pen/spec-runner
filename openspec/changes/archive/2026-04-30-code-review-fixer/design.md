## Context

PR #36（implementer + verification + build-fixer）の merge により、SpecRunner pipeline は以下の状態にある:

```
propose → spec-review (loop with spec-fixer) → implementer → verification (loop with build-fixer) → end
```

PR #36 は `Step` を `AgentStep | CliStep` の判別 union として宣言し、`LOOP_ERROR_CODES: Record<StepName, ErrorShape>` を lookup table 化することで、**新 step / 新 loop の追加は「rows + entry」だけで完結する**構造を確立した（`pipeline-orchestrator` spec の "Pipeline はループごとのエラーコードを lookup table から取得する" Requirement 参照）。

本 request はこの構造を活用し、verification の機械検証（build / test）の後段に、人間相当の **コードレビュー** loop を追加する:

```
... → verification (passed) → code-review (loop with code-fixer) → end
```

設計対称性:

| Layer | 創造的 step | Verdict | Fixer | Loop |
|------|------------|---------|------|------|
| spec | propose | spec-review | spec-fixer | needs-fix → fixer |
| code (build) | implementer | verification | build-fixer | failed → fixer |
| **code (review)** | — | **code-review** | **code-fixer** | **needs-fix → fixer** |

主要制約:
- **Managed Agents SDK**: `SessionCreateParams` は `system` 上書き不可。Agent ごとに独立 system prompt が必要。code-review と spec-review は別 Agent として運用する。
- **review-standards.md**: `.claude/rules/review-standards.md` に severity / category / verdict / findings format / scoring の規約が確定済み。code-review はこれに準拠する。
- **review-feedback テンプレート**: `skills/execute-request/references/review-feedback-template.md` の形式に揃える。
- **`AgentStep` 規律**: PR #36 で D4-D6 として確立した「Step が AgentDefinition を所有」「`agent.role` が Anthropic 上の Agent identity と紐づく」原則。code-review / code-fixer は別 role として登録する。

## Goals / Non-Goals

**Goals:**
- code-review step（read-only review、verdict 付き findings 出力）を `AgentStep` として追加し、verification passed の直後に必ず実行されるようにする。
- code-fixer step（gitWrite, review-feedback findings に対する修正）を `AgentStep` として追加し、code-review needs-fix から起動されるようにする。
- `STANDARD_TRANSITIONS` / `LOOP_ERROR_CODES` / `Pipeline.loopNames` / `StepName` union への追加で完結させ、`Pipeline` / `StepExecutor` / `AgentRegistry` / `AgentSyncer` のコードは無編集に保つ（既存 spec が要件化している規律の検証）。
- `parseSpecReviewVerdict` の verdict 抽出 regex を共通化し、`code-review` でも再利用する（重複排除）。
- max 3 iterations の loop guard と escalation 経路、`CODE_REVIEW_RETRIES_EXHAUSTED` エラーコードを spec-review / verification と対称に整備。

**Non-Goals:**
- PR 作成 step の追加（後続 request）。本 request は `code-review --approved→ end` で止める。
- 学習層（EventBus subscriber、cost ledger）の実装。
- E2E 実機検証（self-hosting 完成までまとめて保留）。
- verification iteration numbering bug の修正（PR #36 で deferred、独立 request）。
- code-review の skip option / enable flag（小さい change で review を bypass する用途）— default で常時有効。
- `spec-fixer` を含めた verdict parser の更なる統合（spec-fixer は `NULL_PARSE_RESULT` のため対象外）。

## Decisions

### D1. Review observation の入力経路: agent 内の `git diff` 実行（option a）

**決定**: code-review agent は **agent 内の bash tool で `git diff main...HEAD` を実行**して diff を取得する。CLI 側で fetch して message に埋め込む方式（option b）は採用しない。

**根拠**:
- file size 制約（巨大 diff で message が肥大化）を構造的に避けられる。agent 側で必要な範囲を選択的に読める。
- `agent_toolset_20260401` には bash が含まれており追加 capability 不要。
- implementer / build-fixer も同様に bash で worktree を直接観察する pattern があり、対称的。
- mock しづらい点は test 側で `git` を stub する既存 pattern（`tests/unit/step/build-fixer.test.ts` 参照）で吸収可能。

**Alternative 比較**:
- (b) CLI が事前 fetch: reproducibility は高いが、diff サイズ制約と実装複雑度（filter ルール、include/exclude）の負債が大きい。本 request では却下。

### D2. Review observation の範囲: 全 diff + 関連 spec（差分内 path から推論）

**決定**: code-review system prompt は agent に対して以下を指示する:
- (1) `git diff main...HEAD` で全 diff を取得（`HEAD` は agent 実行時に常に解決可能。`<branch>` の state 注入不要）
- (2) 変更された path から関連する `openspec/changes/<slug>/` および `openspec/specs/` の spec を読む
- (3) `.claude/rules/review-standards.md` の severity / category 規約を参照

agent の自由度に委ねるため、CLI 側で changed-files を計算して渡すことはしない（D1 と整合）。

### D3. review-feedback.md format: spec-review-result.md と同形式（共通テンプレート）

**決定**: `review-feedback-NNN.md` は `spec-review-result-NNN.md` と同じ構造を踏襲する:

```markdown
# Code Review Feedback — iteration NNN

- **verdict**: approved | needs-fix | escalation
- **iteration**: NNN

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| ... |

## Summary

<1-3 sentences>
```

**根拠**:
- `parseReviewVerdict` の regex を共通化できる（D5）。
- review-standards.md の Findings Format（severity / category / file / description / how to fix）にそのまま乗る。
- ファイル名規約: `review-feedback-NNN.md`（zero-padded、3 桁）。spec-review の `spec-review-result-NNN.md` と対称。

### D4. code-fixer の retry 上限: `Pipeline.maxIterations` の既定値 3 を流用

**決定**: code-review ↔ code-fixer cycle の max iterations は `Pipeline` constructor の既存 `maxIterations` パラメータ（既定 3）を共有する。spec-review / verification と独立した上限値は持たない。

**根拠**:
- spec-review / verification と同じ上限で運用する方が運用上シンプル（diagnose の起点が同じ）。
- 個別に上限を変えたくなった時は `LOOP_ERROR_CODES` を `{ code, message, hint, maxIterations? }` に拡張すればよい（YAGNI で本 request では入れない）。
- escalation 時のエラーは `CODE_REVIEW_RETRIES_EXHAUSTED` を新設し、`LOOP_ERROR_CODES["code-review"]` に登録。`message: (n) => \`code-review did not approve after ${n} iterations\``、`hint: (nnn) => \`Review review-feedback-${nnn}.md and address findings manually.\`` とする（既存 `LoopErrorShape` の関数型と一致）。

### D5. verdict parser の共通化: `parseReviewVerdict` を `src/core/parser/review-verdict.ts` に抽出

**決定**: `spec-review.ts` 内の `parseSpecReviewVerdict` の verdict 抽出 regex を `src/core/parser/review-verdict.ts` の `parseReviewVerdict(content: string): Verdict | null` に抽出し、`spec-review.ts` と新 `code-review.ts` の両方が `parseResult` から呼び出す。

**範囲**:
- 共通化対象は **verdict 抽出 regex のみ**（`- **verdict**: (approved|needs-fix|escalation)` をマッチ）。
- findings table 全体の解析は共通化しない（spec-review / code-review で必要情報が異なる場合に備え、本 request の責務を verdict + summary に絞る）。
- `parseSpecReviewVerdict` の関数自体は wrapper として残し、内部で `parseReviewVerdict` を呼ぶ（call site の互換性維持、step-execution-architecture spec に出てくる関数名を変えない）。

**根拠**:
- request.md の「共通化候補」セクションで明示的に指示されている。
- regex は 1 ヶ所定義、複数 step 利用が rule of three 的に正当化される（既に spec-review にあり、code-review が 2 つ目）。
- file findings 全体の parse は YAGNI（呼び出し側が verdict だけ見る contract のため）。

### D6. Agent definitions: 別 Agent / 別 role / 別 system prompt

**決定**:
- `code-review` Agent: name = `specrunner-code-review`, role = `"code-review"`, model = `claude-sonnet-4-5`, capabilities なし（read-only）, system = `CODE_REVIEW_SYSTEM_PROMPT`（`.claude/rules/review-standards.md` の規約を参照する内容）
- `code-fixer` Agent: name = `specrunner-code-fixer`, role = `"code-fixer"`, model = `claude-sonnet-4-5`, capabilities = `{ gitWrite: true }`, system = `CODE_FIXER_SYSTEM_PROMPT`（「review-feedback HIGH/MEDIUM findings に対する code 修正のみ。仕様変更や追加機能禁止」を明示）
- `tools` は両者とも `agent_toolset_20260401`

**根拠**:
- Managed Agents SDK 制約: `SessionCreateParams` の system 上書き不可 → role ごとに独立 Agent。
- spec-review が propose Agent を流用していた anti-pattern を D4-D6 で解消した規律を継承。
- code-review は read-only なので `gitWrite` capability なし。code-fixer は push が必要なので `gitWrite: true`。

### D7. completionVerdict と resultFilePath の規律

**決定**:
- `code-review.resultFilePath(state)` → `openspec/changes/<slug>/review-feedback-${zeroPad(iter, 3)}.md`
- `code-review.parseResult(content)` → `parseReviewVerdict(content)` の結果から `StepOutcome` を構築
- `code-fixer.resultFilePath(state)` → `null`（spec-fixer / build-fixer と同じ）
- `code-fixer.parseResult` → `NULL_PARSE_RESULT` を返す（既存定数流用）
- `code-fixer.completionVerdict` → `"approved"`（`code-fixer --approved→ code-review` 用、spec-fixer と同じ default）

### D8. Pipeline 配線: `loopNames` 既定値の拡張

**決定**: `Pipeline` constructor の `loopNames` パラメータ既定値を `["spec-review", "verification"]` から `["spec-review", "verification", "code-review"]` に拡張。

**根拠**:
- iteration 進捗 stdout（`[iter <N>] <loopName> starting`）が code-review 側でも出るようにするため。
- 「ループの方向（前進 / 復帰）を判定する規約」と整合（既存 `pipeline.ts` のロジックは `loopNames` を集合として使う）。

## Risks / Trade-offs

- **Risk**: agent 内 bash で `git diff main...HEAD` を打つと diff が巨大な時にコンテキスト圧迫。
  → **Mitigation**: system prompt で「まず `git diff --stat` で全体把握 → 重要ファイルから順に読む」を指示。それでも溢れる場合は escalation を許容（review-standards で escalation を正当な verdict として認めている）。

- **Risk**: code-fixer が review-feedback の MEDIUM までを盲目的に修正し、過剰変更が起きる。
  → **Mitigation**: system prompt で「**HIGH 以上を必ず修正、MEDIUM は spec/設計上妥当な範囲のみ**。LOW は無視」を明示。verdict が `approved` 化するための最小修正に留める原則を書く。

- **Risk**: code-review が verification と独立に code-review 専用の test 失敗を検出した場合、verdict は何にするか曖昧。
  → **Mitigation**: review-standards.md の通り「testing カテゴリは Scenario Coverage（test-cases.md must シナリオ実装率）の評価専用」「verification PASS / FAIL の判定軸とは別」と明示。code-review が test 実行で失敗を見つけた場合は HIGH finding として扱い、code-fixer が修正後に verification も再実行されるルートは本 request の transition には含まれない（code-fixer → code-review に戻るのみ）。code-fixer が build を壊した場合の検出は次 iteration の code-review が拾う形になる。これは設計上の trade-off として受容（後続 request で `code-fixer → verification` の re-route を検討）。

- **Risk**: `parseSpecReviewVerdict` の wrapper を残すことで間接呼び出しが増える。
  → **Mitigation**: wrapper は 1 行（`return parseReviewVerdict(content)`）で済むため負荷ゼロ。call site の互換性維持を優先。

- **Trade-off**: code-review の skip option を入れない選択。小さい change（typo 修正等）で review overhead が発生する。
  → **Rationale**: 本 request では skip option を入れず、後続で必要になれば transition table に branching を入れる。YAGNI 優先。

## Migration Plan

本 request はバージョンアップではなく内部 pipeline 構造の追加のみ。migration 手順:

1. **dev**: `git checkout feat/code-review-fixer && bun install`
2. **specrunner init** を実行 → AgentRegistry が新 2 Agent を Anthropic に作成（既存 5 Agent は no-op）
3. **既存 request の resume**: 既に verification passed 済みの request は `code-review` step が未実行のため、resume 時に自動的に code-review から再開される（state machine が transition row を見て次の step を決める）。
4. **rollback**: 配線除去で前の状態に戻せるが、既に `code-review` を経由した state file は `StepName` が拡張前の union に存在しない値を含む可能性があるため、rollback 時は当該 request を canceled に遷移させる運用で対応（コード自動 migration は不要）。

## Open Questions

- `code-fixer` が build を壊した場合の検出経路（現状: 次 iteration の code-review で拾う）。後続 request で `code-fixer → verification → code-review` の re-route を入れるか検討。
- `review-feedback-NNN.md` の iteration N と verification の iteration N の番号空間が独立であることの可視化（PR #36 deferred）。
- code-review に渡す diff の base ref（`main` 固定 vs request 開始時の base ref を state に保持）— 当面は `main` 固定で運用、将来的に sub-branch workflow が必要になれば再検討。
