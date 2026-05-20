# request.md を CLI 1 コマンドで生成する

## Meta

- **type**: new-feature
- **slug**: request-create-command

## 背景

現在 request.md は手動で作成している。ユーザーがエディタで書き、セッション内で architect に評価させ、修正して `specrunner run` に渡す。この流れは動くが、毎回一からプロジェクトの文脈を組み立てる必要があり、スムーズではない。

spec-runner の設計原理「LLM session に state を持たせない」「知識の寿命と session の寿命を分離」に基づき、CLI がプロジェクトの文脈（DynamicContext + 過去の request パターン）を収集して 1 回の LLM query に注入することで、最小限の入力から品質の高い request.md を生成できる。

session が使い捨てでも文脈が消えないのは、merged requests 自体がパターンの蓄積として機能し、新しい request が merge されるたびにパターンプールが自動更新されるため。

## 要件

### 1. CLI エントリポイント

1. `bin/specrunner.ts` に `create` サブコマンドを追加する。`src/cli/create.ts` にファサード関数 `runCreate()` を実装する

2. コマンド書式:

```
specrunner create "<description>" [--type <type>] [--slug <slug>] [--no-llm] [--run]
```

- `<description>`: 必須。request の 1 行要約（例: `"pipeline step にリポジトリの動的コンテキストを注入する"`）
- `--type`: 任意。TYPE_CONFIG の 5 type から選択。省略時は `new-feature`
- `--slug`: 任意。省略時は CLI が description から kebab-case で導出する。既存 slug との衝突チェックを行い、衝突時はエラー
- `--no-llm`: LLM を使わず TYPE_CONFIG ベースの scaffold テンプレートだけを出力する
- `--run`: 生成後に `specrunner run` を自動実行する。デフォルト OFF

### 2. slug 導出

3. description から slug を導出するロジックを `src/util/slugify.ts` に実装する。kebab-case 変換 + 50 文字以内に切り詰め

4. `specrunner/requests/active/` と `specrunner/requests/merged/` を走査して既存 slug との衝突をチェックする。衝突時はエラー終了

### 3. request パターン収集

5. `src/context/request-patterns.ts` に `collectRequestPatterns()` を実装する

```typescript
interface RequestPattern {
  type: string;
  title: string;
  slug: string;
  content: string;
}

function collectRequestPatterns(
  cwd: string,
  targetType: string,
  maxSamples?: number,
): Promise<RequestPattern[]>
```

6. `specrunner/requests/merged/` を走査し、同一 type の request.md をアルファベット順で最大 3 件取得する（パターン学習目的であり時系列の厳密性は不要。slug に日付 prefix がないためアルファベット順と時系列は一致しない）

7. 異なる type から 1 件を追加し、最大 4 件のサンプルを返す

### 4. LocalRuntime.query() の実装

8. `src/core/runtime/local.ts:66-68` の空プレースホルダを実装する。Claude Code SDK の `sdkQuery()` を呼び出し、`SDKResultMessage` を yield する。`ClaudeCodeRunner.run()` の SDK 呼び出しパターン（`src/adapter/claude-code/agent-runner.ts:126-153`）を参考に、branch verification / commit check を省いた軽量版として実装する。SDK への options は `{ cwd, allowedTools: ["Read", "Grep", "Glob"], permissionMode: "bypassPermissions", model }` とする。systemPrompt は SDK の `options.systemPrompt` で渡す（prompt パラメータに結合しない）

9. `query()` はテスト用に `QueryFn` を注入可能にする（`ClaudeCodeRunner` と同じパターン）。LocalRuntime のコンストラクタ引数が 5 個になるため、named options object `{ cwd, githubClient, manager?, spawnFn?, queryFn? }` に移行する

### 5. create コマンドの実行フロー

10. `src/core/command/create.ts` に create コマンドの本体を実装する。CommandRunner は使わない（pipeline ではないため）。フローは以下の通り:

```
a. slug 導出 + 衝突チェック
b. DynamicContext 収集（collectDynamicContext）
c. request パターン収集（collectRequestPatterns）
d. system prompt + user message を組み立て
e. RuntimeStrategy.query() で 1 回の LLM 呼び出し
f. 応答から request.md の内容を抽出
g. specrunner/requests/active/<slug>/request.md に書き出し
h. parseRequestMdContent() でバリデーション（Meta の type/slug/title が正しいか）
i. stdout にパスを出力
j. --run なら runRunCore() を呼ぶ
```

11. `--no-llm` の場合は手順 b-f をスキップし、TYPE_CONFIG ベースの scaffold テンプレートを出力する。テンプレートには title / type / slug / セクション見出し（背景 / 要件 / スコープ外 / 受け入れ基準）を含む

### 6. prompt 設計

