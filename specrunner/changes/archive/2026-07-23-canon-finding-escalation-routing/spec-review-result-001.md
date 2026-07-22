# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 1. request.md 要件 R1–R4 と design.md D1–D7 の整合性確認

- **R1（判定層 file-aware escalation）**: D1 の `canon-escalation.ts` 新設・D2 の target-aware 判定・D3 の実効 fixer 解決が R1 を忠実に実装している。`selectUnroutableCanonFindings` の 3 条件（fixable ∧ canonPaths 所属 ∧ 実効 fixer が書けない）は要件定義と一致する。
- **R2（3 verdict 関数への適用）**: D4 が optional 4th 引数 `canonScope?` として 3 関数に適用。省略時の後方互換は existing test への無影響を保証する。step-completion での配線は D4・D5・D6 で詳述されている。
- **R3（ledger 経路の整合）**: D7 が `collectFindingsLedger` / `collectParallelFixerFindings` の除外を規定。「未解決の正典 finding は発生 round で escalation 済みで regression-gate に到達しない」「historical 正典 finding の ledger 再 escalation は解消不能ループになる」という理由で ledger 層は除外のみ・verdict 保証は verdict 層に一元化する設計は合理的。
- **R4（挙動保存）**: D2 が spec-fixer → spec.md/design.md と implementer → tasks.md の合法ルートを保存する。non-canon file の routing は変更なし。

### 2. 現状コードの前提確認（実測）

| 確認項目 | 結果 |
|---|---|
| `judge-verdict.ts` の 3 関数が `finding.file` を参照しない | ✓ 確認（3 関数とも severity / resolution / fixTarget のみで分岐） |
| `protectedCanonPaths(slug)` が 6 パスを返す | ✓ 確認（request.md / spec.md / design.md / tasks.md / test-cases.md / attestation） |
| `code-fixer.writes()` が gitState のみ宣言 | ✓ 確認（`code-fixer.ts:155`） |
| `build-fixer.writes()` が gitState のみ宣言 | ✓ 確認（`build-fixer.ts:70`） |
| `implementer.writes()` が tasks.md を含む（verify:false） | ✓ 確認（`implementer.ts:176`） |
| `spec-fixer.writes()` が spec.md / design.md を宣言 | ✓ 確認（`spec-fixer.ts:99-105`） |
| `StepCompletion` に `escalationReason` フィールドなし | ✓ 確認（変更前の現状） |
| `collectFindingsLedger` / `collectParallelFixerFindings` に `canonScope` 引数なし | ✓ 確認（変更前の現状） |
| `FATAL_ERROR_CODES` に `CANON_FINDING_ESCALATION` なし | ✓ 確認（`SESSION_CREATE_FAILED` / `CONFIG_*` の 4 件のみ） |
| `judgeVerdictFn` 型が 3-arg（4th arg 追加が必要） | ✓ 確認（`step-types.ts:284-288`） |
| escalation verdict が transition なし → `?? "escalate"` → `awaiting-resume` | ✓ 確認（`pipeline.ts:366,427-443`） |

### 3. spec.md シナリオと受け入れ基準のカバレッジ確認

- spec.md は request.md の受け入れ基準をほぼ網羅している。
- 例外: request.md 受け入れ基準「tasks.md への fixable finding が fixTarget によらず escalation になることをテストで固定する」と spec.md シナリオ「tasks.md への implementer finding は needs-fix:implementer のまま」が矛盾する。design.md がこれを "Open Questions" として明示し operator 確認を求めている（後述の Finding 参照）。

### 4. pipeline routing 経路の確認

- reviewer → code-fixer (needs-fix) : `reviewer-chain.ts:188-192` ✓
- reviewer → code-fixer (approved+fixable) : `reviewer-chain.ts:166-178` ✓
- coordinator → code-fixer (needs-fix) : `reviewer-chain.ts:433-438` ✓
- regression-gate → code-fixer (needs-fix) : `reviewer-chain.ts:491-495` ✓
- regression-gate → code-fixer (approved+fixable) : `reviewer-chain.ts:470-483` ✓
- conformance → spec-fixer / implementer / code-fixer : `types.ts:266-270` ✓
- escalation → awaiting-resume : `pipeline.ts:427-443`、`ROUND_ALL_MEMBERS_SKIPPED` 除く全経路 ✓

