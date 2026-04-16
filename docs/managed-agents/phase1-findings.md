# Managed Agents Phase 1 検証結果

SpecRunner Phase 1 PoC で Managed Agents を実際に動かして分かったこと。事前知識の答え合わせと、Phase 2 以降の設計に効く発見を記録する。

- **検証日**: 2026-04-16
- **SDK バージョン**: `@anthropic-ai/sdk@0.89.0`
- **Beta ヘッダー**: `managed-agents-2026-04-01`

## サマリー

| 項目 | 結果 | Phase 2+ への影響 |
|---|---|---|
| OpenSpec CLI 実行 | ✅ 動作 | — |
| `packages.npm` 自動インストール | ✅ 動作 | Env に CLI を仕込める |
| Private GitHub マウント | ✅ 動作 | PAT でも OAuth でも可 |
| **Session 単位の分離** | ✅ 完全分離 | マルチテナント設計が軽くなる |
| 課金モデル | `running` のみ課金 | idle 放置が許容される |
| 過去イベント取得 | SDK の `events.list()` で可能 | 会話履歴の再現が容易 |

## 検証した項目と結果

### 1. OpenSpec CLI が Managed Agents 上で動作する

Environment に `packages.npm: ['@fission-ai/openspec']` を設定して Session を作成。Agent が初回から `openspec --version` で `1.3.0` を取得できた。

- **確認コマンド**: `which openspec && openspec --version`
- **実パス**: `/home/claude/.npm-global/bin/openspec`
- `openspec list --json`, `openspec status --change` も動作確認済み

### 2. `packages.npm` が実際にインストールを行っている

別の観察経路から確認できたこと:

- **初回**: 新 Env の作成に数十秒かかる（npm install のダウンロード時間）
- **2 回目以降**: 同じ Env の Session は即起動
- 逆に、`packages` 未指定の古い Env の Session では Agent が手動で `npm install -g` を実行していた

→ **Environment 作成時にパッケージが事前インストールされ、以降のセッションはキャッシュされる**（事前知識通り）。

### 3. Private GitHub リポジトリのマウントが動作する

`gh auth token` で発行した PAT（`repo` スコープ）を `GITHUB_TOKEN` として `.env.local` に設定し、Session 作成時に `authorization_token` として渡した。

- **対象**: `color4pen/tarkov-threads`（private）
- **結果**: `/workspace/tarkov-threads` に完全にクローンされ、ファイル一覧が参照可能
- **認証方式**: Session 作成時のみ Anthropic 側がクローン実行時に使用

### 4. Session 単位で `/workspace` が完全に分離されている ⭐

**これが Phase 1 最大の発見**。同じ Environment を使う 2 つの Session を作成して検証:

| Session | Environment | Repository | `/workspace` の中身 |
|---|---|---|---|
| A | `openspec-test` | `tarkov-threads` | `tarkov-threads` のみ |
| B | `openspec-test` | `spec-runner` | `spec-runner` のみ |

Session B から Session A のリポジトリは一切見えない。`find / -name "*tarkov*"` でも空。

→ **Environment はテンプレート、Session ごとに独立したコンテナ**。Session 間のファイルシステム分離は SDK が保証する。

### 5. 課金は `running` 状態のみ

Anthropic 公式ドキュメントより:

- **Session ランタイム課金**: $0.08 / hour（ミリ秒単位）
- **課金対象**: `running` 状態のみ
- **非課金**: `idle`, `rescheduling`, `terminated`

>  "idle but unclosed sessions will still incur hourly charges" という記述も一部ドキュメントにあるが、公式 API docs では idle は非課金と明記。実測は未確認。

### 6. Archive と Delete の違い

| 操作 | コンテナ | レコード | 履歴 | `running` 中 |
|---|---|---|---|---|
| **Archive** | 停止（tear down） | 保持 | 保持 | ✅ 可能 |
| **Delete** | 削除 | 削除 | 削除 | ❌ 不可（先に `user.interrupt`） |

- Archive → Delete の順で安全に削除できる
- Unarchive API は存在しない（Archive は戻せないが、履歴読み出しは可能）

### 7. 過去イベントの取得

`client.beta.sessions.events.list(sessionId, { order: 'desc' })` で最新順に全イベントを取得可能。SDK の `PagePromise` が自動ページング。

- **料金**: トークン消費なし（通常の GET API）
- **会話履歴の UI 再現**: Stream と同じ型 `BetaManagedAgentsSessionEvent` なので、レンダリング関数を使い回せる
- **実装済み**: SpecRunner の Chat タブで Session 接続時に最新 200 件を取得

## Phase 2 以降の設計に効く示唆

### マルチテナント設計が軽くなる

Session 単位の分離が SDK で保証されているため:

- Environment は **ワークスペース全体で共有**してよい（テンプレートとしての役割）
- ユーザーごとに Environment を分ける必要はない
- テナント分離は **Session のオーナー管理** だけで済む（アプリ側の DB で `userId → sessionId` のマッピングを持てばよい）

これは当初想定していた「ユーザーごとに Env を分ける」方針より**大幅にシンプル**。Phase 5 の実装工数が削減される。

### GitHub 認証の二層化

Phase 2 で GitHub OAuth + GitHub App に移行する際、トークンの流れは:

```
[User OAuth login] → アプリ側で user identity 確立
[GitHub App installation] → リポジトリ単位の権限取得
[Session 作成時] → installation token を authorization_token に渡す
```

PAT → Installation Token の置き換えはロジックの 1 箇所（`getGitHubToken()`）で済む。Managed Agents 側は文字列として受け取るだけなので、移行コストは低い。

### 課金可視化の実装余地

`span.model_request_end` イベントに `model_usage`（cache_creation, cache_read, input, output）が含まれる。これをフロントで集計すれば **リアルタイムのコスト表示**が実装可能。

- Phase 1: ログとして流すだけ
- Phase 2 以降: セッションあたりのトークン / 金額を可視化

## Open Questions

以下は Phase 1 では判明しなかった点。Phase 2 以降で要検証:

1. **git credential がコンテナに残るか**
   - `authorization_token` がクローン用だけか、push/pull もできるか未確認
   - Agent に `git status` と `git push --dry-run` を実行させて確認すべき

2. **Session の `idle` が本当に非課金か**
   - ドキュメント記述に揺れあり
   - 長時間放置して active_seconds と duration_seconds の差分を実測したい

3. **Environment のアーカイブ・削除時の Session 挙動**
   - Env を削除すると、それを参照中の Session はどうなる?
   - 公式ドキュメントに明記なし

4. **`checkout` パラメータの挙動**
   - Session 作成時に branch / commit SHA 指定可能（`BetaManagedAgentsBranchCheckout`）
   - 特定のコミットを checkout した Session でコードを触ると、その変更はどこに行くのか
   - `git push` できるなら PR 作成フローに使える

5. **複数リポの同時マウント**
   - SDK 上は `resources` 配列で複数マウント可能
   - Mount path がぶつかった場合の挙動は未検証

## 参考リンク

- [Claude Managed Agents overview - Claude API Docs](https://platform.claude.com/docs/en/managed-agents/overview)
- [Start a session](https://platform.claude.com/docs/en/managed-agents/sessions)
- [Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- 関連: [guide.md](./guide.md) - 事前知識
