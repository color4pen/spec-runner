# Cross-Boundary-Invariants Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | File | Description | How to Fix
- Valid Severity values (uppercase): CRITICAL | HIGH | MEDIUM | LOW
- If no findings, write a table row with "None" or omit the table body.
-->

- **verdict**: approved

## Summary

変更は既存の不変条件を黙って破っていない。B-6（SDK query の env は `stripSecrets` seam 経由）を `query-one-shot.ts` に正しく適用し、CODEOWNERS ゲート下のアーキ歯・allowlist はいずれも無変更で green を保つ。`envOmissionViolations` 述語のカバレッジ未完全は LOW の観察事項だが、TC-OSQ-ENV-01 の `toEqual(stripSecrets(process.env))` が実挙動を完全に固定しており、既存不変条件への穴は生じていない。

## Reviewed Scope

- 変更ファイル（2）: `src/adapter/claude-code/query-one-shot.ts`（import 1 行 + options 1 property）、`tests/unit/adapter/claude-code/query-one-shot.test.ts`（述語 + TC-OSQ-ENV-01/02/03）
- 参照した不変条件: B-6（SDK query env は `stripSecrets` seam 経由）、B-12（spawn 封じ込め）
- 参照した既存境界: `core-invariants.test.ts` B-6 grep 歯、`arch-allowlist.ts`、TC-SB-05、TC-FW-07 凍結テスト、`agent-runner.ts:431-456`（`queryOptions` 構築・`repairOptions` 継承パス）

## Boundary-by-Boundary Analysis

### B-6: SDK query env は `stripSecrets` seam 経由

**新しい行**（`query-one-shot.ts:141`）:
```typescript
env: stripSecrets(process.env as Record<string, string | undefined>),
```

この行は `process.env` と `stripSecrets` を**同時に含む**。`core-invariants.test.ts:353-357` の B-6 grep 歯フィルタ（`!m.content.includes("stripSecrets")` → seam 除外）に自動的に安全判定され、新規 violation は生まれない。`arch-allowlist.ts` への新 entry は不要（git diff で未変更を確認）。

**`agent-runner.ts` との対称性**: 参照実装の `sdkEnv = stripSecrets(process.env as ...)` と同一のキャストと strip 関数を使用。インライン化（中間 `const sdkEnv` を持たない）により、`CLAUDE_CODE_OAUTH_TOKEN` 注入ブロックのコピーペースト誘発を構造的に防いでいる。

✅ B-6 準拠。既存歯への副作用なし。

### B-6 grep 歯が env-omission を検出できない既知の盲点

`envOmissionViolations` 述語（テストファイル内 module-local 関数）は合成入力で omission と secret 混入を red にすることを TC-OSQ-ENV-03 で固定している。real code での env の正しさは TC-OSQ-ENV-01 の `toEqual(stripSecrets(process.env))` が担保する。design D3 が述べる「実テストと検出テストが同一述語を共有」は実装通りに達成されている。

✅ env-omission 検出の構造は要件通り。

### CODEOWNERS ゲート下ファイルの無変更確認

```
git diff main...HEAD -- tests/unit/architecture/core-invariants.test.ts
git diff main...HEAD -- tests/unit/architecture/arch-allowlist.ts
```

両コマンドとも出力なし（無変更を確認）。B-6 grep 歯の検査ロジック・allowlist entry は一切変更されていない。

✅ CODEOWNERS ゲート制約を満たす。

### 既存凍結テスト（TC-SB-05・TC-FW-07）への影響

両テストは `capturedOptions` に `sandbox` / `canUseTool` **キーが存在しないこと**を `hasOwnProperty` で検査する。`env` キーが options に追加されても、これらの検査は影響を受けない（特定キーの有無のみを見るため）。`agent-runner.ts` との混同も無い（one-shot は `bypassPermissions`、sandbox なし、canUseTool なし — 変更なし）。

✅ 既存凍結テストに退行なし。

### `agent-runner.ts` repair / retry パスへの波及なし

`repairOptions` / `retryOptions` / `followUpOptions` はいずれも `...queryOptions` を展開するため、`queryOptions` に含まれる `env: sdkEnv` を継承する。この経路は本変更とは別ファイル（`agent-runner.ts`）であり、今回の変更は一切触れていない。git diff で未変更を確認。

✅ `agent-runner.ts` の query パス全体への影響なし。

### `arch-allowlist.ts` B-6 既存 entry（`resolveClaudeCodeOAuthTokenFn`）

`agent-runner.ts:399` の `process.env` 直読み（OAuth token 解決用）は既存の allowlist entry（tracking: `B6-claude-oauth-token-resolver-input`）で許容済み。本変更はこの entry を変更も削除もしていない。

✅ 既存 allowlist 整合性は保たれている。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | 検出述語のカバレッジ | `tests/unit/adapter/claude-code/query-one-shot.test.ts` | `envOmissionViolations` は `SECRET_DENYLIST`（5 固定キー）のみを検査し、`stripSecrets` のパターンマッチ除去（`*_TOKEN` / `*_API_KEY` / `*_SECRET`）をカバーしない。述語の意味が `stripSecrets` の完全な契約より狭い。ただし TC-OSQ-ENV-01 の `toEqual(stripSecrets(process.env))` が実挙動をフル比較しており、パターン除去キーの漏出も実挙動テストで検出される。既存不変条件への穴は生じていない。 | 必須ではない。将来強化するなら `envOmissionViolations` に `SECRET_PATTERNS` マッチも加えるか、predicate を「`stripSecrets` 結果と等しいか」の直接比較に置き換える。 |
| 2 | LOW | テスト堅牢性 | `tests/unit/adapter/claude-code/query-one-shot.test.ts` | TC-OSQ-ENV-02 の `PATH` 保持検査が `if (process.env["PATH"] !== undefined)` で条件付き。PATH 不在の CI 環境では非 secret 保持の assertion がスキップされる。spec-review でも同様に指摘済み（LOW）。 | 必須ではない。`SPECRUNNER_TEST_NONSECRET=1` 等の明示的な非 secret マーカーキーを設定して保持を assert する方式に切り替えるか、条件なしに検査する。 |
