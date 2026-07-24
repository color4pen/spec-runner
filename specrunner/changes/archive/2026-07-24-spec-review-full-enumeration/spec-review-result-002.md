# Spec Review Result

## 検証した項目

### spec.md の全 6 要件と前回 F-001 の解消確認

**F-001 (round 1):** tasks.md T-04 の acceptance criteria に stderr 要約テストが欠落していた。

- `tasks.md` T-04 を精読: acceptance criteria に `stderrWrite` 呼び出しテスト（late ≥ 1 のとき出力、0 件のとき非出力）が追加されていることを確認。F-001 の主目的（テスト実装指定の欠落）は解消済み。
- `spec.md` を精読: 新たに「Requirement: 後出しがある round では stderr に要約を出す」が MUST + Given/When/Then シナリオ付きで追加されていることを確認。spec.md の第 6 要件として適切に規定されている。
- `design.md` 末尾の HTML コメント `<!-- spec-fixer-deferred: [MEDIUM] ... -->` を確認: spec-fixer が request.md のみ write-scope 外であることを理由に、request.md への 7 番目 AC 追加を手動フォローアップ課題として残した旨が記録されている。

**Requirement 1: spec-review prompt の全量列挙規律**

- `src/prompts/spec-review-system.ts` の `SPEC_REVIEW_BASE` を確認。`## Method` 節（行 34–49）に全量列挙規律は存在しない（baseline 正確）。T-01 で追記が必要であることを確認。
- spec.md の「Requirement: spec-review prompt は finding の全量列挙を要求する」を確認。MUST 3 点（全量列挙・小出し禁止・後出し機械記録）と Given/When/Then シナリオが整合している。
- tasks.md T-01 受け入れ基準（Method 節抽出 → キーワード assert、全文 grep ではない）が、既存 `prompt-skeleton-drift-guard.test.ts` の `extractSection` helper を流用可能な形になっていることを確認。

**Requirement 2: 後出し判定純関数（3 値）**

- spec.md・design.md D4・tasks.md T-02 を横断で照合。
  - `targetLineContent === null` → indeterminate、`priorFileContent === null` → indeterminate、空白のみ → indeterminate、trim 一致 → late、不一致 → not-late の規則が 3 書類間で矛盾なし。
  - 行番号を使わず全行走査する設計（行番号ずれ耐性）が spec・design の両方に記述されている。

**Requirement 3: iteration 2 以上での journal 記録**

- design.md D3 の配置根拠を確認。`commit-orchestrator.ts` の `applySuccessPostPersistEffects` は `store.persist(s)` の後に走ることを実コードで確認（行 389–392）。verdict 確定・永続化後に後出し検出が走る構造的保証が成立している。
- `applySuccessPostPersistEffects` 呼び出し時点の `s` は `projectSuccess` 適用済みのため、`s.steps["spec-review"]` は当該 run を含む。iteration = 配列長、前 round = 末尾から 2 番目の `commitOid` という設計が state 構造と一致している（`src/state/helpers.ts` 行 106 の `commitOid?: string` を確認）。
- `StepAttemptRecord.commitOid?: string`（event-journal.ts 行 65）も optional であり、legacy record で null に倒れる経路（→ indeterminate）の設計整合を確認。

**Requirement 4: 後出し検出は verdict を変更しない**

- D2 の verdict 不変設計を `step-completion.ts` 行 225–256 と照合。`deriveStepCompletion` は verdict を返すだけで store を呼ばない純計算であり、`applySuccessPostPersistEffects` はその後段であることを確認。
- tasks.md T-06 で「`step-completion.ts` / `judge-verdict.ts` / verifyFindingRefs 呼び出しブロックは無変更のまま」と明示されており、構造的隔離が tasks レベルでも担保されている。

**Requirement 5: iteration 1 では後出し判定を実行しない**

- `recordFindingRecency` の `iteration < 2` early return 設計（tasks.md T-04、design.md D3）が spec.md MUST NOT 要件と対応していることを確認。

**Requirement 6: 後出しがある round では stderr に要約を出す**

- spec.md の Requirement 6「後出しがある round では stderr に要約を出す」（MUST + シナリオ）を確認。
- `stderrWrite` が `src/logger/stdout.ts` に実装済みの既存ユーティリティ（`process.stderr.write(maskSensitive(message) + "\n")`）であることを確認。セキュリティ観点では `maskSensitive()` が自動適用されるため、finding の title/rationale に万一センシティブ情報が含まれても stderr への漏出が抑制される構造になっている。
- tasks.md T-04 に `stderrWrite` 呼び出しテストの acceptance criteria が含まれていることを確認。

### design.md の設計決定 D1–D5 の検証

