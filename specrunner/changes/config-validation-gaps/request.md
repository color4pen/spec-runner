# validateConfig で未検証のフィールドを検証する

## Meta

- **type**: bug-fix
- **slug**: config-validation-gaps
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

`src/config/schema.ts` の `validateConfig` は最終行で `return raw as SpecRunnerConfig` とキャストしており、明示的に検証したフィールドだけが安全。以下のフィールドは SpecRunnerConfig interface で型を持つが validateConfig で検証されておらず、壊れた値が素通りする。

- `agents`（`Partial<Record<AgentStepName, AgentRecord>>`）— AgentRecord の shape（agentId: string, definitionHash: string, lastSyncedAt: string）が未検証
- `environment`（`EnvironmentConfig`）— id: string, lastSyncedAt: string が未検証
- `specReview.pollIntervalMs`（number）— 負数・0・非整数・文字列が素通り
- `pipeline` セクション — オブジェクト型ガードが無い（`pipeline: "fast"` が素通りし、内部で `as Record` キャストが偶然動く）

加えて、config 外の JSON parse 箇所にも未検証がある:
- `credentials-io.ts:50` — `JSON.parse(raw) as CredentialsFile` でノーチェック
- `cancel/runner.ts:86`, `resume/safety.ts:51` — sidecar JSON の pid / jobId を型検証していない

## 要件

1. `validateConfig` に以下の検証を追加する:
   - `agents`: 各値が object であり agentId / definitionHash / lastSyncedAt が string であることを検証。不正値は CONFIG_INVALID で throw
   - `environment`: id / lastSyncedAt が string であることを検証
   - `specReview.pollIntervalMs`: 正の整数であることを検証（既存の timeoutMs と同じパターン）
   - `pipeline`: maxRetries チェックの前にオブジェクト型ガードを追加（非 object なら CONFIG_INVALID）
2. `credentials-io.ts:50` の `JSON.parse` 後に最低限の shape check（`github.token` が文字列であること）を追加する。
3. sidecar JSON parse の型チェックを追加する。`cancel/runner.ts:86` は jobId（string）の typeof 検証を追加する（worktreePath は既に検証済み、pid は不使用）。`resume/safety.ts:51` は pid の typeof チェックが既存なので追加不要か確認し、不足があれば補う。
4. 各検証に対応するユニットテストを追加する。

## スコープ外

- `validateConfig` の全体リファクタリング（final cast の構造的解消は別件）。
- 新フィールドの追加。

## 受け入れ基準

- [ ] 上記フィールドに不正値を入れた config が CONFIG_INVALID で reject される
- [ ] credentials / sidecar の JSON parse に shape check が入り、不正値で throw する
- [ ] 各検証に対応するテストケースが存在する
- [ ] 既存の valid な config が引き続き通る（後方互換）
- [ ] `bun run typecheck && bun run test` が green
- [ ] `bun run lint` が green

## architect 評価済みの設計判断

- 既存の validateConfig のパターン（手書き validator + CONFIG_INVALID throw）に合わせる。zod 等の導入はしない。
- sidecar / credentials の検証は、対象ファイルが壊れていた場合に早期に明確なエラーを出すことが目的。過度な schema 検証は不要で、キーフィールドの存在と型だけ見る。
