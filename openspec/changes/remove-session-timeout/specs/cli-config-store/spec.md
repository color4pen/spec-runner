## REMOVED Requirements

### Requirement: top-level timeout config はキー変換せず別軸として維持される

**Reason**: step session の wall-clock timeout 自体が撤廃される（design D1 / D3 参照）。executor の動作設定として保持していた `specReview: { pollIntervalMs, timeoutMs }` / `specFixer: { pollIntervalMs, timeoutMs }` ブロックのうち、`timeoutMs` に関する Requirement を削除する。`pollIntervalMs` は timeout とは別軸（polling 間隔）であり本 request の削除対象外として schema に残置する（当面 tagged optional として維持。定数化が必要な場合は別 request で対応する）。

**Migration**:

- 既存 config に `specReview.timeoutMs` / `specFixer.timeoutMs` / top-level `timeout` が含まれていても、`ConfigStore.load()` は SHALL silently ignore する（warn なし、エラーなし）
- `ConfigStore.save()` は SHALL これらのキーを書き出さない
- 詳細は本 delta の `## ADDED Requirements` セクション「廃止 timeout キーは silently ignore される」を参照

## ADDED Requirements

### Requirement: 廃止 timeout キーは silently ignore される

ConfigStore は MUST 旧 schema の `specReview.timeoutMs` / `specFixer.timeoutMs` / top-level `timeout` キーを読み取り時に warn / error なしで無視する。これらのキーは SHALL `ConfigStore.save()` で書き出されず、in-memory `SpecRunnerConfig` 型からも除外される。`pollIntervalMs` 等 timeout 以外の executor 設定の扱いは本 Requirement の対象外である。

#### Scenario: 旧 config の `specReview.timeoutMs` を含むファイルを読み込む

- **GIVEN** 既存 config ファイルが `{ "specReview": { "timeoutMs": 600000 }, "anthropic": { "apiKey": "sk-ant-..." }, ... }` を含む
- **WHEN** `ConfigStore.load()` を呼ぶ
- **THEN** load は成功し、warn / error は出力されない
- **AND** in-memory `config.specReview.timeoutMs` は存在しない（型に含まれない）

#### Scenario: 旧 config の top-level `timeout` を含むファイルを読み込む

- **GIVEN** 既存 config ファイルが `{ "timeout": "30m", ... }` を含む
- **WHEN** `ConfigStore.load()` を呼ぶ
- **THEN** load は成功し、warn / error は出力されない
- **AND** in-memory `config.timeout` は存在しない

#### Scenario: save 後のファイルから timeout キーが消える

- **GIVEN** load 直後の in-memory config（旧 timeout キーは無視済み）
- **WHEN** `ConfigStore.save(config)` を呼ぶ
- **THEN** 永続化されたファイルに `specReview.timeoutMs` / `specFixer.timeoutMs` / top-level `timeout` キーは含まれない
