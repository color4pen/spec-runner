# Conformance Result: canon-finding-escalation-routing — Iteration 1

## 検証した項目

### Scope (git diff main...HEAD --stat)

35 files changed, 4818 insertions(+), 9 deletions(−)。

新規ソース: `canon-escalation.ts`（pure判定）、`canon-write-scope.ts`（wiring）。  
変更ソース: `judge-verdict.ts`（3 verdict 関数）、`step-completion.ts`（wiring + escalationReason）、`commit-orchestrator.ts`（state.error）、`findings-ledger.ts`（除外）、`regression-gate.ts` / `code-fixer.ts`（canonScope 渡し）、`step-types.ts`（型 widen）。  
新規テスト: 6 ファイル（judge-verdict-canon / canon-escalation / canon-write-scope / step-completion-canon / findings-ledger-canon / pipeline-fatal-codes）。

### J1: 受け入れ基準の網羅

| AC | 受け入れ基準 | テスト | 状態 |
|---|---|---|---|
| AC1 | test-cases.md fixable (code-fixer/欠落) → deriveRegressionGateVerdict escalation | TC-001, TC-020 | ✓ |
| AC2 | request.md fixable → fixTarget によらず escalation | TC-002 (4 fixTarget variants) | ✓ |
| AC3 | tasks.md: implementer→needs-fix:implementer、他→escalation | TC-005, TC-006, TC-021 | ✓ |
| AC4 | spec.md + spec-fixer → needs-fix:spec-fixer (挙動保存) | TC-004 | ✓ |
| AC5 | 非正典(src/**)への fixable routing が全 verdict 関数で不変 | TC-003 (3関数) | ✓ |
| AC6 | ledger: 正典 finding 除外 + verdict escalation をテストで固定 | TC-007(除外) / TC-001,TC-020(verdict) | △ 後述 |
| AC7 | escalation reason に file/title/operator 適用の必要性 | TC-008, TC-012 | ✓ |
| AC8 | 修正前挙動に戻すと fail する破壊確認 | TC-027, TC-028 | ✓ |
| AC9 | 既存テスト期待更新は意図変更のみ | T-10: 更新なし確認済み | ✓ |
| AC10 | typecheck && test が green | 616 files / 9012 tests | ✓ |

### J2: 設計判断への適合

- **D1（pure module）**: `canon-escalation.ts` は `kernel/report-result.js` 型のみ import。write-scope / slug / I/O 依存なし。✓
- **D2（target-aware）**: conformance は `f.fixTarget ?? "implementer"` で解決。spec.md+spec-fixer、tasks.md+implementer は needs-fix 維持。code-fixer が書けない正典は escalation。✓
- **D3（verdict 関数別の実効 fixer）**: judge/regression-gate は `judgeEffectiveFixer=()=>"code-fixer"` 固定、conformance は `conformanceEffectiveFixer`。✓
- **D4（optional 4th 引数）**: 3 verdict 関数に `canonScope?: CanonWriteScope` を追加。省略時現行挙動保証（TC-013/014/015）。✓
- **D5（明示 map + drift-guard）**: explicit map を採用（import cycle 回避）。TC-029 で各 fixer の `writes()` ∩ `protectedCanonPaths` との一致を drift-guard として固定。✓
- **D6（escalationReason causal attribution）**: ok=false / vacuous / decision-needed / finding-ref override では escalationReason 未設定。TC-023 で固定。✓
- **D7（ledger 除外、escalation は verdict 層に一元化）**: `collectFindingsLedger` に「除外時 gate を強制 escalation」する seam を追加していない（D7 明示判断）。✓
- **FATAL_ERROR_CODES 不追加**: `CANON_FINDING_ESCALATION` は FATAL_ERROR_CODES に含まれず（TC-024）。job は awaiting-resume に落ちる。✓

### J3: スコープ

- write-scope guard（commit 層）変更なし ✓
- transition table 変更なし（既存 `?? "escalate"` 経路を再利用）✓
- spec-fixer write-set 拡張なし ✓
- custom reviewer schema 変更なし ✓
- 既存テスト期待値変更なし ✓

### J4: Verification

- `bun run typecheck`: green（tsc --noEmit 終了コード 0）
- `bun run test`: 616 test files / 9012 passed / 1 skipped（スキップは変更前から存在）

## 検証できなかった項目

None。全ソース・テストを直接 Read tool で確認した。

## Findings 詳細

### F-01: attestation の fixable finding → escalation がテストで固定されていない

tasks.md T-07「test-cases.md / attestation も同様に fixTarget 非依存で escalation」の attestation 部分に対応するテストが存在しない。`request-review-attestation.json` は `protectedCanonPaths(slug)` 経由で `canonPaths` に正しく含まれており、メカニズムは機能する。しかし `judge-verdict-canon.test.ts` に attestation を対象とした assertion がない。機能的欠陥はなく low 重篤度。

### F-02: ledger 経路 AC6 の「verdict が escalation になること」が ledger テスト内で統合的に固定されていない

AC6「正典 finding を含む reviewer round の後、verdict が escalation になることをテストで固定する」の verdict 部分が、`findings-ledger-canon.test.ts` 内のシナリオでは確認されていない。TC-007 は除外のみをテストする。verdict escalation は `judge-verdict-canon.test.ts`（TC-001/TC-020）で独立して固定されており機能上の欠陥はないが、T-08 が要求する「同 state で・統合的に」の形式になっていない。low 重篤度。
