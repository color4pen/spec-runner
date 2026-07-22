# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 1. F-01 解消の確認（tasks.md + implementer = Case A 採択）

前回 spec-review-result-001 で escalation した F-01（tasks.md + implementer の扱い）について、operator が案 A（target-aware）を採択し request.md を修正済みとのことで、4 文書の整合を確認した。

| 文書 | tasks.md + implementer の記述 |
|---|---|
| request.md R1 | 「tasks.md は implementer のみが宣言 write に含む。fixTarget: implementer（conformance 経路）は needs-fix:implementer を維持し、それ以外の fixTarget では escalation」 ✓ Case A と一致 |
| design.md D2 | 「tasks.md は実効 fixer が tasks.md を書けない場合に限り escalation、fixTarget=implementer（conformance）では needs-fix:implementer を維持」 ✓ |
| spec.md | シナリオ「tasks.md への implementer finding は needs-fix:implementer のまま」「tasks.md への code-fixer finding は escalation」 ✓ |
| tasks.md T-07 | conformance + fixTarget: implementer → needs-fix:implementer（挙動保存）✓ |

4 文書は Case A で整合している。

### 2. コード前提の実測確認

| 項目 | 実測結果 |
|---|---|
| `FixTarget` 型定義 | `"implementer" \| "code-fixer" \| "spec-fixer"` のみ（`src/kernel/report-result.ts:22`）。`build-fixer` は含まれない |
| `protectedCanonPaths(slug)` | 6 パス: request.md / spec.md / design.md / tasks.md / test-cases.md / attestation（`write-scope.ts:64-74`） |
| `code-fixer.writes()` | gitState のみ（`code-fixer.ts:155-158`） |
| `build-fixer.writes()` | gitState のみ（`build-fixer.ts:70-74`） |
| `implementer.writes()` | tasks.md（`verify:false`）+ gitState（`implementer.ts:170-178`） |
| `spec-fixer.writes()` | spec.md / design.md（`spec-fixer.ts:99-105`） |
| `judge-verdict.ts` 3 関数 | severity / resolution / fixTarget のみ参照、`finding.file` を参照しない ✓ |
| `StepCompletion` | `escalationReason` フィールドなし（変更前の現状） |
| `FATAL_ERROR_CODES` | SESSION_CREATE_FAILED / CONFIG_MISSING / CONFIG_INCOMPLETE / CONFIG_INVALID の 4 件のみ。`CANON_FINDING_ESCALATION` は含まれない ✓ |
| `judgeVerdictFn` 型 | 3-arg（`step-types.ts:284-288`）。4th optional arg 追加で widen が必要 |
| escalation verdict の経路 | transition 行なし → `?? "escalate"` → `awaiting-resume`（`pipeline.ts:366,427-443`） |
| `collectFindingsLedger` | optional `canonScope` なし（変更前の現状、`findings-ledger.ts:28`） |
| `collectParallelFixerFindings` | optional `canonScope` なし（変更前の現状、`findings-ledger.ts:63`） |
| `regression-gate.skipWhen` / `buildMessage` | `collectFindingsLedger(reviewerChain, state)` を呼ぶ（`regression-gate.ts:112,140`）。canonScope を渡す変更が必要 |
| `code-fixer.buildMessage` | `collectParallelFixerFindings(state, needsFixMembers)` を呼ぶ（`code-fixer.ts:207`）。canonScope を渡す変更が必要 |

### 3. 設計 D1–D7 の整合性確認

- **D1（canon-escalation.ts）**: pure module として分離し、import は `Finding` / `FixTarget` 型のみ。`judgeEffectiveFixer = () => "code-fixer"`（judge/regression 経路の実際の routing と一致）、`conformanceEffectiveFixer = f => f.fixTarget ?? "implementer"`（`aggregateFixTarget` の default と一致、`types.ts:266-270` の routing とも一致）。設計根拠は妥当。
- **D2（target-aware 判定）**: `writableByFixer` を `writes()` から導出することで write-scope guard との drift を構造的に排除。FixTarget キーは `"implementer"` / `"code-fixer"` / `"spec-fixer"`（型と一致）。
- **D3（実効 fixer の経路別解決）**: judge/regression では `reviewer-chain.ts:188-192,470-495` が needs-fix → code-fixer のみへ routing していることを確認。conformance では `types.ts:266-270` の needs-fix:spec-fixer / implementer / code-fixer 分岐と一致。
- **D4（optional 4th 引数）**: 省略時に現行挙動と完全同一。`judgeVerdictFn` 型 widen により `verdictFn(findings, ok, evidence, canonScope)` の 4th 引数渡しが TypeScript 上有効になる。
- **D5（buildCanonWriteScope）**: import cycle の有無は実装前のため確認不可（詳細は「検証できなかった項目」）。明示 map fallback + drift-guard テスト（T-09）が contingency として適切に設計されている。
- **D6（escalation reason plumbing）**: `commitSuccess` で `state.error.message = escalationReason` → `pipeline.ts:435` で `resumePoint.reason = state.error?.message ?? ...` に流れる経路を確認。`CANON_FINDING_ESCALATION` は `FATAL_ERROR_CODES` に不在 → `awaiting-resume`（failed でない）。
- **D7（ledger 層 + verdict 層の二層）**: 「未解決の正典 finding は発生 round で escalation 済みで regression-gate に到達しない」「historical 解決済み正典 finding の再 escalation は解消不能ループを生む」という理由で ledger 層は除外のみに限定し、escalation 保証は verdict 層に一元化する設計は合理的。

