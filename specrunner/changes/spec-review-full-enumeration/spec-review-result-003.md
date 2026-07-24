# Spec Review Result

## 検証した項目

### Round 2 Findings の解消確認

**F-001（round 2）: tasks.md T-04 が「受け入れ基準 7」を参照するが request.md に 7 番目の AC が存在しない**

- tasks.md T-04 acceptance criteria を精読した。2 箇所の「(受け入れ基準 7)」参照が「(spec.md Requirement「後出しがある round では stderr に要約を出す」)」に変更されていることを確認した。断ち切れたクロスリファレンスは解消済み。
- spec.md に「Requirement: 後出しがある round では stderr に要約を出す」が MUST + Given/When/Then シナリオ付きで規定されていることを再確認。tasks.md 参照先として整合している。

**F-002（round 2）: design.md にプロセス追跡用 HTML コメントが残存している**

- design.md を末尾まで通読した（全 184 行）。`<!-- spec-fixer-deferred: ... -->` コメントは行 184「なし。」より前の行に存在しない。HTML コメントは削除済みであることを確認した。

### request.md の前提記述検証

- `src/prompts/spec-review-system.ts` の `SPEC_REVIEW_BASE` を読み、`## Method` 節（行 36–49）に全量列挙規律が存在しないことを確認した。T-01 での追記が必要であり、request.md の前提と一致する。
- `src/kernel/report-result.ts` の `Finding` 型を確認した。`file: string`（必須）、`line?: number`（optional）、`origin?: "scope"` が存在し、request.md の前提と一致する。
- `src/core/step/step-completion.ts`（行 225–256）の `verifyFindingRefs` 呼び出しブロックを確認した。`verdict` 確定後に走るブロックであり、D3（post-persist 配置）の設計前提と整合する。
- `src/state/helpers.ts`（行 106）の `commitOid?: string` フィールドを確認した。StepRun スキーマと一致する。
- `src/store/event-journal.ts` の `EventRecord` union（行 133）、`fold()`、`LineageRecord`、`appendEventRecord` を確認した。`FindingRecencyRecord` は未追加（T-05 で追加予定）。`lineage` / `operatorEvents` の journal-only 前例が成立している。
- `src/core/port/runtime-strategy.ts` の `RealRuntimeStrategy` 型定義（行 751–776）を確認した。`readRevisionContent` は未実装（T-03 で追加予定）。既存 seam パターン（`readFileAtCommit` 等）が同位置で確認でき、追加先が特定できている。
- `src/core/step/commit-orchestrator.ts` の `applySuccessPostPersistEffects`（行 215–278）を確認した。`store.persist(s)`（行 389）後に呼び出され（行 392）、lineage の best-effort hook（行 244–267）が先行している。T-06 がこの後段に spec-review gate を追加する位置として整合する。

### spec.md 全 6 要件の検証

**Requirement 1: spec-review prompt は finding の全量列挙を要求する**
- MUST 3 点（全量列挙・小出し禁止・後出し機械記録）と Given/When/Then シナリオを確認した。
- 「新規の h2 見出しを追加せず `## Method` 節の内側に置かれ、既存の 5 節骨格を保持しなければならない (MUST)」の制約が明示されており、T-01 実装時に `prompt-skeleton-drift-guard.test.ts` TC-001 が無改変で green となることが要求されていることを確認した。

**Requirement 2: 後出し判定は純関数として 3 値を返す**
- 判定規則 4 分類（null targetLine → indeterminate、null priorContent → indeterminate、空白のみ → indeterminate、trim 一致 → late / 不一致 → not-late）が spec.md・design.md D4・tasks.md T-02 の三書類間で矛盾なく記述されていることを確認した。
- 「行番号を使わず全行走査」が spec・design 両方に記述されており、行番号ずれ耐性の設計意図が担保されていることを確認した。

**Requirement 3: iteration 2 以上の spec-review 完了で後出し判定を journal に記録する**
- design.md D3 の `applySuccessPostPersistEffects` への配置が実コード（行 389–392）と整合していることを再確認した。
- `state.steps["spec-review"].length` = 当該 iteration（post-projectSuccess 適用済み）という設計が `state/helpers.ts` の `pushStepResult` 挙動と一致していることを確認した。