### 5. 既存テストで固定された不変の確認

- `write-scope-rules-consistency.test.ts` TC-002:「implementer が tasks.md を宣言 write している場合、禁止領域に tasks.md が含まれない」が固定されており、implementer の tasks.md 合法書込を実証。D2 の設計根拠となっている。

### 6. セキュリティ確認

- 新規 pure 関数（`selectUnroutableCanonFindings` / `buildCanonEscalationReason`）は I/O なし、外部入力は agent 生成の `Finding[]`。
- `buildCanonEscalationReason` が `f.file` / `f.title` を reason 文字列に埋め込む → CLI operator 向け display、web 非対象。リスク低。
- 新規エラーコード `CANON_FINDING_ESCALATION` は `FATAL_ERROR_CODES` 非追加で、awaiting-resume に落ちる。failed 遷移しない設計は正しい。
- 入力バリデーション: `canonPaths.has(f.file)` は Set lookup のみで injection なし。

## 検証できなかった項目

- **D5 import cycle の有無**: `canon-write-scope.ts` が fixer step ファイルを import する際の cycle は、実装前のため静的解析で確認できない。design が fallback 案（明示 map + drift-guard テスト）を備えているため設計上のリスク対策は存在する。
- **`bun run typecheck && bun run test` の green 確認**: 実装前のためテスト実行不可。
- **escalation reason の実際の表示形式**: `buildCanonEscalationReason` の実装前のため出力フォーマットを実測確認できない。spec は「file / title / operator 適用の必要性を含む」を要件とするが具体的フォーマットは tasks T-01 に委ねている。

## Findings 詳細

### F-01: tasks.md + implementer の escalation 挙動 — request.md 受け入れ基準との乖離（decision-needed）

**該当箇所**: `design.md` Open Questions 節（末尾）

**状況**: request.md 受け入れ基準は「tasks.md への fixable finding が fixTarget によらず escalation になることをテストで固定する」と明記する。しかし design.md と spec.md はこれと異なる挙動を採択している:

- design.md: 「tasks.md は実効 fixer が tasks.md を書けない場合に限り escalation、fixTarget=implementer（conformance）では needs-fix:implementer を維持」
- spec.md シナリオ: 「tasks.md への implementer finding は needs-fix:implementer のまま」「tasks.md への code-fixer finding は escalation」

設計根拠: `implementer.ts:176` が tasks.md を `verify:false` で宣言 write し、`write-scope-rules-consistency.test.ts TC-002` で「implementer + tasks.md は forbidden 集合に含まれない」が固定されている。この不変を尊重すると、tasks.md + implementer の escalation は over-escalation（合法な修正をブロック）となる。

設計は "architect 採用方針「fixable = 実効 fixer が合法に書ける」" に忠実であり技術的には正確。しかし request.md 受け入れ基準からの逸脱であるため、operator の明示的な承認が必要。design.md も "spec-review / operator の確認を仰ぐ" と明記している。

**選択肢**:
- **案 A（設計採用・target-aware）**: implementer は tasks.md を合法に書けるため tasks.md + implementer → needs-fix:implementer を維持。request.md 受け入れ基準の当該項を「tasks.md + code-fixer/spec-fixer/build-fixer/judge/regression-gate 経路 → escalation、tasks.md + implementer（conformance） → needs-fix:implementer」と修正して固定する。over-escalation なく既存の合法 routing を保存する最小変更。
- **案 B（request.md 準拠・always-escalate）**: tasks.md はどの fixTarget でも常に escalation とする。implementer の正当な tasks.md 修正も operator 経由になる。受け入れ基準は変更不要。conformance が tasks.md 修正を指示しても operator が適用する運用が必要になる。