12. system prompt を `src/prompts/create-system.ts` に定義する。以下を含める:
    - request.md の構造ルール（title / Meta / 背景 / 要件 / スコープ外 / 受け入れ基準）
    - 番号付き要件リストの書き方
    - 受け入れ基準はチェックリスト形式
    - 最後に `bun run typecheck && bun run test` が green を含める
    - architect 評価済みの設計判断セクションの書き方

13. user message に以下を注入する:
    - description（ユーザー入力）
    - type
    - DynamicContext（specsList / changesList。gitLog / diffStat は create 時点では不要）
    - request パターン（同一 type 直近 3 件 + 異 type 1 件の full text）

14. LLM の応答から request.md の内容を抽出する。以下の 3 段フォールバックで処理する:
    1. 応答全体を `parseRequestMdContent()` に通し、成功すればそのまま使う
    2. 失敗したら最初の `` ```markdown ... ``` `` ブロックを正規表現で抽出し、再度 `parseRequestMdContent()` に通す
    3. それでも失敗したらエラー終了（LLM の応答が期待フォーマットに合わなかった旨を stderr に出力）

15. system prompt に「応答はマークダウンのみ。前後の説明文やコードフェンスで囲まない」と明示する。ただし LLM の出力は保証されないため、上記フォールバックで吸収する

### 7. query() 応答の型安全性

16. `RuntimeStrategy.query()` の戻り値は `AsyncGenerator<unknown>` であるため、create.ts 側で `unknown` から SDK の result message へ安全にナローイングする型ガード関数を定義する。`message.type === "result"` と `message.subtype` の存在チェックで判定する。adapter 層の SDKMessage 型への直接依存は避け、必要最小限の構造的型チェックで済ませる

### 8. テスト

17. `slugify()` のユニットテスト: 日本語・英語・記号・長い文字列の変換と切り詰め
18. `collectRequestPatterns()` のユニットテスト: merged requests からの type 別サンプリング、空ディレクトリ時のフォールバック
19. `--no-llm` の scaffold テンプレート出力テスト: parseRequestMdContent() でバリデーションが通ること
20. create コマンドの統合テスト: query() をモックして request.md が正しいパスに書き出されること
21. 応答抽出の 3 段フォールバックテスト: 生マークダウン / コードブロック囲み / 不正応答の各パターン

## スコープ外

- ManagedRuntime.query() の実装（local runtime のみ対応）
- 対話モード（clarifying questions → refinement loop）
- LLM による type 自動推定（`--type` 省略時のデフォルトは `new-feature` 固定）
- create 内での architect 評価ループ（spec-review step に委ねる）
- merged requests のメタデータ index キャッシュ（現時点で 18 件。不要）

## 受け入れ基準

- [ ] `specrunner create "description" --type new-feature` で request.md が生成される
- [ ] 生成された request.md が `parseRequestMdContent()` のバリデーションを通る
- [ ] `--no-llm` で scaffold テンプレートが出力される
- [ ] `--slug` で slug を明示指定できる。省略時は description から導出される
- [ ] 既存 slug と衝突した場合にエラー終了する
- [ ] `--run` で生成後に pipeline が起動する
- [ ] `LocalRuntime.query()` が Claude Code SDK を呼び出して応答を返す
- [ ] request パターン（同一 type 直近 3 件 + 異 type 1 件）が prompt に注入される
- [ ] DynamicContext（specsList / changesList）が prompt に注入される
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- **1 回の query() で完結**: 対話モードは YAGNI。生成後にユーザーが編集できるので完璧を求めない。曖昧な入力への対策は prompt engineering で吸収
- **pipeline の外に配置**: CommandRunner / Pipeline / StepExecutor に変更なし。create は独立コマンド
- **architect 評価を組み込まない**: spec-review step が既に品質保証を担っている。create 内で評価ループを回すと責務の二重化
- **slug は CLI が deterministic に生成**: LLM に任せると品質がばらつく（過去の slug divergence 問題の教訓）
- **コンテキスト注入は構造的サンプリング**: 全件載せるとトークン爆発、要約すると構造的パターンが消える。同一 type 3 件 + 異 type 1 件で最大 10000-20000 token（request.md の長さに依存）。1-shot query なのでコンテキストウィンドウの余裕は十分
- **`--run` はデフォルト OFF**: request.md はユーザーが確認すべき入力仕様。確認なしで pipeline に流すのはリスク
- **`--run` の二重初期化は既知**: create と runRunCore() でそれぞれ preflight（loadConfig, getOriginInfo, git fetch）が走る。数秒の遅延が発生するが、runRunCore() の signature 変更は将来の最適化として先送り
- **query() の型ブリッジ**: `AsyncGenerator<unknown>` を消費する create.ts 側に構造的型ガードを置く。SDK の型に直接依存せず、`{ type: "result", subtype: string }` の構造チェックで済ませる


---

> **Note**: This request was archived before the change-folder format was introduced.
> Only `request.md` is preserved; design / tasks / delta-specs are not available.
> Migrated from `specrunner/requests/merged/request-create-command.md` by `merged-to-archive-consolidation`.
