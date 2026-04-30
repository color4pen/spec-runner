# ADR-20260430: code-review / code-fixer Agent 設計判断

> 本 ADR は `code-review-fixer` request の design.md（D1, D5, D7）と code-review iteration 1 の F1 finding から学んだ executor 一般化教訓を ADR 化したもの。verification の後段に組み込む実装層レビューループを構成する 2 Agent の境界、共通化の境界線、そして「step.resultFilePath() を呼び出さず executor 内に hardcode する」アンチパターンの再発防止方針を記録する。

## ステータス

accepted

## コンテキスト

PR #36 の merge 後、SpecRunner pipeline は以下の状態にある:

```
propose → spec-review (loop with spec-fixer) → implementer → verification (loop with build-fixer) → end
```

spec 層と code 層（build/test）の self-correct loop は揃ったが、**implementer の diff に対する人間相当のレビュー**（spec ではなくコード品質・設計判断・regression 検出）が pipeline に存在しない。`code-review-fixer` request はこの欠落を埋め、verification passed の後段に code-review ↔ code-fixer の loop を追加する。

実装にあたり、以下の分岐点で判断が必要だった:

1. **review observation の入力経路** — agent が自身で `git diff` を打つか、CLI が事前 fetch して message に注入するか
2. **verdict parser の共通化境界** — `parseSpecReviewVerdict` を抽象化して 2 step で共有するか、各 step に同じ regex を持たせるか
3. **code-fixer の completionVerdict 表記** — Step interface の default に依存するか、明示的に "approved" を書くか
4. **executor の resultFilePath 一般化** — code-review iteration 1 で発覚した HIGH finding（F1）の構造的根本原因への対処

### 制約

- **Anthropic Managed Agents SDK**: `SessionCreateParams` は `system` 上書き不可。Agent ごとに独立 system prompt が必要（PR #28 の D4-D6 で確立した規律）
- **`AgentStep | CliStep` discriminated union**（PR #36）: 新 step 追加は transition row + LOOP_ERROR_CODES entry のみで完結する規律
- **review-standards.md**: severity / category / verdict / findings format が確定済み。code-review はこれに準拠する

## 決定

### D1. review observation の入力 = agent 内 `git diff main...HEAD`（option a）

code-review agent は **agent 内の bash tool で `git diff main...HEAD` を実行**して diff を取得する。CLI 側で事前 fetch して message に注入する方式（option b）は採用しない。

根拠:
- diff サイズの構造的吸収（agent 側で必要範囲を選択的に読める）
- `agent_toolset_20260401` に bash が含まれており追加 capability 不要
- implementer / build-fixer も bash で worktree を直接観察する pattern と対称
- mock しづらい点は `tests/unit/step/build-fixer.test.ts` の git stub pattern で吸収可能

### D5. `parseReviewVerdict` 共通 helper への抽出と wrapper 維持

`spec-review.ts` の `parseSpecReviewVerdict` の verdict 抽出 regex を `src/core/parser/review-verdict.ts` の `parseReviewVerdict(content): Verdict | null` として抽出し、`spec-review.ts` と `code-review.ts` の両方が `parseResult` から delegate する。

境界:
- 共通化対象は **verdict 抽出 regex のみ**（`- **verdict**: (approved|needs-fix|escalation)`）
- findings table 全体の parse は共通化しない（各 step で必要情報が異なる場合に備え、責務を verdict + summary に絞る）
- `parseSpecReviewVerdict` は **1 行 wrapper として残す**（`return parseReviewVerdict(content)`）。call site の互換性維持と step-execution-architecture spec の関数名安定性を優先

根拠:
- rule of three（既存 1 + 新規 1 = 2）で抽出が正当化される
- pure 関数として単独テストが容易になる（現状は spec-review.test.ts 経由でしか間接テストできていない問題を解消）
- spec 層の関数名を変えると step-execution-architecture spec の wording を更新する波及が発生する

### D7. `code-fixer.completionVerdict = "approved"` 明示記述

`code-fixer.ts` の Step 定義で `completionVerdict: "approved"` を **明示的に書く**。Step interface の default 値（`completionVerdict ?? "approved"`）に依存しない。

