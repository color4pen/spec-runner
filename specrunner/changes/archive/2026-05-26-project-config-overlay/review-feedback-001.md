# Code Review Feedback — project-config-overlay — iter 1

## Summary

全体的な実装品質は高い。build / typecheck / test green、31/31 must TCs pass。
core ロジック（deepMergeConfig / 6-level resolution / byRequestType validation / repoRoot 伝搬）はすべて設計通り。
下記 2 点が spec 逸脱として残る。

---

## Findings

### [LOW-1] `FileConfigStore.load()` が `repoRoot` を渡さない — 将来の呼び出し元でサイレント failure

**ファイル**: `src/config/store.ts` L170–173

```typescript
export class FileConfigStore {
  async load(): Promise<SpecRunnerConfig> {
    this.cachedConfig = await loadConfig();  // repoRoot を渡していない
    return this.cachedConfig;
  }
```

`FileConfigStore` は public API として export されているが、`load()` が `repoRoot` を渡さないため、将来この class を使うコードはプロジェクトローカル config overlay を無視する。現在は production コードからの呼び出しがなく実害はないが、export されている以上 API として誤ったシグネチャになっている。

**修正案**: `load(repoRoot?: string)` を追加し、`loadConfig(repoRoot)` に渡す。または class に `cwd` を持たせて constructor で受け取る。

---

### [LOW-2] TC-03 の挙動が design.md D1 / test-cases.md から逸脱している

**ファイル**: `tests/config/store.test.ts` L120–128、`src/config/store.ts` L115–117

`design.md D1` は「user global なし + project local のみ → partial config だと CONFIG_INVALID」と明示している。
`test-cases.md TC-03` も同じ制約をテストケースとして定義している。

しかし実装では `applyMigration()` が `version: 1` と `agents: {}` を自動付与するため、`{ steps: { defaults: { model: "claude-sonnet-4-6" } } }` のような部分的な project-only config がそのまま valid として通過する。テスト自体がこの挙動を意図的なものとして文書化している:

```typescript
// applyMigration always adds version: 1 and agents: {} — so even a partial config is valid
// as a standalone project local config after migration.
```

加えて `test-cases.md TC-03` は `provider` フィールドを「必須 field の例」として挙げているが、このフィールドは `SpecRunnerConfig` に存在しない。TC-03 はカバー済みとしてカウントされているが、実際には「部分 config + user global なし → CONFIG_INVALID」のパスは検証されていない（別のシナリオ：invalid model name で CONFIG_INVALID を確認している）。

**修正案**: 実装の挙動（migration 後に valid なら OK）を正として design.md と test-cases.md を更新し、意図を明記する。migration が standalone constraint を事実上緩和する設計判断として文書化する。

---

### [INFO] managed runtime で `byRequestType.model` が効果なし — ドキュメント未記載

`design.md D6` は「managed runtime では効果なしだが resolution 自体は通す」と記述しており実装も正しい。ただし `README.md` および `specrunner/project.md` の byRequestType 説明には managed runtime では `model` フィールドが無効という注記がない。設定は書けるがサイレントに無視されるため、ユーザーが混乱する可能性がある。

対応は必須ではないが、README の設定例付近に一言添えることを推奨する。

---

## Test Coverage vs test-cases.md

| カテゴリ | must TC | 実装状況 |
|---------|---------|---------|
| overlay-load | TC-01〜07 | ✅ store.test.ts で全カバー（TC-03 は挙動逸脱あり、LOW-2 参照） |
| deep-merge | TC-09〜14 | ✅ merge.test.ts で全カバー |
| byRequestType-resolution | TC-15〜20 | ✅ step-config.test.ts で全カバー |
| validation | TC-23〜29 | ✅ schema.test.ts で全カバー |
| cli-early-validation | TC-33, TC-35 | ✅ preflight.ts / bootstrap.ts で loadConfig(repoRoot) 呼び出し確認済 |
| regression | TC-36〜38 | ✅ 全 green |

---

## Verdict

- **verdict**: needs-fix

LOW-1（FileConfigStore.load の repoRoot 欠落）と LOW-2（TC-03 spec 逸脱の文書化）を修正してから merge すること。  
コア機能（overlay load / deep merge / 6-level resolution / validation）はすべて正常動作している。