### 4. pipeline routing 経路確認

- reviewer → code-fixer（needs-fix）: `reviewer-chain.ts:188-192` ✓
- reviewer → code-fixer（approved+fixable）: `reviewer-chain.ts:166-178` ✓（正典 fixable finding が escalation になれば verdict="escalation" でこの分岐は不発）
- coordinator → code-fixer（needs-fix）: `reviewer-chain.ts:433-438` ✓
- regression-gate → code-fixer（needs-fix）: `reviewer-chain.ts:491-495` ✓
- regression-gate → code-fixer（approved+fixable）: `reviewer-chain.ts:470-483` ✓（同上）
- conformance → spec-fixer / implementer / code-fixer: `types.ts:266-270` ✓
- escalation → awaiting-resume: `pipeline.ts:427-443` ✓

### 5. spec.md シナリオのカバレッジ確認

spec.md の全 4 シナリオグループを request.md 受け入れ基準と照合した。

| spec.md シナリオ | request.md 受け入れ基準との対応 |
|---|---|
| regression-gate の test-cases.md fixable → escalation | ✓（#890 実例の再現） |
| request.md fixable は fixTarget によらず escalation | ✓ |
| 非正典 file への fixable は routing 不変 | ✓ |
| spec.md + spec-fixer → needs-fix:spec-fixer | ✓（挙動保存） |
| tasks.md + implementer → needs-fix:implementer | ✓（Case A、request.md 更新済み） |
| tasks.md + code-fixer → escalation | ✓ |
| ledger 経路: code-fixer に正典 finding が届かず、round verdict が escalation | ✓ |
| reason に file / title / operator 適用の必要性 | ✓ |
| canon escalation は awaiting-resume に落ちる | ✓ |

### 6. 受け入れ基準と tasks の対応確認

request.md の受け入れ基準（10 項目）をすべて tasks.md T-07/T-08/T-09/T-10/T-11 が担うことを確認した。テスト実装の責任範囲も明確で、implementer が受け入れ基準を理解できる粒度で記述されている。

### 7. セキュリティ確認

- `selectUnroutableCanonFindings` / `buildCanonEscalationReason`: pure 関数、I/O なし、外部副作用なし。
- `buildCanonEscalationReason` が `f.file` / `f.title` を reason 文字列に埋め込む。消費先は CLI operator 向け表示のみ（web UI 非対象）。agent 生成文字列だが injection リスクは低。
- 新規エラーコード `CANON_FINDING_ESCALATION` は `FATAL_ERROR_CODES` に含まれない設計は正しい（awaiting-resume に落ち、failed にならない）。
- `canonPaths.has(f.file)` は Set lookup のみで injection なし。

## 検証できなかった項目

- **D5 import cycle の有無**: `canon-write-scope.ts` が fixer step ファイルを import する際の cycle は実装前のため静的に確認不可。design は明示 map + drift-guard テスト（T-09）を fallback として設けており、設計上のリスク対策は存在する。
- **`bun run typecheck && bun run test` の green**: 実装前のため実行不可。
- **`buildCanonEscalationReason` の出力フォーマット**: 実装前のため実測不可。spec は「file / title / operator 適用の必要性を含む」を要件とし、tasks T-01 が具体的な文言を担う。

## Findings 詳細

### F-01: tasks.md T-07 が `build-fixer` を conformance fixTarget として言及（低重要度）

**該当箇所**: `tasks.md` T-07 受け入れ基準の中段

```
- conformance + `fixTarget: code-fixer` / `spec-fixer` / `build-fixer` → escalation。
```

**問題**: `FixTarget` 型は `"implementer" | "code-fixer" | "spec-fixer"` のみ（`src/kernel/report-result.ts:22`）であり、`build-fixer` は有効な値でない。conformance finding の `fixTarget` フィールドに `"build-fixer"` を設定することはできず、TypeScript 型エラーになる。このテストケースを文字どおりに実装すると typecheck が失敗する。

同じ記述が `design.md` Open Questions 節（「tasks.md + code-fixer/spec-fixer/**build-fixer**/judge・regression 経路 default → escalation」）にも含まれているが、こちらは設計説明文であり実装への直接の影響は小さい。

**影響範囲**: tasks.md T-07 の受け入れ基準のみ。実装ロジック（D1–D5）に影響なし。

**推奨修正**: T-07 の当該行から `build-fixer` を除外する。`code-fixer` と `spec-fixer` の 2 ケースで「tasks.md を書けない conformance fixer」を網羅できる。

```diff
- - conformance + `fixTarget: code-fixer` / `spec-fixer` / `build-fixer` → escalation。
+ - conformance + `fixTarget: code-fixer` / `spec-fixer` → escalation。
```