根拠:
- 将来 default が変わった時の silent break を防ぐ（module-analysis.md R6）
- transition row `{ step: "code-fixer", on: "approved", to: "code-review" }` と call site の verdict が同じ識別子であることが grep 一発で確認できる
- spec-fixer も同じ規律を満たすべきだが本 request の scope 外（後続のリファクタで対応）

### D-F1. executor.ts の resultFilePath 一般化（review iter1 HIGH より）

code-review iteration 1 の F1 finding で `src/core/step/executor.ts` の `runPollingStyleStep` が `step.resultFilePath()` の戻り値を **無視して** `buildFindingsPath(slug, iteration)` を呼び出していたことが判明した。`buildFindingsPath` は spec-review 専用の命名規則（`spec-review-result-NNN.md`）を返すため、`CodeReviewStep` 実行時に「state には `review-feedback-001.md` が記録されるが GitHub fetch は `spec-review-result-000.md` を取りに行く」という対称性破綻が発生していた。

決定:
- executor.ts から `buildFindingsPath` の import と呼び出しを削除する
- GitHub fetch path は `step.resultFilePath(state, deps)` の戻り値（既に line 680 で `findingsPath` に格納されている）を直接利用する
- `buildFindingsPath` は `spec-review.ts` 内の private helper として残す（test fixture が format を確認する目的でのみ export される）

教訓（汎用化）:
- **executor は step 固有のファイル名規則を一切知ってはならない**。Step に問い合わせる（`step.resultFilePath`）のが唯一の正解
- 実行時 fetch パスと state 記録パスは **同一の関数呼び出しから派生** すべき。2 経路で別々に計算すると今回のような silent divergence が発生する
- substring matching の test mock（`filePath.includes("spec-review-result")`）はこの種の bug を隠蔽する。**末尾一致の正規表現**（`/spec-review-result-\d{3}\.md$/`）か exact equality を必須とする

## Alternatives Considered

### D1 の代替: option (b) CLI 側で事前 diff fetch

- **Pros**: reproducibility が高い（agent 実行時の git state に依存しない）、test で diff を fixture として注入できる
- **Cons**: 巨大 diff で message が肥大化、include/exclude rule の実装複雑度、追加された path の filter ルールを CLI に持つことになる
- **Why not**: 構造的負債が agent 側より大きい。implementer / build-fixer が既に bash で worktree を直接見る pattern を確立しており、対称性の方が運用上のメリットが大きい

### D5 の代替: findings table 全体を含めた `parseReviewResult` 抽出

- **Pros**: 将来 spec-review / code-review が findings table の parse 結果を必要とした時に重複しない
- **Cons**: 現時点で呼び出し側は verdict だけしか見ない（findings table parsing は run.ts:32-60 の inline）。先回り抽出は YAGNI
- **Why not**: rule of three を満たさない（呼び出し側が verdict だけ見る contract が確立している）。過剰共通化は将来の差異を吸収できる柔軟性を奪う

### D5 の代替: `parseSpecReviewVerdict` を完全削除し全 call site を `parseReviewVerdict` に書き換え

- **Pros**: 中間層（wrapper）が消え、呼び出し経路が直接的になる
- **Cons**: step-execution-architecture spec に出てくる関数名 (`parseSpecReviewVerdict`) を更新する波及、既存 unit test の mock target 名変更
- **Why not**: 1 行 wrapper の維持コストはゼロに近い。spec wording の安定性と test 互換性を優先

### D7 の代替: Step interface の default 値に依存

- **Pros**: 記述が短くなる
- **Cons**: 将来 `completionVerdict` の default が変わると silent break。grep で transition と call site の verdict 一致を確認できない
- **Why not**: 1 line の冗長性 vs silent break リスクのトレードオフで明示記述が勝つ

### D-F1 の代替: `buildFindingsPath` を generic 化（`buildFindingsPath(slug, iteration, prefix)`）

- **Pros**: executor が引き続きパス計算する経路を残せる
- **Cons**: そもそも executor が「step 固有の命名規則」を知るべきではない（責務違反）。prefix 引数で済むのは現在の 2 step だけで、step が増えると分岐が増える
- **Why not**: 構造的に「Step に問い合わせる」が正しい。generic helper を残すことは責務の漏れを温存する

## Consequences

### Positive

