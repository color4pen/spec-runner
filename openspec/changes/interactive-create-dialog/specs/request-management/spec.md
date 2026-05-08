## ADDED Requirements

### Requirement: draft ライフサイクル

CLI は MUST `specrunner/requests/draft/<slug>/` ディレクトリに対話中の draft を永続化する機能を提供する。draft は以下の 2 ファイルで構成される:

- `request.md` — 最新の draft 内容
- `draft-state.json` — メタデータ（`DraftState` 型に準拠）

`DraftState` は MUST 以下の構造を持つ:

```typescript
interface DraftState {
  sessionId: string;
  slug: string;
  type: string;
  description: string;
  createdAt: string;   // ISO8601
  updatedAt: string;   // ISO8601
}
```

#### Scenario: draft の保存

- **WHEN** `saveDraft(slug, content, state)` を呼び出す
- **THEN** `specrunner/requests/draft/<slug>/request.md` に `content` を書き出す
- **AND** `specrunner/requests/draft/<slug>/draft-state.json` に `state` を JSON として書き出す
- **AND** ディレクトリが存在しない場合は再帰的に作成する

#### Scenario: draft の読み込み

- **WHEN** `loadDraft(slug)` を呼び出し、対応する draft が存在する
- **THEN** `{ content: string; state: DraftState }` を返す

#### Scenario: 存在しない draft の読み込み

- **WHEN** `loadDraft(slug)` を呼び出し、対応する draft が存在しない
- **THEN** `null` を返す

#### Scenario: draft の削除

- **WHEN** `deleteDraft(slug)` を呼び出す
- **THEN** `specrunner/requests/draft/<slug>/` ディレクトリを再帰的に削除する
- **AND** ディレクトリが存在しない場合はエラーを throw せず正常終了する

### Requirement: finalize 時に draft を削除し active に移動する

対話モードの finalize phase で request.md の書き出しが成功した場合、CLI は MUST `deleteDraft(slug)` を呼び出して draft を削除する。request.md は `specrunner/requests/active/<slug>/request.md` に書き出される（既存の request 配置規約に従う）。

#### Scenario: finalize 成功時の draft 削除

- **GIVEN** `specrunner/requests/draft/my-feature/request.md` が存在する
- **WHEN** finalize phase が正常完了する
- **THEN** `specrunner/requests/active/my-feature/request.md` が作成される
- **AND** `specrunner/requests/draft/my-feature/` ディレクトリが削除される

### Requirement: `<!-- FINAL_DRAFT -->` 検出時に draft を更新する

LLM が `<!-- FINAL_DRAFT -->` マーカーを含む応答を返した場合、CLI は SHALL 検出されたコンテンツで `saveDraft()` を呼び出して draft を更新する。ユーザーが書き出しを拒否して対話を継続した場合も、最後に検出された draft は保存されている。

#### Scenario: マーカー検出時の draft 更新

- **WHEN** LLM の応答に `<!-- FINAL_DRAFT -->` マーカーが含まれる
- **THEN** マーカー以降のコンテンツで `saveDraft()` を呼び出す
- **AND** `draft-state.json` の `updatedAt` が更新される
