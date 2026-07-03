# Test Cases: docs — Installation セクションに依存サイズの説明を追加

## Summary

- **Total**: 11 cases
- **Automated** (unit/integration): 3
- **Manual**: 8
- **Priority**: must: 7, should: 3, could: 1

---

### TC-001: Installation セクションにデフォルトインストールの合計サイズが記載されている

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** README.md の Installation セクションが変更されている
**WHEN** Installation セクションのテキストを読む
**THEN** デフォルトインストール時の node_modules の概算合計サイズ（実測値、MB 単位）が明記されている

---

### TC-002: SDK 別サイズ内訳がバージョン付きで記載されている

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria / design.md > D2

**GIVEN** README.md の Installation セクションが変更されている
**WHEN** サイズ情報の記述を確認する
**THEN** `@anthropic-ai/claude-agent-sdk` と `@openai/codex-sdk` それぞれの個別サイズ（MB 単位）と、計測時の SDK バージョン番号が記載されている

---

### TC-003: サイズ値が実測値であり推測値でない

**Category**: manual
**Priority**: should
**Source**: design.md > D2 / request.md 要件 1

**GIVEN** README.md のサイズ情報が更新されている
**WHEN** 記載されたサイズ値の根拠を確認する
**THEN** サイズ値はバージョン番号と紐付けられた実測値であり、「おそらく」「約」「数百 MB」のみの定性表現で断定する形にはなっていない

---

### TC-004: slim install 手順の直前にサイズ削減の動機が明示されている

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria / design.md > D3

**GIVEN** README.md の Installation セクションが変更されている
**WHEN** `--omit=optional` コードブロックの直前のテキストを読む
**THEN** 「N MB 削減できる」等、サイズ削減を動機とする説明文が slim install 手順の直前に存在する

---

### TC-005: 既存の --omit=optional コードブロックが維持されている

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** README.md が変更されている
**WHEN** Installation セクションの bash コードブロックを確認する
**THEN** 変更前に存在した `--omit=optional` を用いる slim install 手順のコードブロックが削除・変更されずそのまま残っている

---

### TC-006: サイズ情報の追記箇所が "install by default" の直後に位置している

**Category**: manual
**Priority**: should
**Source**: design.md > D1

**GIVEN** README.md の Installation セクションが変更されている
**WHEN** Provider SDK の説明文を読む
**THEN** サイズ情報（合計・SDK 別内訳）の記述は「install by default」に続く同一段落または直後に配置されており、独立した新しいセクション見出しは作られていない

---

### TC-007: T-01 の計測が `du -sh node_modules` を用いたクリーン環境で実施されている

**Category**: manual
**Priority**: could
**Source**: tasks.md > T-01

**GIVEN** T-01 の計測作業ログ（または記録）が残っている
**WHEN** 計測方法を確認する
**THEN** `npm install <sdk>` を一時ディレクトリで実行し `du -sh node_modules` で計測する手順が踏まれており、計測値の再現性が担保されている

---

### TC-008: README のみの変更であり package.json は変更されていない

**Category**: manual
**Priority**: should
**Source**: design.md > Non-Goals / request.md スコープ外

**GIVEN** ブランチの変更差分がある
**WHEN** 変更ファイル一覧を確認する
**THEN** `package.json`・`package-lock.json`・ソースコード（`src/` 等）への変更がなく、変更は `README.md` のみである

---

### TC-009: typecheck が成功する

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** README.md の変更が適用されている
**WHEN** `bun run typecheck` を実行する
**THEN** 終了コード 0 で完了する

---

### TC-010: lint が成功する

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria / request.md 受け入れ基準

**GIVEN** README.md の変更が適用されている
**WHEN** `bun run lint` を実行する
**THEN** 終了コード 0 で完了する

---

### TC-011: build が成功する

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria / request.md 受け入れ基準

**GIVEN** README.md の変更が適用されている
**WHEN** `bun run build` を実行する
**THEN** ビルドエラーなく終了コード 0 で完了する

---

## Result

```yaml
result: completed
total: 11
automated: 3
manual: 8
must: 7
should: 3
could: 1
blocked_reasons: []
```
