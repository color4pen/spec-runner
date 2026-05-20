# timeout 設定の不具合修正: 0 で無効化 + グローバルデフォルト

## Meta

- **type**: bug-fix
- **slug**: timeout-config-fixes
- **base-branch**: main

## 背景

PR #176 でポーリングにウォールクロックタイムアウトを追加したが、2 つの設定不備がある。

1. **timeout: 0 で無効化できない（#184）**: `agent-runner.ts` が `resolvedConfig.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS` で解決するため、`0` は falsy で `??` がデフォルト 15 分にフォールバックする
2. **グローバルデフォルトが設定できない（#185）**: step ごとの `timeoutMs` はあるが、全ステップ共通のデフォルト timeout を 1 箇所で変更する方法がない。全ステップの timeout を変えたい場合、個別に設定する必要がある

## 要件

1. `agent-runner.ts` の timeout 解決ロジックで `timeoutMs === 0` をタイムアウト無効（`null`）として扱う
   - 2 箇所（L176, L355）を修正
   - `completion.ts` の `pollUntilComplete` は `timeoutMs: null` で deadline 判定をスキップするため、そのまま動く
2. `config.json` の `steps` に `defaults` キーを追加できるようにする
   - `defaults` は全ステップのフォールバック値を定義する
   - ステップ固有の設定が `defaults` を上書きする
   - 例: `{ "steps": { "defaults": { "timeoutMs": 600000 }, "implementer": { "timeoutMs": 0 } } }`
3. `config/schema.ts` の `StepConfigMap` 型に `defaults` を追加する
   - `defaults` は通常の `StepExecutionConfig` と同じ型
4. `config/step-config.ts` の `getStepExecutionConfig` で `defaults` → step 固有の順で解決する
   - step 固有 > defaults > ハードコードデフォルト
5. `config/schema.ts` の validation で `defaults` キーを許可する（agent step name でないためバリデーションで弾かれないようにする）

## スコープ外

- `timeout: null` の明示的サポート（`null` は schema validation で既に許可されている）
- UI/CLI からの timeout 設定変更

## 受け入れ基準

- [ ] `timeoutMs: 0` を config に設定するとタイムアウトが無効化される
- [ ] `steps.defaults.timeoutMs` が全ステップのフォールバックとして機能する
- [ ] ステップ固有の設定が `defaults` を上書きする
- [ ] `defaults` が未設定の場合は既存動作（ハードコードデフォルト 15 分）が維持される
- [ ] validation が `defaults` キーを許可する
- [ ] ユニットテストで 0 → null 変換と defaults 解決を検証
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

- `0` はタイムアウト無効の意味。負の値はバリデーションで弾く（既存動作）
- `defaults` は `StepConfigMap` のリザーブドキー。step name と衝突しない（step name は kebab-case の具体名）
- 解決順序: step 固有 > defaults > DEFAULT_POLL_TIMEOUT_MS（ハードコード）
