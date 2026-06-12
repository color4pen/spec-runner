# Regression Gate Result — iteration 001

- **verdict**: needs-fix
- **iteration**: 001

## Verification

### TC-018 — PRODUCER_REPORT_TOOL schema に observations 不在テストがない

- **File**: `tests/adapter/codex/strict-schema.test.ts` lines 139–155
- **Status**: **NOT FIXED (regression)**
- **Evidence**: `PRODUCER_REPORT_TOOL` describe block は `status` のみ検証。`expect(required).not.toContain("observations")` は存在しない。code-fixer commit (5cfdb551) はソースファイルを変更していない。

### TC-015 — parseObservations が line: null を ok:false で返す

- **File**: `src/core/port/report-result.ts` line 191
- **Status**: **NOT FIXED (regression)**
- **Evidence**: line 191 の条件 `o["line"] !== undefined` が null を弾く（null !== undefined は true）。`typeof null !== "number"` も true のため ok:false を返す。`tests/unit/core/port/report-result-observations.test.ts` に `line: null` のテストケースも存在しない。code-fixer commit はソースファイルを変更していない。

## Findings

| # | Severity | Resolution | File | Title | Rationale |
|---|----------|------------|------|-------|-----------|
| 1 | high | fixable | `tests/adapter/codex/strict-schema.test.ts` | TC-018: PRODUCER_REPORT_TOOL の observations 不在テストが未追加 | code-fixer がソースを変更せず、`expect(required).not.toContain("observations")` が依然として存在しない |
| 2 | high | fixable | `src/core/port/report-result.ts` | TC-015: parseObservations が line:null を ok:false で返す実装・テスト未修正 | line 191 の null チェック欠落が修正されず、observations test に line:null ケースも追加されていない |
