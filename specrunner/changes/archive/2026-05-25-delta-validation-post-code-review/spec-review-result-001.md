# Spec Review Result

- **verdict**: needs-fix
- **reviewer**: spec-review agent
- **date**: 2026-05-25

---

## Summary

request / design / tasks の整合性は概ね良好。delta spec の format も通っている。ただし `specs/delta-spec-rule/spec.md` に **baseline と矛盾する Requirement が生じる構造的な問題** が 1 件あり、修正が必要。

---

## Findings

### [BLOCKER] createDeltaSpecRegistry() 要件ヘッダーの不一致によるベースライン矛盾

**場所**: `specrunner/changes/delta-validation-post-code-review/specs/delta-spec-rule/spec.md`

**問題**:

delta spec に追加された要件ヘッダー:
```
### Requirement: createDeltaSpecRegistry() SHALL register 10 rules
```

ベースライン `specrunner/specs/delta-spec-rule/spec.md` の既存ヘッダー:
```
### Requirement: createDeltaSpecRegistry() の戻り型を DeltaSpecRuleRegistry<DeltaSpecRuleName> に変更
```

ヘッダーが異なるため、delta が `ADDED` として扱われる。`finish` 時に spec-merge を実行すると、ベースラインに両要件が共存する状態になる:

- `createDeltaSpecRegistry() の戻り型を DeltaSpecRuleRegistry<DeltaSpecRuleName> に変更` → 登録 rule 数は **9**
- `createDeltaSpecRegistry() SHALL register 10 rules` → 登録 rule 数は **10**

2 要件が矛盾した状態でベースラインに残る。これは spec integrity violation。

**修正方法 (いずれか)**:

**A案 (推奨)**: delta spec 内のヘッダーをベースラインと完全一致させて MODIFIED 扱いにする
```markdown
### Requirement: createDeltaSpecRegistry() の戻り型を DeltaSpecRuleRegistry<DeltaSpecRuleName> に変更

`src/core/spec/rules/index.ts` の `createDeltaSpecRegistry()` SHALL `DeltaSpecRuleRegistry<DeltaSpecRuleName>` を返し、10 rule を登録する:

`noLegacyFlatFile`, `noLegacyFlatDir`, `canonicalSpecStructure`, `removedSectionFormat`, `renamedSectionFormat`, `requirementHeaderRequired`, `scenarioRequiredPerRequirement`, `normativeKeywordRequired`, `baselineHeaderMatch`, `noAuthoritySpecDirectEdit`

`no-specs-for-required-type` は D9 設計で early-return 用途のため registry には登録しない。

#### Scenario: registry contains 10 rules
...
```

**B案**: `## Renamed` セクションで旧ヘッダーを新ヘッダーに改名し、本文を更新
```markdown
## Renamed
- "createDeltaSpecRegistry() の戻り型を DeltaSpecRuleRegistry<DeltaSpecRuleName> に変更" → "createDeltaSpecRegistry() SHALL register 10 rules"
```

---

## Non-blocking Observations

以下は今回の verdict には影響しないが、実装時に注意を要する点として記録する。

### [NOTE] D4 shared loop budget の記述が微妙

`design.md` D4 の「budget は通算 — 1 回目 phase で iteration を消費しても 2 回目で fixer loop は継続可能」は、1 回目 phase で delta-spec-fixer が `maxIterations` 回使い切った場合、2 回目 phase では fixer loop が即 escalate する事実と矛盾する。記述が楽観的すぎる。ただし、design 後の delta-spec-fixer が maxIterations に達するケースは稀であり、実害は限定的と判断する。tasks.md や spec には影響なし。

### [NOTE] delta-spec-fixer prompt 要件の capability 配置

`specs/delta-spec-rule/spec.md` に `delta-spec-fixer prompt SHALL include baseline rollback instruction` を置いている。delta-spec-fixer は別 capability に相当するが、同一 fix loop の一部として `delta-spec-rule` 配下にまとめる判断は理解できる。ただし将来の可読性のために、別 capability (`delta-spec-fixer`) への分離も検討の余地がある。今回はスコープ内と扱う。

### [NOTE] git diff の baseBranch 引数

Task 7 で `git diff <baseBranch>..HEAD --name-only` を spawn 経由で実行する。`SpawnFn` が Bun.spawn の引数配列渡しであれば shell injection は発生しない。実装時は `["diff", `${baseBranch}..HEAD`, "--name-only"]` のように配列要素として渡すこと（template string を shell 文字列として渡さないこと）を確認すること。

---

## Checklist

| 項目 | 結果 |
|------|------|
| request と design の整合性 | ✅ 一致 |
| design と tasks の整合性 | ✅ 一致 |
| delta spec format (canonical-spec-structure) | ✅ pass |
| delta spec header が baseline と一致するか（MODIFIED 判定） | ❌ `createDeltaSpecRegistry()` 要件ヘッダー不一致 |
| 受け入れ基準の網羅性 | ✅ tasks でカバー |
| セキュリティ (入力バリデーション、injection) | ✅ 低リスク（SpawnFn 経由の引数渡し前提） |
| スコープ外の記述混入 | ✅ なし |
