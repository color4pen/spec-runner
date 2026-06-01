# Test Cases: github-app-auth-align

## Summary

- **Total**: 20 cases
- **Automated** (unit/integration): 16
- **Manual**: 4
- **Priority**: must: 14, should: 5, could: 1

### TC-001: doctor — GitHub App token (ghu_) で GET /user 200 → pass

**Category**: unit  
**Priority**: must  
**Source**: T-06 AC / 受け入れ基準

**GIVEN** `github-token-valid` check が設定されており、`verifyTokenScopes()` が `{ status: 200, scopes: [] }` を返す  
**WHEN** doctor check を実行する  
**THEN** `github-token-valid` check が pass する（classic scope の有無を問わない）

---

### TC-002: doctor — GET /user 401 → fail

**Category**: unit  
**Priority**: must  
**Source**: T-06 AC

**GIVEN** `verifyTokenScopes()` が `{ status: 401, scopes: [] }` を返す  
**WHEN** doctor check を実行する  
**THEN** `github-token-valid` check が fail する

---

### TC-003: doctor — GET /user 200 + repo scope あり → pass（後方互換）

**Category**: unit  
**Priority**: should  
**Source**: T-07（TC-022 維持）

**GIVEN** `verifyTokenScopes()` が `{ status: 200, scopes: ["repo"] }` を返す  
**WHEN** doctor check を実行する  
**THEN** `github-token-valid` check が pass する（scope の有無を問わず status のみで判定）

---

### TC-004: doctor — GET /user 200 + scopes なし → pass（旧 FAIL の修正確認）

**Category**: unit  
**Priority**: must  
**Source**: T-07（TC-023 修正）

**GIVEN** `verifyTokenScopes()` が `{ status: 200, scopes: [] }` を返す  
**WHEN** doctor check を実行する  
**THEN** `github-token-valid` check が pass する（旧実装では fail していたケース）

---

### TC-005: doctor — GET /user タイムアウト → warn

**Category**: unit  
**Priority**: should  
**Source**: T-06 AC（3 分岐のみ）

**GIVEN** `verifyTokenScopes()` が timeout 例外をスローする  
**WHEN** doctor check を実行する  
**THEN** `github-token-valid` check が warn となる（pass でも fail でもない）

---

### TC-006: doctor — pass メッセージに `(repo ✓)` が含まれない

**Category**: unit  
**Priority**: should  
**Source**: T-06（pass message 変更）

**GIVEN** `verifyTokenScopes()` が `{ status: 200, scopes: [] }` を返す  
**WHEN** doctor check を実行して pass メッセージを確認する  
**THEN** メッセージが `GitHub token is valid` であり `(repo ✓)` を含まない

---

### TC-007: login — GitHub App token 取得後に scope 警告が出ない

**Category**: integration  
**Priority**: must  
**Source**: 受け入れ基準 / T-05 AC

**GIVEN** `runDeviceFlow()` が `{ accessToken: "ghu_xxx" }` を返す  
**WHEN** `specrunner login` を実行する  
**THEN** scope 警告（`repo scope が不足` 等）がコンソールに出力されない

---

### TC-008: login — accessToken が config に保存される

**Category**: integration  
**Priority**: must  
**Source**: T-01 delta spec 維持要件

**GIVEN** device flow が正常完了して `accessToken` を取得した  
**WHEN** `specrunner login` を実行する  
**THEN** `accessToken` が config に保存される

---

### TC-009: login.ts に scopes/scope/repo の参照がない

**Category**: manual  
**Priority**: must  
**Source**: T-05 AC

**GIVEN** `src/cli/login.ts` のソースコード  
**WHEN** `scopes`・`scope`・`repo` キーワードを検索する  
**THEN** 一致する参照が存在しない

---

### TC-010: runDeviceFlow が `{ accessToken: string }` のみ返す

**Category**: unit  
**Priority**: must  
**Source**: T-04 AC / D2

