# Test Cases: release-please による自動バージョニング + publish 連携

## Summary

- **Total**: 22 cases
- **Automated** (unit/integration): 14
- **Manual**: 8
- **Priority**: must: 18, should: 3, could: 1

---

### TC-001: release-please workflow ファイルが存在する

**Category**: manual  
**Priority**: must  
**Source**: T-01, 受け入れ基準

**GIVEN** リポジトリに変更が適用されている  
**WHEN** `.github/workflows/release-please.yml` の存在を確認する  
**THEN** ファイルが存在すること

---

### TC-002: release-please workflow が valid YAML である

**Category**: manual  
**Priority**: must  
**Source**: T-01

**GIVEN** `.github/workflows/release-please.yml` が存在する  
**WHEN** YAML パーサーでファイルを読み込む  
**THEN** パースエラーが発生せず valid YAML として解析できること

---

### TC-003: release-please workflow のトリガーが main push である

**Category**: manual  
**Priority**: must  
**Source**: T-01, 要件 §1

**GIVEN** `.github/workflows/release-please.yml` が存在する  
**WHEN** `on:` セクションを確認する  
**THEN** `push.branches: [main]` が設定されていること

---

### TC-004: release-please-action@v4 が使用されている

**Category**: manual  
**Priority**: must  
**Source**: T-01, 要件 §1

**GIVEN** `.github/workflows/release-please.yml` が存在する  
**WHEN** `uses:` フィールドを確認する  
**THEN** `google-github-actions/release-please-action@v4` が指定されていること

---

### TC-005: release-type が node に設定されている

**Category**: manual  
**Priority**: must  
**Source**: T-01, 要件 §1

**GIVEN** `.github/workflows/release-please.yml` が存在する  
**WHEN** action の `with:` セクションを確認する  
**THEN** `release-type: node` が設定されていること

---

### TC-006: workflow の permissions が明示されている

**Category**: manual  
**Priority**: must  
**Source**: T-01, 要件 §1, D5

**GIVEN** `.github/workflows/release-please.yml` が存在する  
**WHEN** `permissions:` セクションを確認する  
**THEN** `contents: write` と `pull-requests: write` が両方明示されていること

---

### TC-007: GITHUB_TOKEN が使用されている

**Category**: manual  
**Priority**: should  
**Source**: T-01, D5

**GIVEN** `.github/workflows/release-please.yml` が存在する  
**WHEN** secrets 参照を確認する  
**THEN** `${{ secrets.GITHUB_TOKEN }}` が使用されているか、token が省略されてデフォルト注入されること（Personal Access Token が使われていないこと）

---

### TC-008: TypeConfigEntry に conventionalPrefix フィールドがある

**Category**: unit  
**Priority**: must  
**Source**: T-02

**GIVEN** `src/config/type-config.ts` が存在する  
**WHEN** `TypeConfigEntry` interface の定義を確認する  
**THEN** `conventionalPrefix: string` フィールドが存在すること

---

### TC-009: getConventionalPrefix("new-feature") が "feat" を返す

**Category**: unit  
**Priority**: must  
**Source**: T-02, 要件 §3

**GIVEN** `getConventionalPrefix` 関数が export されている  
**WHEN** `getConventionalPrefix("new-feature")` を呼び出す  
**THEN** `"feat"` を返すこと

---

### TC-010: getConventionalPrefix("bug-fix") が "fix" を返す

**Category**: unit  
**Priority**: must  
**Source**: T-02, 要件 §3

**GIVEN** `getConventionalPrefix` 関数が export されている  
**WHEN** `getConventionalPrefix("bug-fix")` を呼び出す  
**THEN** `"fix"` を返すこと

---

### TC-011: getConventionalPrefix("spec-change") が "feat" を返す

**Category**: unit  
**Priority**: must  
**Source**: T-02, 要件 §3

**GIVEN** `getConventionalPrefix` 関数が export されている  
**WHEN** `getConventionalPrefix("spec-change")` を呼び出す  
**THEN** `"feat"` を返すこと

---

### TC-012: getConventionalPrefix("refactoring") が "refactor" を返す

**Category**: unit  
**Priority**: must  
**Source**: T-02, 要件 §3

**GIVEN** `getConventionalPrefix` 関数が export されている  
**WHEN** `getConventionalPrefix("refactoring")` を呼び出す  
**THEN** `"refactor"` を返すこと

---

### TC-013: getConventionalPrefix("chore") が "chore" を返す

