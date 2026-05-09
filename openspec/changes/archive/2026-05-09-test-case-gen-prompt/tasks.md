# Tasks: test-case-gen prompt 強化

## T-1: system prompt の拡張

**File**: `src/prompts/test-case-gen-system.ts` — `TEST_CASE_GEN_SYSTEM_PROMPT`

現在の system prompt を以下の構造に書き換える:

### 1. テストケースフォーマット

現行の `### TC-001 [must] — <title>` 形式を以下に変更:

```markdown
### TC-{NNN}: {Test Case Name}

**Category**: unit | integration | e2e | manual
**Priority**: must | should | could
**Source**: {design.md or tasks.md の該当セクション}

**GIVEN** {preconditions}
**WHEN** {operation}
**THEN** {expected result}
```

### 2. Category 判定テーブルを追加

| Category | 対象 | 自動テスト |
|----------|------|-----------|
| unit | 純粋ロジック、バリデーション、ヘルパー関数 | ○ |
| integration | DB 操作、API エンドポイント、モジュール間連携 | ○ |
| e2e | 画面操作、フルユーザーフロー | ○ (環境依存) |
| manual | UI/UX 確認、ビジュアル検証、ビルド成果物検証 | × |

### 3. Summary セクション (必須出力)

test-cases.md 冒頭に配置:

```markdown
# Test Cases: {change name}

## Summary

- **Total**: {total} cases
- **Automated** (unit/integration/e2e): {count}
- **Manual**: {count}
- **Priority**: must: {count}, should: {count}, could: {count}
```

### 4. Testable Behaviors 抽出の観点を追加

以下の 4 観点を明示:
- ドメインロジック: バリデーション、状態遷移、計算、権限チェック
- API コントラクト: エンドポイントの入出力、エラーレスポンス、ステータスコード
- データ整合性: DB 操作、トランザクション、一意制約
- エッジケース: 境界値、null/空、重複、並行操作

### 5. blocked_reasons セクション

test-cases.md 末尾に追加:
```markdown
## Blocked Reasons

- {理由1}
- {理由2}
```
該当なしの場合は `None`。

### 6. Result セクション (構造化戻り値)

test-cases.md 末尾に追加:
```markdown
## Result

result: completed | partial | failed
total: {count}
automated: {count}
manual: {count}
must: {count}
should: {count}
could: {count}
blocked_reasons: []
```

判定基準:
- completed: 全テスト可能振る舞いを記載完了
- partial: blocked_reasons あり
- failed: design.md / tasks.md 不在

### 7. must-areas の解釈ルール

system prompt に追加:
- `<must-areas>` セクションが user message に含まれる場合、該当領域のテストケースは Priority を `must` に昇格
- `<must-areas>` が省略された場合はデフォルトの Priority 判定ルールを適用

**受け入れ基準**: system prompt 文字列に Category, Source, Summary, blocked_reasons, Result, must-areas の各セクション指示が含まれている

**Status**: [x] 完了

---

## T-2: TestCaseGenMessageInput の拡張と initial message builder の変更

**File**: `src/prompts/test-case-gen-system.ts` — `TestCaseGenMessageInput` / `buildTestCaseGenInitialMessage`

### 1. interface 変更

```typescript
export interface TestCaseGenMessageInput {
  slug: string;
  branch: string;
  requestContent: string;
  enabled: string[];  // 追加
}
```

### 2. buildTestCaseGenInitialMessage 変更

- `proposal.md` の読み取り指示を追加（現在は design.md と tasks.md のみ）
- `enabled` 配列が非空の場合、`<must-areas>` セクションを生成:
  ```
  <must-areas>
  security, performance
  </must-areas>
  ```
- `enabled` が空配列の場合は `<must-areas>` セクションを省略

**受け入れ基準**: `enabled: ["security"]` で呼び出した場合、出力に `<must-areas>` が含まれる。空配列の場合は含まれない。

**Status**: [x] 完了

---

## T-3: test-case-gen.ts の buildMessage 変更

**File**: `src/core/step/test-case-gen.ts` — `TestCaseGenStep.buildMessage`

`deps.request.enabled` を `buildTestCaseGenInitialMessage` に渡す:

```typescript
buildMessage(state: JobState, deps: StepDeps): string {
  if (!state.branch) throw branchNotSetError("test-case-gen");
  return buildTestCaseGenInitialMessage({
    slug: deps.slug,
    branch: state.branch,
    requestContent: deps.request.content,
    enabled: deps.request.enabled,
  });
},
```

**受け入れ基準**: `deps.request.enabled` が message builder に渡されている。型チェックが通る。

**Status**: [x] 完了

---

## T-4: テストの更新

**File**: `tests/test-case-gen-step.test.ts`

### 追加・変更するテスト

1. **system prompt 内容検証**: prompt に Category, Source, Summary, blocked_reasons, must-areas, Result の各キーワードが含まれることを検証
2. **buildMessage must-areas 検証**: `enabled: ["security"]` 時に `<must-areas>` が含まれることを検証
3. **buildMessage must-areas 省略検証**: `enabled: []` 時に `<must-areas>` が含まれないことを検証
4. **buildMessage proposal.md 検証**: message に `proposal.md` 読み取り指示が含まれることを検証
5. **既存テストの更新**: `makeMinimalDeps` に `enabled: []` を追加（`TestCaseGenMessageInput` の変更に対応）

**受け入れ基準**: `bun run test` が全件 green

**Status**: [x] 完了
