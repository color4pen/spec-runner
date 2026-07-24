# Spec Review Result

## 検証した項目

### request.md の前提検証

- `src/prompts/spec-review-system.ts` の `## Method` 節（行 34–49）を実際に読み確認。全量列挙規律が存在しないことを確認（baseline 記述が正確）
- `src/kernel/report-result.ts` の `Finding` 型を確認。`file: string`（必須）、`line?: number`（optional）、`origin?: "scope"` が存在し、request.md の前提と一致
- `src/core/step/step-completion.ts`（行 232–250）の verifyFindingRefs 呼び出しブロックを確認。verdict 導出後に走ることを確認
- `src/state/helpers.ts`（行 106）の `commitOid` フィールドを確認。StepRun に存在し request.md の前提と一致
- `src/store/event-journal.ts` の `appendEventRecord` / `fold()` / `LineageRecord` を通読。journal-only 記録の前例（lineage / operator-event）を確認
- `src/core/step/commit-orchestrator.ts` の `applySuccessPostPersistEffects` メソッドを全文確認。lineage の best-effort hook が配置済で、verdict 確定・永続化（`store.persist`）後に走ることを確認
- `src/kernel/step-names.ts` にて `STEP_NAMES.SPEC_REVIEW = "spec-review"` の存在を確認
- `src/core/port/runtime-strategy.ts` の `RealRuntimeStrategy` 交差型を確認。`readRevisionContent` が未実装であり T-03 で追加必要なことを確認

### spec.md の要件検証

**Requirement: spec-review prompt は finding の全量列挙を要求する**
- spec.md のシナリオと request.md 要件 1 の対応を確認。3 要素（全量列挙・小出し禁止・後出し機械記録）が spec で MUST として規定されている
- tasks.md T-01 の受け入れ基準（Method 節抽出に対する assert）と対応していることを確認

**Requirement: 後出し判定は純関数として 3 値を返す**
- `classifyFindingRecency` の 4 判定規則（null targetLine → indeterminate、null priorContent → indeterminate、空白 needle → indeterminate、trim 一致 → late/not-late）を spec・design・tasks 間で照合。三者間で矛盾なし

**Requirement: iteration 2 以上の spec-review 完了で後出し判定を journal に記録する**
- D3（post-persist best-effort 配置）の実装位置と spec 要件の対応を確認
- `applySuccessPostPersistEffects` 内で `s`（post-projectSuccess state）を使うため `state.steps["spec-review"].length` = current iteration となる点を実コード照合で確認

**Requirement: iteration 1 では後出し判定を実行しない**
- `recordFindingRecency` の `iteration < 2` early return が spec の MUST NOT に対応することを確認

**Requirement: 後出し検出は verdict を変更しない**
- D3 の構造的保証（verdict 確定・`store.persist` 後に後出し検出が走る）が `commit-orchestrator.ts` の実行順序と整合していることを確認
- `step-completion.ts` が変更対象外である（verdict 導出に後出し検出が差し込まれない）ことを tasks T-06 で明示されており、spec の MUST NOT と対応

**Requirement: 後出しがある round では stderr に要約を出す**
- spec.md に MUST 要件としてシナリオ付きで規定されていることを確認
- tasks.md T-04 の実装記述に `stderrWrite` による 1 行出力が含まれることを確認

### design.md の検証

- D1（prompt 規律 + 後出し検出の二層）、D2（観測信号・verdict 不変）、D3（post-persist 配置）、D4（純関数 + 薄い配線 + runtime seam）、D5（journal-only EventRecord）の五意思決定を通読
- `managed` runtime での常時 indeterminate（prior = null）設計が安全かつ spec 整合であることを確認
- FoldResult.findingRecency optional field 設計と、既存 ENOENT branch リテラルの無改変通過の整合を確認（`src/store/job-journal.ts` と `src/store/job-state-projection.ts` の初期値リテラルを確認）

### tasks.md の検証

- T-01 〜 T-07 の受け入れ基準と request.md の 6 受け入れ基準の対応を照合
- T-01 → 受け入れ基準 1（prompt contract テスト）
- T-02 → 受け入れ基準 2（純関数 3 値テスト）
- T-03 → 型強制（typecheck）
- T-04 → 受け入れ基準 3・4・5
- T-05 → journal 記録 round-trip テスト
- T-06 → 受け入れ基準 4・5（verdict 不変テスト）
- T-07 → 受け入れ基準 6（typecheck && test green）

### セキュリティ観点

- 後出し検出が扱う入力（finding の file/line、git OID、worktree ファイル内容）はすべて pipeline 内部データ。外部ユーザー入力の流入経路なし
- `git show <priorOid>:<file>` の OID は state に記録済の pipeline 管理 OID であり、外部注入不可
- 機密情報（認証トークン等）の journal への漏出経路なし（finding の title/rationale が記録されるが、これは仕様成果物の記述）
- OWASP Top 10 適用対象外（CLI ツール・パイプライン内部処理）

## 検証できなかった項目

- `src/core/runtime/local.ts` および `src/core/runtime/managed.ts` の `readRevisionContent` 実装（未実装のため、実装後にのみ検証可能）
- `src/core/step/finding-recency.ts`（未作成のため検証不可）
- `bun run typecheck && bun run test` の実行（未実装段階のためスキップ）

## Findings 詳細

### F-001: spec.md の MUST 要件「stderr 要約出力」に対応する acceptance criterion が tasks/request.md に不在

**対象**: spec.md の Requirement「後出しがある round では stderr に要約を出す」は MUST として規定し、シナリオ「late が 1 件以上で stderr 要約が出る」まで備えている。しかし request.md の 6 受け入れ基準および tasks.md T-04 の acceptance criteria には「stderr に要約が出ること」を固定するテストが含まれない。

T-04 の実装記述には `stderrWrite` 呼び出しが記載されているが、acceptance criteria として「late ≥ 1 のとき stderr に要約 1 行が出力されることをテストで固定する」に相当する項目が欠落している。T-07「typecheck && test green」のみでは、実装者が stderr 出力を省略しても gate を通過できる。

**修正**: tasks.md T-04 の acceptance criteria に「`late` が 1 件以上の結果で `recordFindingRecency` を呼んだとき stderr に要約 1 行が出力されることをテストで固定する」を追加する。request.md の受け入れ基準にも対応項目を追加することで spec の MUST 要件が機械固定される。

### F-002（observation）: `finding.line` が optional であるため、行番号なし finding は常に indeterminate になる

spec-review agent は `line` を optional として提供でき、実運用でも省略ケースが多い。spec.md は indeterminate を正しく定義しているが、信号密度が低くなりうる点（observation signal として実質的に効果が出ない round が生じる）への言及が design.md に薄い。後出し検出の有効性を評価する際には本制約を念頭に置く必要がある。これは observation 性質（blocking なし）だが、設計者が承知の上で記録に留める。