**GIVEN** `src/auth/github-device.ts` の `runDeviceFlow` 実装  
**WHEN** device flow の正常完了を mock して返り値を確認する  
**THEN** 返り値は `{ accessToken: string }` のみで `scopes` フィールドを含まない

---

### TC-011: GITHUB_SCOPE 定数が constants.ts に存在しない

**Category**: manual  
**Priority**: must  
**Source**: T-03 AC

**GIVEN** `src/auth/constants.ts` のソースコード  
**WHEN** `GITHUB_SCOPE` を検索する  
**THEN** 定義が存在しない

---

### TC-012: GITHUB_SCOPE が src/ 配下に参照なし

**Category**: manual  
**Priority**: must  
**Source**: T-08 AC

**GIVEN** `src/` 配下の全ファイル  
**WHEN** `GITHUB_SCOPE` を全文検索する  
**THEN** 一致する参照が存在しない

---

### TC-013: AccessTokenResponse に scope フィールドがない

**Category**: unit  
**Priority**: must  
**Source**: T-04 AC

**GIVEN** `src/auth/github-device.ts` の `AccessTokenResponse` interface  
**WHEN** 型定義のフィールドを確認する  
**THEN** `scope: string` フィールドが存在しない

---

### TC-014: github-token-valid.ts に scopes/repo の参照がない

**Category**: manual  
**Priority**: must  
**Source**: T-06 AC

**GIVEN** `src/core/doctor/checks/auth/github-token-valid.ts` のソースコード  
**WHEN** `scopes`・`repo` キーワードを検索する  
**THEN** 一致する参照が存在しない

---

### TC-015: delta spec — github-device-flow-auth が存在し scope 記述なし

**Category**: manual  
**Priority**: must  
**Source**: T-01 AC

**GIVEN** `specrunner/changes/github-app-auth-align/specs/github-device-flow-auth/spec.md`  
**WHEN** ファイルの存在とコンテンツを確認する  
**THEN** ファイルが存在し、device code request に `scope` パラメータの記述がなく、token が `ghu_` user access token として記述されている

---

### TC-016: delta spec — cli-commands が存在し scope 関連 scenario なし

**Category**: manual  
**Priority**: must  
**Source**: T-02 AC

**GIVEN** `specrunner/changes/github-app-auth-align/specs/cli-commands/spec.md`  
**WHEN** ファイルの存在とコンテンツを確認する  
**THEN** ファイルが存在し、「scope 不足」「scope fallback」「repo scope あり」等の scope 関連 scenario が含まれない

---

### TC-017: delta spec — cli-commands の doctor 説明が scope 依存でない

**Category**: manual  
**Priority**: must  
**Source**: T-02 AC

**GIVEN** `specrunner/changes/github-app-auth-align/specs/cli-commands/spec.md`  
**WHEN** `github-token-valid` の責務説明を確認する  
**THEN** 「scope 検証」ではなく「token 有効性検証」として記述されている

---

### TC-018: typecheck が green

**Category**: integration  
**Priority**: must  
**Source**: T-08 AC / 受け入れ基準

**GIVEN** 全変更（T-03〜T-07）が適用された状態  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーなく完了する

---

### TC-019: tests が green

**Category**: integration  
**Priority**: must  
**Source**: T-08 AC / 受け入れ基準

**GIVEN** 全変更（T-03〜T-07）が適用された状態  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass する

---

### TC-020: data.scope ?? GITHUB_SCOPE フォールバックが github-device.ts に存在しない

**Category**: unit  
**Priority**: should  
**Source**: T-04（`data.scope ?? GITHUB_SCOPE` 削除）

**GIVEN** `src/auth/github-device.ts` のソースコード  
**WHEN** `data.scope` または `GITHUB_SCOPE` を検索する  
**THEN** フォールバック式が存在しない

---

## Result

```yaml
result: completed
total: 20
automated: 16
manual: 4
must: 14
should: 5
could: 1
blocked_reasons: []
```