**Category**: unit  
**Priority**: must  
**Source**: T-02, 要件 §3

**GIVEN** `getConventionalPrefix` 関数が export されている  
**WHEN** `getConventionalPrefix("chore")` を呼び出す  
**THEN** `"chore"` を返すこと

---

### TC-014: getConventionalPrefix が未知の type を "feat" にフォールバックする

**Category**: unit  
**Priority**: must  
**Source**: T-02

**GIVEN** `getConventionalPrefix` 関数が export されている  
**WHEN** `getConventionalPrefix("unknown-type")` を呼び出す  
**THEN** `"feat"` を返すこと

---

### TC-015: renderPrTitle が conventional commits prefix を付与する

**Category**: unit  
**Priority**: must  
**Source**: T-03, 受け入れ基準

**GIVEN** `parsedRequest.title = "release-please の導入"`, `parsedRequest.type = "new-feature"` である  
**WHEN** `renderPrTitle(parsedRequest)` を呼び出す  
**THEN** `"feat: release-please の導入"` を返すこと

---

### TC-016: renderPrTitle が既存 prefix を二重付与しない

**Category**: unit  
**Priority**: must  
**Source**: T-03, 受け入れ基準

**GIVEN** `parsedRequest.title = "fix: already prefixed"`, `parsedRequest.type = "bug-fix"` である  
**WHEN** `renderPrTitle(parsedRequest)` を呼び出す  
**THEN** `"fix: already prefixed"` を返すこと（`"fix: fix: already prefixed"` にならない）

---

### TC-017: renderPrTitle がスコープ付き prefix を二重付与しない

**Category**: unit  
**Priority**: should  
**Source**: T-03

**GIVEN** `parsedRequest.title = "feat(cli): add command"`, `parsedRequest.type = "new-feature"` である  
**WHEN** `renderPrTitle(parsedRequest)` を呼び出す  
**THEN** `"feat(cli): add command"` を返すこと

---

### TC-018: renderPrTitle が bug-fix に fix prefix を付与する

**Category**: unit  
**Priority**: must  
**Source**: T-03

**GIVEN** `parsedRequest.title = "null pointer を修正"`, `parsedRequest.type = "bug-fix"` である  
**WHEN** `renderPrTitle(parsedRequest)` を呼び出す  
**THEN** `"fix: null pointer を修正"` を返すこと

---

### TC-019: package.json の version が 0.1.0 である

**Category**: manual  
**Priority**: must  
**Source**: T-04, 要件 §4, 受け入れ基準

**GIVEN** リポジトリルートの `package.json` を参照する  
**WHEN** `version` フィールドを確認する  
**THEN** `"0.1.0"` であること

---

### TC-020: typecheck が green

**Category**: integration  
**Priority**: must  
**Source**: T-01〜T-05, 受け入れ基準

**GIVEN** 全実装が完了している  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件で終了すること

---

### TC-021: test suite が green（regression なし）

**Category**: integration  
**Priority**: must  
**Source**: T-05, 受け入れ基準

**GIVEN** 全実装が完了している  
**WHEN** `bun run test` を実行する  
**THEN** 既存テストを含む全テストが pass すること

---

### TC-022: publish.yml が変更されていない

**Category**: manual  
**Priority**: should  
**Source**: 要件 §2, Non-Goals

**GIVEN** `.github/workflows/publish.yml` が存在する  
**WHEN** ファイルの内容を確認する  
**THEN** トリガーが `v*` tag push のままであること（release-please 導入前から変更なし）

---

### TC-023: renderPrTitle 呼び出し箇所がコンパイルエラーなし

**Category**: integration  
**Priority**: must  
**Source**: T-05

**GIVEN** `src/core/step/pr-create.ts` が `renderPrTitle` を呼び出している  
**WHEN** `bun run typecheck` を実行する  
**THEN** `pr-create.ts` に型エラーが発生しないこと

---

### TC-024: 0.x では breaking change が minor bump として扱われる（動作確認）

**Category**: manual  
**Priority**: could  
**Source**: design.md D4, 要件 §architect 評価

**GIVEN** release-please が導入された main ブランチに `feat!:` または `BREAKING CHANGE:` 付き commit が push される  
**WHEN** release-please Action が実行される  
**THEN** `0.x` の間は major ではなく minor bump の PR が生成されること（release-please のデフォルト動作）

---

## Result

```yaml
result: completed
total: 24
automated: 14
manual: 10
must: 18
should: 3
could: 1
blocked_reasons: []
```