- code-review / code-fixer Step は既存 4 step（spec-review / spec-fixer / implementer / build-fixer）と機械的に対称な構造になる
- `parseReviewVerdict` の pure 関数化により単独 unit test (`tests/unit/parser/review-verdict.test.ts`) が成立、spec-review.test.ts 経由の間接テストから独立する
- executor.ts は「step に問い合わせる」原則を満たし、step 固有の命名規則から解放される。今後 result-file-bearing step を追加しても executor 編集は不要
- transition table の追加だけで loop 拡張が完結する PR #36 の規律を、本 request も維持する

### Negative

- `parseSpecReviewVerdict` wrapper の存在で間接呼び出しが 1 段増える（実害なし、IDE jump で解決可能）
- code-fixer の `completionVerdict: "approved"` 明示記述は冗長に見える（spec-fixer 等にも同じ規律を波及させる必要があるが本 request の scope 外）
- executor の `runPollingStyleStep` から `buildFindingsPath` 呼び出しを削除した結果、F1 の症状を test で防止する責務は integration test mock の path matcher 厳格化に移った（`/review-feedback-\d{3}\.md$/` 末尾一致を必須とする）

### Risks

- **Risk**: code-fixer が build を壊した場合の検出経路は次 iteration の code-review でしか拾えない（code-fixer → code-review → ... と進み、code-review 内で test 失敗を HIGH finding として扱う）
  - **Mitigation**: review-standards.md の「testing カテゴリ = Scenario Coverage 評価」「verification PASS/FAIL = 別軸」の境界を尊重。後続 request で `code-fixer → verification → code-review` の re-route を検討
- **Risk**: agent 内 bash で `git diff main...HEAD` を打つ時、巨大 diff でコンテキスト圧迫
  - **Mitigation**: system prompt で「`git diff --stat` で全体把握 → 重要ファイルから順に読む」を指示。それでも溢れる場合は escalation を許容（review-standards で escalation を正当な verdict として認定済み）
- **Risk**: 末尾一致の test mock を rule として明文化していないと、別の step 追加時に再び substring matching が混入する可能性
  - **Mitigation**: `tests/grep-no-step-name-hardcode.test.ts` 系の grep test に「mock path matcher で includes 利用を禁止する」rule を追加することを後続課題として記録（本 ADR の Known Design Debt）

### Known Design Debt

- **executor の `findingsPath` 命名**: 変数名が spec-review 由来（findings = 指摘事項）に引きずられている。code-review でも同じ変数名を使うが、本来は `resultFilePath` のままで通すのが対称的。本 request では呼び出し側の互換性維持を優先し改名を見送る（後続のリファクタで `findingsPath` → `resultFilePath` への統一を検討）
- **spec-fixer の `completionVerdict` 明示化**: D7 の規律は spec-fixer にも適用すべきだが本 request の scope 外。次回 fixer 系を編集する request で同時対応する
- **`run.ts:32-60` の findings summary parser の inline 実装**: code-review の findings format は spec-review と同形式のため、将来 `src/core/parser/findings-summary.ts` への抽出候補。YAGNI で本 request では実施しない（rule of three 未達）
- **review-feedback iteration 番号と verification iteration 番号の独立性**: PR #36 で deferred になった verification numbering bug を解消した上で、両者の番号空間が独立であることを progress.md / state file 上で可視化する設計改善が残っている

## 関連 ADR

- `ADR-20260429-step-and-agent-class-architecture.md` — Step 抽象 + AgentDefinition 所有規律（D4-D6）
- `ADR-20260430-verification-cli-resident-step.md` — `kind: "agent" | "cli"` discriminator
- `ADR-20260430-implementer-build-fixer-separation.md` — Managed Agents SDK 制約に基づく fixer 分離規律。本 ADR の D1（agent 内 bash で観察）と対称
- `ADR-20260429-spec-review-pipeline.md` — file-based verdict / `pollUntilComplete` 再利用。本 ADR の D5（parser 共通化）の前提

## 関連 request

- `openspec-workflow/requests/active/code-review-fixer/` — 本 ADR の生成元 request
- `openspec/changes/code-review-fixer/design.md` — D1, D3-D8 の詳細根拠
- `openspec-workflow/requests/active/code-review-fixer/review-feedback-001.md` — F1 finding の原文
- `openspec-workflow/requests/active/code-review-fixer/decisions/code-fixer.md` — F1 修正の implementer 判断記録