- D1（prompt 規律 + 後出し検出の二層）、D2（観測信号・verdict 不変）、D3（post-persist best-effort 配置）、D4（純関数 + 薄い配線 + runtime seam）、D5（journal-only EventRecord）を通読。
- D5 の `FoldResult.findingRecency?: FindingRecencyRecord[]` を optional にする根拠（既存 FoldResult リテラルを無改変で通す）を確認。fold() が常に populate するのは real fold() のみ、ENOENT branch リテラルは fold() を経由しないため、設計の言語的揺れ（「常に populate」vs. optional 型）は矛盾しない。
- managed runtime では prior = null → 常に indeterminate に倒れる設計（偽信号を出さない）が安全であることを確認。

### event-journal.ts の forward-compat 確認

- `fold()` が unknown type を silently ignore する設計（行 310–311）を確認。`finding-recency` 記録が追加されても旧 code は安全に読み飛ばす。T-05 実装前の journal を新 code が読んでも空の `findingRecency` 配列を返せばよい。

### tasks.md → request.md 受け入れ基準の対応確認

| tasks.md | request.md |
|----------|------------|
| T-01 AC → 受け入れ基準 1 | ✓ |
| T-02 AC → 受け入れ基準 2 | ✓ |
| T-03 AC → typecheck（受け入れ基準 6） | ✓ |
| T-04 AC → 受け入れ基準 3, 4, 5 | ✓ |
| T-04 AC → 受け入れ基準 7 | ❌ 存在しない |
| T-05 AC → 受け入れ基準 3 | ✓ |
| T-06 AC → 受け入れ基準 4, 5 | ✓ |
| T-07 AC → 受け入れ基準 6 | ✓ |

### セキュリティ観点

- 後出し検出が扱う入力（finding の file/line/title、git OID、worktree file 内容）はすべて pipeline 内部データ。外部ユーザー入力の直接流入経路なし。
- `git show <priorOid>:<file>` の OID は state.json に記録済みの pipeline 管理 OID であり、外部注入不可。
- journal に記録される finding の title/rationale は spec 成果物の記述であり、機密情報ではない。stderr 出力は `stderrWrite` で maskSensitive() が自動適用される。
- OWASP Top 10 適用対象外（CLI ツール・パイプライン内部処理）。

## 検証できなかった項目

- `src/core/step/finding-recency.ts`（未作成のため、純関数の実装品質・3 値網羅は typecheck && test で検証される）。
- `src/core/runtime/local.ts` / `managed.ts` の `readRevisionContent` 実装（未実装のため、実装後にのみ検証可能）。
- `bun run typecheck && bun run test`（未実装段階のためスキップ）。

## Findings 詳細

### F-001: tasks.md T-04 が「受け入れ基準 7」を参照するが request.md に 7 番目の AC が存在しない

**対象**: `specrunner/changes/spec-review-full-enumeration/tasks.md`

**詳細**: tasks.md T-04 の acceptance criteria 2 箇所が「(受け入れ基準 7)」を参照しているが、request.md には 6 つの受け入れ基準しかない。これは断ち切れたクロスリファレンスである。

design.md 末尾の `<!-- spec-fixer-deferred: [MEDIUM] ... -->` コメントが、spec-fixer の write-scope に request.md が含まれなかったため手動追加が必要と明記しているが、未解消のまま残っている。

なお、機能的な要件自体は spec.md の Requirement 6「後出しがある round では stderr に要約を出す」（MUST + シナリオ）として適切に規定されており、tasks.md T-04 の acceptance criteria 本文もテスト仕様として十分な記述がある。実装者は spec.md から要件を読み取り実装できるため実装を阻害しない。

**修正**: request.md の受け入れ基準リストに 7 番目の項目を追加する。設計.md が示す文言の例：「late が 1 件以上のとき recordFindingRecency が stderr に後出し件数内訳を含む要約 1 行を出力し、late が 0 件のときは stderr 出力を行わないことをテストで固定する」

### F-002: design.md にプロセス追跡用 HTML コメントが残存している

**対象**: `specrunner/changes/spec-review-full-enumeration/design.md`（末尾）

**詳細**: design.md 末尾（行 185）に `<!-- spec-fixer-deferred: [MEDIUM] ... -->` という HTML コメントが残っている。これは spec-fixer の処理過程でのトラッキングコメントであり、設計内容ではない。設計書として確定するにあたり、プロセス追跡のアーティファクトが混在することは仕様書の読みやすさを損なう。マークダウンレンダラーでは不可視だが raw text としては残る。

**修正**: design.md から該当コメント行を削除する（上述の F-001 修正で request.md が更新されれば、コメントに書かれた課題も解消される）。
