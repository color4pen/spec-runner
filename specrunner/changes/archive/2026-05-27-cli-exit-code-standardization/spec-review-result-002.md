# Spec Review Result

- **verdict**: approved
- **reviewer**: spec-review agent
- **date**: 2026-05-27

---

## 総評

spec-review-001 で指摘した HIGH / MEDIUM / LOW の全 4 件が解消されている。設計・タスク・delta spec の整合性が取れており、実装に進める状態。

---

## spec-review-001 指摘の解消確認

### [HIGH] ✅ Delta spec が baseline の preflight 要件を MODIFIED していない → 解消

`specs/cli-commands/spec.md` に `### Requirement: \`specrunner job start\` は起動前に fail-fast バリデーションを固定順序で実行する` が追加され、header が baseline と完全一致している。ステップ 1–4 は exit 1 → exit 2 に更新済み。ステップ 5（request.md not found）は exit 1 維持。シナリオも exit 2 に更新済み。

### [MEDIUM] ✅ Task 8 / Task 9 の slug-not-found exit code 矛盾 → 解消

Task 8 に「`runRunCore()` でファイルが見つからない場合は exit 1 のまま維持する（D5 参照）」という注記が追加され、Task 9 の「slug 解決失敗 → exit 1（現状維持）」と整合している。

### [LOW] ✅ `job finish --job <uuid>` UUID チェック → 解消

Task 9 に「`job finish --job <uuid>` の不正 UUID チェック → exit 2 に変更」が追記された。`job cancel` との整合が取れている。

### [LOW] ✅ subcommand worktree guard の `process.exit(1)` → 解消

Task 9 に「`bin/specrunner.ts` 62 行目の subcommand worktree guard `process.exit(1)` → `process.exit(EXIT_CODE.ARG_ERROR)` に変更」が追記された。WORKTREE_GUARD → exit 2 の EXIT_CODE_MAP と整合する。

---

## 新規 Findings

### [LOW] exit code 表の "存在しないファイル" 例示が request.md not found（exit 1）と表面的に矛盾する

**場所**: `specs/cli-commands/spec.md` Requirements 表

```
| 2 | 引数エラー | 不正な slug、存在しないファイル、フラグの矛盾、前提条件不足 |
```

「存在しないファイル → exit 2」と読めるが、同じ spec の preflight requirement ステップ 5 は「request.md not found → exit 1」を明示している。design D5 の根拠（引数フォーマットは正しく、存在しないリソースへの参照は runtime error）は一貫しており、「例」列のラベルも exhaustive ではなく例示であるため **実装上のブロッカーではない**。ただし「存在しない設定ファイル」など対象を絞った表現に将来的に改めると誤読を防げる。

---

## セキュリティ評価

- **入力バリデーション**: `VALID_JOB_ID_CHARS`（cancel）/ `SLUG_REGEX`（request 系）のバリデーションロジック自体は変更なし。exit code が変わるだけで検証強度に影響なし。
- **エラー情報の漏洩**: `SpecRunnerError.hint` の出力内容は変更なし。
- **`github-device.ts` の throw リファクタリング**: process.exit → throw への変更はテスタビリティ向上であり、caller の catch が適切に設計されている（Task 4）。情報漏洩リスクなし。
- **OWASP Top 10**: 新規リスクなし。

---

## 承認条件

修正不要。実装に進んでよい。