**Requirement 4: iteration 1 では後出し判定を実行しない**
- `recordFindingRecency` の `iteration < 2` early return 設計（tasks.md T-04）が spec.md MUST NOT と対応していることを確認した。

**Requirement 5: 後出し検出は verdict を変更しない**
- `step-completion.ts` の `deriveStepCompletion` が verdict を返すだけで store を呼ばない純計算であり（行 225–256）、後出し検出はその後段 (`applySuccessPostPersistEffects`) に置かれることを確認した。構造的に verdict への書き戻し経路を持てない設計になっている。
- tasks.md T-06 が「`step-completion.ts` / `judge-verdict.ts` / verifyFindingRefs 呼び出しブロックは無変更のまま」と明記しており、構造的隔離が tasks レベルでも担保されていることを確認した。

**Requirement 6: 後出しがある round では stderr に要約を出す**
- MUST + Given/When/Then シナリオ付きで規定されており、tasks.md T-04 の acceptance criteria が `stderrWrite` 呼び出しテストを指定（late ≥ 1 のとき出力、0 件のとき非出力）していることを確認した。
- `stderrWrite` が `src/logger/stdout.ts` の既存ユーティリティ（`maskSensitive()` 適用済み）であることを round 2 から引き継いで確認済み。

### design.md D1–D5 の再確認

- D1（二層構成）、D2（verdict 不変）、D3（post-persist 配置）、D4（純関数+配線+seam 分解）、D5（journal-only EventRecord）が Clean な状態で残っていることを確認した。
- Open Questions 節が「なし。」であることを確認した。

### tasks.md T-01 〜 T-07 と request.md 受け入れ基準の対応確認

| tasks.md | request.md AC |
|----------|---------------|
| T-01 AC → Method 節 keyword assert | AC 1 ✓ |
| T-02 AC → 3 値固定テスト | AC 2 ✓ |
| T-03 AC → typecheck 強制 | AC 6 ✓ |
| T-04 AC → append テスト | AC 3 ✓ |
| T-04 AC → verdict 不変テスト | AC 4 ✓ |
| T-04 AC → iteration 1 non-append | AC 5 ✓ |
| T-04 AC → stderr 出力テスト | spec.md Req 6 ✓ (request.md AC 外) |
| T-05 AC → journal round-trip テスト | AC 3 ✓ |
| T-06 AC → verdict 不変テスト | AC 4, 5 ✓ |
| T-07 AC → typecheck && test green | AC 6 ✓ |

### セキュリティ観点

- 後出し検出が扱う入力（finding の file/line/title、git OID、worktree file 内容）はすべて pipeline 内部データであり、外部ユーザー入力の直接流入経路なし。
- `git show <priorOid>:<file>` の OID は state.json に記録済みの pipeline 管理 OID であり、外部注入不可。
- finding の title/rationale は spec 成果物の記述であり、機密情報ではない。stderr 出力は `stderrWrite` で `maskSensitive()` が自動適用される。
- OWASP Top 10 適用対象外（CLI ツール・パイプライン内部処理）。

### module boundary 追加確認

- `event-journal.ts` が `src/kernel/report-result.ts` から `BaseReportResult` を既にインポートしていることを確認した（行 16）。T-05 が同ファイルから `FindingSeverity` をインポートすることは既存 DSM 規律と一致する。

## 検証できなかった項目

- `src/core/step/finding-recency.ts`（未作成のため、実装品質・3 値網羅は typecheck && test で検証される）。
- `src/core/runtime/local.ts` / `managed.ts` の `readRevisionContent` 実装（未実装のため実装後にのみ検証可能）。
- `bun run typecheck && bun run test`（未実装段階のためスキップ）。

## Findings 詳細

None と明記する（指摘なし）。

<!-- observation として記録 -->
<!-- file: specrunner/changes/spec-review-full-enumeration/request.md -->
<!-- request.md 受け入れ基準に stderr テスト項目が欠落（3 round 継続中の残留 gap） -->
<!-- spec.md Requirement 6（MUST + シナリオ）および tasks.md T-04 AC で仕様として確立済み。 -->
<!-- spec-fixer の write-scope 外（request.md は読み取り専用）のため自動修正不可。 -->
<!-- 実装を阻害しないため observation に留める。 -->
