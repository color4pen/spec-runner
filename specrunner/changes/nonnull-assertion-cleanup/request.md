# managed-agent adapter の非 null アサーションを safe access に置き換える

## Meta

- **type**: bug-fix
- **slug**: nonnull-assertion-cleanup
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

`src/adapter/managed-agent/agent-runner.ts` に、optional / nullable なフィールドを `!` で握り潰している箇所が 3 つある。managed runtime で該当フィールドが未設定の場合に runtime crash する。

1. `config.environment!.id`（L606, L628）— `environment` は `EnvironmentConfig | undefined`（config schema で optional）。managed runtime で environment 未設定なら crash
2. `return sessionId!`（L648）— `sessionId` は let 宣言のみで初期化されない。resume / new session の両 try が失敗すると undefined のまま `!` で返り、呼び出し元が crash
3. `state.branch!`（L663）— `branch` は `string | null`（JobState schema）。null の場合に crash

## 要件

1. `config.environment!.id` → `environment` が undefined の場合は明確なエラーメッセージで throw する（preflight 的なガード）。
2. `return sessionId!` → `sessionId` が undefined の場合は明確なエラーメッセージで throw する。
3. `state.branch!` → null check を入れ、null の場合は明確なエラーメッセージで throw する。
4. 各修正に対応するテストケースを追加する（該当フィールドが未設定/null の場合にエラーメッセージを含む throw が起きることを検証）。

## スコープ外

- managed-agent adapter のエラー握りつぶし修正（`.catch(() => null)` 等は別件）。
- local runtime のコード変更。

## 受け入れ基準

- [ ] `environment` 未設定で managed runtime を使った場合、`!` crash ではなく明確なエラーで throw する
- [ ] `sessionId` が未初期化のまま返される経路が throw に置き換わる
- [ ] `branch` が null の場合に throw する
- [ ] 各修正に対応するテストケースが存在する
- [ ] `bun run typecheck && bun run test` が green
- [ ] `bun run lint` が green

## architect 評価済みの設計判断

- `!` を外して optional chaining + throw に置き換える。throw のメッセージには何が足りないかと対処法を含める（specrunner の escalation メッセージと同じ方針）。
- local runtime ではこれらの経路を通らないため、修正は managed adapter 内に閉じる。
