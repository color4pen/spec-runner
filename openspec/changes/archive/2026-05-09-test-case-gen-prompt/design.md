# Design: test-case-gen prompt 強化

## D1: テストケースフォーマットの拡張

現在:
```markdown
### TC-001 [must] — <short title>

**GIVEN** <precondition>
**WHEN** <action>
**THEN** <expected outcome>
```

変更後:
```markdown
### TC-{NNN}: {Test Case Name}

**Category**: unit | integration | e2e | manual
**Priority**: must | should | could
**Source**: {design.md or tasks.md の該当セクション}

**GIVEN** {preconditions}
**WHEN** {operation}
**THEN** {expected result}
```

変更点:
- `[must]` インライン表記 → `**Priority**:` 独立行
- `**Category**:` 行を追加
- `**Source**:` 行を追加（導出元を traceable にする）

## D2: Category 判定テーブル

system prompt 内に以下の判定基準を埋め込む:

| Category | 対象 | 自動テスト |
|----------|------|-----------|
| unit | 純粋ロジック、バリデーション、ヘルパー関数 | ○ |
| integration | DB 操作、API エンドポイント、モジュール間連携 | ○ |
| e2e | 画面操作、フルユーザーフロー | ○ (環境依存) |
| manual | UI/UX 確認、ビジュアル検証、ビルド成果物検証 | × |

## D3: Summary セクション

test-cases.md の冒頭に必須出力:

```markdown
# Test Cases: {change name}

## Summary

- **Total**: {total} cases
- **Automated** (unit/integration/e2e): {count}
- **Manual**: {count}
- **Priority**: must: {count}, should: {count}, could: {count}
```

code-review の Scenario Coverage は Summary を参照してカウント検証を行う。

## D4: blocked_reasons

設計の曖昧さでテストケースを導出できない箇所を test-cases.md 末尾に報告:

```markdown
## Blocked Reasons

- design.md にエラーハンドリングの仕様がない
- tasks.md T-05 の「適切に処理する」が曖昧
```

該当なしの場合は `None` と記載。

## D5: must-areas による重点領域指定

`buildTestCaseGenInitialMessage` に `enabled: string[]` パラメータを追加。

`enabled` 配列に値がある場合、initial message に `<must-areas>` セクションを埋め込む:
```
<must-areas>
security, performance
</must-areas>
```

system prompt 側で解釈ルール:
- `<must-areas>` に含まれる領域に該当するテストケースは Priority を自動的に `must` に昇格
- `<must-areas>` が省略された場合はデフォルトの Priority 判定ルールを適用

### TestCaseGenMessageInput の変更

```typescript
export interface TestCaseGenMessageInput {
  slug: string;
  branch: string;
  requestContent: string;
  enabled: string[];  // 追加
}
```

### buildTestCaseGenInitialMessage の変更

`enabled` 配列が非空の場合のみ `<must-areas>` セクションを生成。

### test-case-gen.ts の変更

`buildMessage` で `deps.request.enabled` を渡す:

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

## D6: 構造化戻り値 (Result セクション)

test-cases.md 末尾に Result セクションを出力:

```markdown
## Result

```yaml
result: completed | partial | failed
total: {count}
automated: {count}
manual: {count}
must: {count}
should: {count}
could: {count}
blocked_reasons: []
```
```

判定基準:
- `completed`: 全てのテスト可能な振る舞いを test-cases.md に記載完了
- `partial`: 設計の曖昧さにより一部のテストケースが導出不能 (`blocked_reasons` に記録)
- `failed`: 必須設計成果物 (design.md, tasks.md) が存在しない

**注意**: step 側の `parseResult` は `NULL_PARSE_RESULT` のまま。
Result セクションは prompt レベルでの自己報告であり、パイプライン verdict には影響しない。

## D7: Testable Behaviors の抽出指示

system prompt に振る舞い抽出の観点を追加:

- **ドメインロジック**: バリデーション、状態遷移、計算、権限チェック
- **API コントラクト**: エンドポイントの入出力、エラーレスポンス、ステータスコード
- **データ整合性**: DB 操作、トランザクション、一意制約
- **エッジケース**: 境界値、null/空、重複、並行操作

現在の prompt は「acceptance criterion に対応する must」と「edge case の should」のみ。
上記の観点を明示することで、コード構造検証偏重から振る舞い検証へシフトさせる。

## 受け入れ基準

- [ ] system prompt に Category, Source, Summary, blocked_reasons, must-areas, Result の各セクションが含まれている
- [ ] `TestCaseGenMessageInput` に `enabled` が追加されている
- [ ] `buildTestCaseGenInitialMessage` が `enabled` 非空時に `<must-areas>` セクションを生成する
- [ ] `test-case-gen.ts` の `buildMessage` が `deps.request.enabled` を渡す
- [ ] テストが新しい prompt 内容と message 構造を検証する
- [ ] `bun run typecheck && bun run test` が green
