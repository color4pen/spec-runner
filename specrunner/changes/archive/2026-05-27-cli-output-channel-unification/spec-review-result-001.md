# Spec Review Result

- **verdict**: needs-fix
- **reviewer**: spec-review agent
- **date**: 2026-05-27

---

## Summary

設計方針（logger 経由統一・stdout/stderr 分離・EventBus event 化）は正当で実装可能。セキュリティ面でも maskSensitive の全適用は净改善。ただし delta spec が baseline の相矛盾する要件を除去していないため、spec merge 後にコーパスが内部矛盾を持つ。

---

## Critical Findings

### F-1: `pipeline-orchestrator` delta spec が衝突する baseline 要件を除去していない

**問題**

baseline の `specrunner/specs/pipeline-orchestrator/spec.md` に以下の 2 要件が存在する：

- `"Pipeline Emits Iteration Progress to Stdout"` — pipeline が `[iter N/M]` 等を **stdout** に直接書くべき旨を明示する
- `"Pipeline Emits Step Progress for Non-Loop CliSteps"` — `[step] <name>` 等を **stdout** に出力するシナリオを持つ

delta spec (`specs/pipeline-orchestrator/spec.md`) は新要件 `"Pipeline は進捗メッセージを DomainEvent 経由で出力する"` を追加しているが、上記 2 要件を `## Removed` で削除していない。

ヘッダーが baseline と一致しないため tool は MODIFIED ではなく ADDED として扱う。spec merge 後、baseline には「stdout に直接書く」と「DomainEvent 経由で stderr に書く」が共存する矛盾状態になる。

**修正方法**

`specrunner/changes/cli-output-channel-unification/specs/pipeline-orchestrator/spec.md` に以下のセクションを追加する：

```
## Removed
- "Pipeline Emits Iteration Progress to Stdout"
- "Pipeline Emits Step Progress for Non-Loop CliSteps"
```

---

## Advisory Findings

### F-2: `cli-commands` baseline に logInfo → stderr 移行と矛盾するシナリオが残る

baseline `specrunner/specs/cli-commands/spec.md` の要件 `"specrunner job start の preflight は GitHub token 取得元を info ログに出力する"` に以下のシナリオがある：

```
#### Scenario: preflight 成功時に取得元が stdout に出る
- THEN stdout に `GitHub token source: credentials` の info ログが 1 行出力される
```

本 change で `logInfo` を stderr に移行するため、このシナリオは実装後に誤記になる。delta spec の `cli-commands/spec.md` ではこの矛盾に触れていない。

**修正方法**（推奨）

`specrunner/changes/cli-output-channel-unification/specs/cli-commands/spec.md` に、baseline ヘッダーと完全一致する要件を追加して MODIFIED として上書きするか、または `## Removed` + 新規追加で対応する。最小対応として、当該要件のヘッダーを使って "stdout に出る" → "stderr に出る" にシナリオを差し替えること。

### F-3: request.md 受け入れ基準と delta spec の例外記述が不一致

`request.md` 受け入れ基準：
> `src/` 配下のプロダクションコードに `process.stdout.write` / `process.stderr.write` の直接呼び出しが存在しない（**`logger/stdout.ts` 内の最終出力点を除く**）

`specs/cli-commands/spec.md`：
> `src/logger/stdout.ts` 内の最終出力点と **`src/cli/progress.ts` 内の ProgressDisplay を除く**

progress.ts を例外とすることは design.md D7 で説明されており技術的に正しいが、request.md 側には反映されていない。実装への影響はないが、受け入れ基準を参照する際の混乱を避けるため request.md も合わせて更新することを推奨する。（実装の正とするのは delta spec 側）

---

## Security Review

- **マスキング適用範囲拡大**: `stdoutWrite` に `maskSensitive` を適用し、全出力パスで `sk-ant-` / `gho_` / `ghp_` / `ghr_` パターンをカバーする変更は正当。現状のマスキング漏れはセキュリティリスクであり、本 change の修正は net positive。
- **新規入力経路なし**: 本 change は出力経路の再配線のみ。入力バリデーション・認証・認可のロジック変更はない。
- **OWASP Top 10 非該当**: CLI 内部ルーティング変更であり、injection / broken auth / sensitive data exposure 等の観点で新たなリスクを導入しない。
- **progress.ts の例外**: progress.ts が `process.stderr.write` を直接使う設計は、循環依存回避かつ payload にトークンが含まれないという前提のもと合理的。EventPayloadMap の payload 定義（step 名・iteration カウント・verdict 文字列）を確認しており、マスキング対象データを含まない。

---

## Required Fix

F-1 のみ必須修正。F-2 は推奨、F-3 は任意。

**最小修正**:

`specrunner/changes/cli-output-channel-unification/specs/pipeline-orchestrator/spec.md` に `## Removed` セクションを追加し、衝突する 2 つの baseline 要件を明示的に削除する。
