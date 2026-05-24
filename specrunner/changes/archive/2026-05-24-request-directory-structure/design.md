# Design: request をフラットファイルからディレクトリ構造に変更

## 変更の本質

`specrunner/drafts/<slug>.md` → `specrunner/drafts/<slug>/request.md` へのパス解決ロジック変更。影響は `store.ts` の 5 関数 + `paths.ts` の 2 関数 + `pipeline-run.ts` の正規表現 1 箇所に集中する。

## D1: パス解決の変更点

### paths.ts

| 関数 | 現在 | 変更後 |
|------|------|--------|
| `draftPath(slug)` | `specrunner/drafts/<slug>.md` | `specrunner/drafts/<slug>/request.md` |
| `draftsDir()` | 変更なし | 変更なし |

新規追加:
- `draftPathLegacy(slug)` → `specrunner/drafts/<slug>.md` (後方互換フォールバック用)

### store.ts

| 関数 | 変更内容 |
|------|----------|
| `resolve(cwd, slug)` | まず `<slug>/request.md` を返す。呼び出し元が存在チェックする既存パターンのため、返すパスは新形式固定。ただし後方互換のための `resolveWithFallback()` を新設 |
| `resolveWithFallback(cwd, slug)` | **新設**。`<slug>/request.md` が存在すればそれを、なければ `<slug>.md` を返す。存在しなければ新形式パスを返す |
| `list(cwd)` | `readdir` → ディレクトリかつ `request.md` を含むものを列挙。フォールバックとして `.md` ファイルも含める |
| `read(cwd, slug)` | `resolveWithFallback()` を使用 |
| `write(cwd, slug, content)` | `<slug>/` ディレクトリを `mkdir -p` して `request.md` を書く |
| `checkSlugCollision(cwd, slug)` | ディレクトリ `<slug>/` の存在もチェック対象に追加 |

### pipeline-run.ts

| 定数 | 現在 | 変更後 |
|------|------|--------|
| `CANONICAL_PATTERN` | `/^.*\/specrunner\/drafts\/([^/]+)\.md$/` | `/^.*\/specrunner\/drafts\/([^/]+)\/request\.md$/` |

ただし後方互換のため、新パターンにマッチしない場合は旧パターンでもフォールバック試行する。

## D2: 後方互換戦略

`resolve()` の呼び出し元は 3 パターンに分類される:

1. **ファイル存在チェック付き** (`command-registry.ts` validate/review, `run.ts`): `fs.existsSync()` で判定後にフォールバック。これらは `resolveWithFallback()` に切り替える
2. **直接読み込み** (`store.read()`): 内部で `resolveWithFallback()` を使う
3. **書き込み** (`store.write()`): 常に新形式

`resolve()` 自体は新形式パスを返すように変更し、後方互換が必要な箇所は `resolveWithFallback()` を使う。

## D3: list() の後方互換

`list()` は以下を slug として返す:
1. ディレクトリ `<slug>/` 内に `request.md` があるもの
2. フラットファイル `<slug>.md` (同名ディレクトリがない場合のみ)

重複排除: ディレクトリとフラットファイルの両方が存在する場合はディレクトリを優先。

## D4: checkSlugCollision() の拡張

現在のチェック対象:
1. `specrunner/drafts/<slug>.md` (フラットファイル)
2. `specrunner/changes/archive/` (ディレクトリ)

追加チェック:
3. `specrunner/drafts/<slug>/` (新ディレクトリ構造)

## D5: command-registry.ts の変更

`validate` と `review` の slug 解決は `storeResolve()` を呼んで `fs.existsSync()` で存在チェックしている。`storeResolve()` を `resolveWithFallback()` に切り替えることで後方互換を維持。

`run.ts` の `runRunCore()` も同様に `storeResolve()` → `resolveWithFallback()` に切り替え。

## D6: CANONICAL_PATTERN の後方互換

```typescript
// 新形式を優先
const CANONICAL_PATTERN_NEW = /^.*\/specrunner\/drafts\/([^/]+)\/request\.md$/;
// 旧形式フォールバック
const CANONICAL_PATTERN_LEGACY = /^.*\/specrunner\/drafts\/([^/]+)\.md$/;

const canonicalMatch =
  CANONICAL_PATTERN_NEW.exec(this.absolutePath) ??
  CANONICAL_PATTERN_LEGACY.exec(this.absolutePath);
```

## D7: request-new.ts の変更

`draftPath()` が新形式を返すようになるため、stderr 出力の `Created: ...` メッセージが自動的に新パスになる。`storeWrite()` が内部で `mkdir` するため追加変更は不要。

## D8: generator.ts (request generate) の変更

`store.write()` を使っているため、store.ts の変更で自動的にディレクトリ構造になる。変更不要。

## D9: manager.ts の変更

`store.resolve()` を呼んでいる `review()` と `resolve()` を `resolveWithFallback()` に切り替える。

## 影響範囲まとめ

### 変更が必要なファイル
| ファイル | 変更内容 |
|----------|----------|
| `src/util/paths.ts` | `draftPath()` 更新、`draftPathLegacy()` 追加 |
| `src/core/request/store.ts` | 5 関数すべて更新、`resolveWithFallback()` 追加 |
| `src/core/command/pipeline-run.ts` | `CANONICAL_PATTERN` 更新 |
| `src/cli/command-registry.ts` | `storeResolve` → `resolveWithFallback` |
| `src/cli/run.ts` | `storeResolve` → `resolveWithFallback` |
| `src/core/request/manager.ts` | `store.resolve` → `store.resolveWithFallback` |

### 変更不要なファイル
| ファイル | 理由 |
|----------|------|
| `src/core/command/request-new.ts` | `storeWrite()` と `draftPath()` 経由で自動対応 |
| `src/core/request/generator.ts` | `store.write()` 経由で自動対応 |
| `src/core/request/reviewer.ts` | ファイルパスを受け取るだけ、解決は呼び出し元 |
| `specrunner/changes/` 構造 | スコープ外 |

### テスト更新
| テストファイル | 変更内容 |
|----------------|----------|
| `tests/unit/core/request/store.test.ts` | 全テスト更新 + 後方互換テスト追加 |
| `tests/unit/core/command/pipeline-run-canonical.test.ts` | 新パターン + フォールバックテスト |
| `tests/unit/core/command/request-new.test.ts` | ディレクトリ作成の検証 |
