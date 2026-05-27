# Spec Review Result

- **verdict**: needs-fix
- **reviewer**: spec-review
- **date**: 2026-05-27

---

## Summary

設計方針・アーキテクチャは妥当。全体的に思慮深く書かれているが、delta spec のヘッダー不一致が baseline に矛盾を残す致命的な問題が 1 件ある。それ以外にセキュリティ・tasks 整合性の小さい問題が複数ある。

---

## Findings

### [CRITICAL] cli-commands delta spec のヘッダーが baseline と不一致

**場所**: `specs/cli-commands/spec.md`

delta spec の Requirement ヘッダー:
```
### Requirement: `job show` 出力フィールド
```

baseline (`specrunner/specs/cli-commands/spec.md`) の対応ヘッダー:
```
### Requirement: `specrunner job show <jobId|slug>` は job state の詳細を表示する
```

ヘッダーが一致しないため tool は ADDED として扱い、baseline に「6 フィールドを出力する」と「Log: フィールドを含む」という矛盾する 2 要件が共存する。

**修正**: delta spec のヘッダーを baseline と完全一致させる。

```
### Requirement: `specrunner job show <jobId|slug>` は job state の詳細を表示する
```

また本文中で "6 フィールドを MUST 出力する" の定義を 7 フィールドに更新する記述を含めること。

---

### [SECURITY] ログファイルのパーミッション要件が欠落

**場所**: `specs/cli-log-persistence/spec.md`

config ファイルは `0600` 保存が明文化されているが (`cli-config-store` 要件)、pipeline ログ・agent session ログにはパーミッション要件が存在しない。agent session log は tool_result 経由でソースコードやシークレットを含む可能性がある。

**修正**: `cli-log-persistence/spec.md` に "ログファイルは `0600` 相当のパーミッションで作成しなければならない（MUST）" を Requirement として追加する。`mkdirSync` / `openSync` の呼び出し時の mode 指定をカバーするシナリオも 1 件追加する。

---

### [MODERATE] agent session log への `maskSensitive()` 適用が tasks に欠落

**場所**: `tasks.md` Phase 2 (2.3)

`specs/cli-log-persistence/spec.md` の "ログファイルにセンシティブ値を書き込まない" 要件は "pipeline ログおよび agent session log の書き込み時に maskSensitive() を適用しなければならない（MUST）" と定めている。しかし tasks.md の 2.3 には `SessionLogWriter` の書き込み時の masking 指示がない。

**修正**: task 2.3 または 2.4 に "書き込み前に `maskSensitive()` を適用する" を明示する。

---

### [MINOR] `<step>-<attempt>.jsonl` の attempt カウンター定義が未定義

**場所**: `specs/cli-log-persistence/spec.md` / `tasks.md` 2.2

attempt の開始値（1 始まりか 0 始まりか）と増分条件（retry ごと？step ごと？）が仕様に記載されていない。実装者が独自判断する余地を与える。

**修正**: spec に "attempt は 1 始まりで、同一 step の retry ごとにインクリメントする" の一文を追加する（または tasks.md 2.2 に明記する）。

---

### [MINOR] `verbose-execution-log` baseline の矛盾シナリオへの言及不足

**場所**: `specs/verbose-execution-log/spec.md` (delta)

baseline の同名 Requirement には "Scenario: フラグなし（default レベル）ではログファイルが生成されない — `.specrunner/logs/` にログファイルは生成されない" がある。delta spec の MODIFIED により このシナリオは置換される（正しい）が、実質的な挙動変更（default でファイルが作られるようになる）について delta spec の本文で一言説明があると保守性が上がる。

**推奨**: Requirement 本文に "default レベルでも pipeline ログが `<jobId>.log` に生成されるため、旧シナリオ『ファイルが生成されない』は置換される" を注記する。義務的修正ではないが可読性向上に貢献する。

---

### [INFO] `getVerboseLogPath` の命名が役割変化に追いついていない

**場所**: `tasks.md` 5.1

`getVerboseLogPath()` は verbose 専用から pipeline ログ（常時有効）のパス解決にも使われるようになるが、関数名は変更しない方針。spec 内での言及は問題ないが、将来の混乱リスクとして記録しておく。この変更の範囲では対処不要。

---

## 修正必須の項目

1. `specs/cli-commands/spec.md` の `job show` Requirement ヘッダーを baseline と完全一致させる（CRITICAL）
2. `specs/cli-log-persistence/spec.md` にログファイルのパーミッション要件を追加する（SECURITY）
3. `tasks.md` 2.3 or 2.4 に agent session log の `maskSensitive()` 適用を明示する（MODERATE）
4. `specs/cli-log-persistence/spec.md` の attempt カウンター定義を追加する（MINOR）
