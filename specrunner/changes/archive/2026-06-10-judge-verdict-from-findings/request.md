# judge 系 step の verdict を構造化 findings から CLI が導出する

## Meta

- **type**: spec-change
- **slug**: judge-verdict-from-findings
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

judge 系 step（spec-review / code-review / request-review）の verdict は、agent が report_result tool で申告する `approved` boolean（`src/core/step/executor.ts:473-475`）をそのまま採用している。一方で指摘内容は agent が markdown の result ファイルに書いており、verdict とファイルの内容を突き合わせる仕組みがない。このため「CRITICAL を列挙しながら approved」「non-blocking 指摘で needs-fix を返しループが止まらない」という findings と verdict の不整合が構造的に起き得る。

agent の判断を「finding 単位のラベル付け」に限定し、verdict の集計（合否・fixer 行き・escalation 行き）を CLI の決定的な関数に移すことで、この不整合を構造的に排除する。

## 要件

1. report_result tool のスキーマ拡張: JUDGE_REPORT_TOOL / CODE_REVIEW_REPORT_TOOL / REQUEST_REVIEW_REPORT_TOOL（`src/core/step/report-tool.ts`）に `findings` 配列を追加する。各 finding は `{ severity: "critical"|"high"|"medium"|"low", resolution: "fixable"|"decision-needed", file: string, line?: number, title: string, rationale: string }`。`approved` boolean は verdict 導出に使用しない（互換のためフィールドは残してよい）
2. 手書き parser の拡張: `parseJudgeReportInput` / `parseCodeReviewReportInput` / `parseRequestReviewReportInput`（`src/core/port/report-result.ts`）で findings 配列を構造検証する。不正な構造は既存の follow-up retry（invalid-input）に乗せる。parseInput は純粋関数のまま維持する（B-5）
3. verdict 導出の差し替え: `executor.ts` finalizeStep の judge 分岐で、findings から決定的に verdict を導出する。優先順位は (1) `ok: false` → escalation（findings の内容に関わらず最優先）、(2) decision-needed が 1 件以上 → escalation、(3) critical/high が 1 件以上 → needs-fix、(4) それ以外 → approved。`fixableCount` は `approved` と同様に verdict 導出に使用しない（フィールドは互換のため残す）。request-review は findings から 2 値で導出する — blocking（critical / high / decision-needed）が 1 件以上 → needs-discussion、なければ approve。reject は導出しない（pipeline 上 needs-discussion と reject はどちらも escalate に遷移し（`src/core/pipeline/types.ts:128-129`）、escalation で人間が見るのは findings 自体のため、ラベルの区別を agent 判断で維持する価値がない。transitions の reject 行は互換のため残してよい）
4. findings の実在検証: verdict に影響する findings（critical / high / decision-needed）に限定して、finding の `file` / `line` が実在するかをセッション終了後に検証する。low / medium は検証対象外（verdict を変えないため）。runtime 差異（local = worktree の fs、managed = GitHubClient.getRawFile）は RuntimeStrategy の seam に置く（B-8）。実在しない参照を含む場合の verdict は escalation に倒す
5. 永続化: StepRun の `toolResult` 型（`src/state/schema.ts:116`）を findings を含む型に広げ、findings が job state に記録されるようにする
6. fixer への入力: spec-fixer / code-fixer の buildMessage で、findingsPath のファイル参照ではなく state 内の構造化 findings を prompt 本文に埋め込んで渡す（`src/core/step/fixer-helpers.ts` の継続 prompt を含む）。build-fixer は対象外 — findings 源が verification（CLI step）の prose result ファイルであり構造化 findings が存在しないため、現行の findingsPath 方式を維持する。直前の judge run が findings を持たない場合（旧 toolResult を持つ job の resume）は findingsPath 方式にフォールバックする
7. judge 系 system prompt の更新: findings 配列の提出を指示し、severity / resolution の判定基準を明記する
8. toolResult が null（no-tool-call フォールバック）の場合の judge verdict は needs-fix から escalation に変更する

## 外部制約

- zod/v4-mini は `array(object({...}))` と `toJSONSchema` による JSON Schema 変換をサポートしている（動作確認済み）。managed runtime の tools.input_schema 変換は既存の `toCustomToolSpec` 経路をそのまま使える
- managed runtime では CLI からブランチへのファイル書き込みができない（`src/core/runtime/managed.ts:306` finalizeStepArtifacts は no-op、GitHubClient に content 書き込み API がない）。したがって構造化 toolResult を唯一の正とし、markdown result ファイルをルーティング・fixer 入力の load-bearing から外す。CLI による markdown 生成・commit は要件に含めない
- managed runtime の実在検証は finding 1 件につき getRawFile 1 回の GitHub API 呼び出しになる

## スコープ外

- verification step（CLI step）の `## Verdict:` regex parse の置き換え
- producer 系 step（design / implementer / fixer）の report_result スキーマ変更
- agent が任意で書く markdown result ファイルの廃止（記録として残してよい）
- prompt injection 対策（request.md / git log のサニタイズ）

## 受け入れ基準

- [ ] judge 系 step の verdict が findings の集計のみから決まり、`approved` boolean が routing に影響しない
- [ ] findings に decision-needed が含まれる場合に pipeline が escalation 経路に入る
- [ ] 実在しない file を指す finding を含む報告が approved にならない（escalation になる）
- [ ] findings と verdict の不整合（critical を含む approved 等）が構造的に発生しないことをテストで示す
- [ ] no-tool-call フォールバック時および `ok: false` 報告時の judge verdict が escalation である
- [ ] findings を持たない旧 toolResult の job を resume したとき fixer が findingsPath 方式で動作する
- [ ] fixer が findings を prompt 経由で受け取り、findingsPath のファイル読み込みに依存しない
- [ ] local / managed 両 runtime で実在検証が機能する（managed は GitHubClient mock でテスト）
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- verdict 集計の決定化は「AI の非決定性を step の中に封じ込め、orchestrator は決定的に保つ」原則（汎用パイプライン構想・設計原則 1）に合致する
- pipeline 本体のルーティング（loopFixerPairs / exhaustion / escalation）は verdict 語彙を変えないため無変更で成立することを実装確認済み
- 実在検証の runtime 分岐を RuntimeStrategy に置くのは B-8（runtime 分岐集約)に沿う
- parseInput の純粋性（B-5）を保つため、構造検証はセッション内 retry、実在検証はセッション後の事後検証に分離する
