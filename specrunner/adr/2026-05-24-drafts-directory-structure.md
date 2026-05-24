# ADR: drafts をディレクトリ構造に変更する

- **date**: 2026-05-24
- **slug**: drafts-directory-structure
- **status**: accepted

## Context

`2026-05-20-flatten-request-files` ADR で、`requests/active/<slug>/request.md`（ディレクトリ構造）を `drafts/<slug>.md`（flat ファイル）に変更した。その判断の根拠は「1 dir = 1 file という冗長な 1:1 対応で dir の意味が薄い」ことだった。

その後、architect レビュー結果・module-architect 分析・token 使用量などの **付随成果物** を request に紐づけて保存したいという要求が生まれた。flat ファイル構造ではこれらの置き場所がなく、session 内で消える。

また、`specrunner/changes/<slug>/` は既にディレクトリ構造で設計されており、drafts もディレクトリにすることで **drafts → changes という 2 段階の pipeline 全体でディレクトリ構造が統一**される。

前回の flat 化判断の時点では「付随成果物を保存する」という要求は存在しなかった。今回は「dir に保存すべき付随ファイルが実際に存在する」ため、ディレクトリ化の意味が生まれる。

## Decisions

### D1: `specrunner/drafts/<slug>/request.md` に変更する

**決定**: `specrunner/drafts/<slug>.md` → `specrunner/drafts/<slug>/request.md`

**根拠**:
- 将来の付随ファイル（architect レビュー結果、module-architect 分析、token 使用量等）の置き場所を確保する
- `changes/<slug>/` との構造の対称性が生まれ、drafts → changes の pipeline が一貫した dir ベースになる
- `changes/<slug>/request.md` の固定名と命名が揃い、worktree コピー時の変換ロジックが自明になる

**前回 flat 化の根拠との対比**:

| 前回 flat 化の理由 | 今回の評価 |
|---|---|
| 1 dir = 1 file で意味が薄い | 将来的に複数の付随ファイルを格納する前提が生まれたため、dir の意味が確立される |
| `request ls` の slug 視認性 | ディレクトリ名が slug になるため視認性は維持される |
| `request rm` の誤削除リスク | コマンドが `fs.rmdir()` になるが dir 内は `request.md` のみが必須、構造が明確 |
| `request new` のシンプルさ | `mkdir -p` が 1 回追加されるが許容範囲 |

**却下した選択肢**:
- flat ファイルを維持しつつ付随ファイルを別ディレクトリに保存する: slug と付随ファイルの対応関係が分散し、参照ロジックが複雑になる
- 付随成果物をメモリ（session）のみで管理する: session 終了で消えるため、後続 session / 別 agent での参照が不可能

---

### D2: 後方互換を `resolveWithFallback()` で維持し、一括 migration は強制しない

**決定**: `store.ts` に `resolveWithFallback(cwd, slug)` を新設し、まず `<slug>/request.md` を、なければ `<slug>.md` を返す。新規 write は常にディレクトリ構造。既存 flat ファイルの migration は手動または別 request で行う。

**根拠**:
- `specrunner/drafts/` 配下の既存 flat ファイル（`<slug>.md`）は稼働中の draft が存在する可能性がある
- 一括 migration スクリプトを PR に含めると変更範囲が過大になり、誤操作リスクが高まる
- `resolveWithFallback()` を単一の関数に集約することで、後方互換ロジックが 1 箇所に収まる

**フォールバック戦略の詳細**:
1. `<slug>/request.md` が存在 → ディレクトリ形式を使用
2. `<slug>.md` が存在 → flat ファイルにフォールバック
3. どちらも存在しない → 新形式パス（`<slug>/request.md`）を返す（新規作成時の挙動）

`resolve()` は引き続き新形式パスを返す（新規 write 用）。後方互換が必要な read/existence-check 箇所のみ `resolveWithFallback()` に切り替える。

---

### D3: `list()` はディレクトリ優先で flat ファイルとの重複を排除する

**決定**: `list()` はまずディレクトリ（`request.md` を含む）を列挙し、フラットファイルは同名ディレクトリが存在しない場合のみ含める。重複排除に `Set` を使用する。

**根拠**: ディレクトリと flat ファイルの両方が存在するケース（不完全 migration 状態）でも slug が重複して返らないようにし、コマンドの冪等性を保つ。

---

### D4: `CANONICAL_PATTERN` に新旧 2 パターンを持ち、新形式優先でフォールバック

**決定**: `pipeline-run.ts` の `CANONICAL_PATTERN` を 2 本に分割する。

```typescript
const CANONICAL_PATTERN_NEW = /^.*\/specrunner\/drafts\/([^/]+)\/request\.md$/;
const CANONICAL_PATTERN_LEGACY = /^.*\/specrunner\/drafts\/([^/]+)\.md$/;

const match = CANONICAL_PATTERN_NEW.exec(path) ?? CANONICAL_PATTERN_LEGACY.exec(path);
```

**根拠**: `specrunner run <slug>` は draft ファイルを絶対パスで受け取るケースがあり、flat ファイルを直接渡された場合もエラーにしないよう後方互換を維持する。

---

### D5: `changes/<slug>/request.md` の構造は変更しない

**決定**: pipeline 実行時のコピー先である `specrunner/changes/<slug>/request.md` は変更しない。

**根拠**: `changes/<slug>/` は既にディレクトリ構造であり、変更不要。`drafts/<slug>/request.md` → `changes/<slug>/request.md` のコピーロジックは従来どおりファイル名 `request.md` 同士の対応になり、変換不要。

## Alternatives Considered

### Alternative 1: flat ファイルを維持し、付随ファイルは `specrunner/drafts-meta/<slug>/` に分離する

draft 本体は `drafts/<slug>.md` のまま flat を維持し、付随ファイルのみ `drafts-meta/<slug>/` という別ディレクトリに保存する。

- **Pros**: 既存 flat 形式を変えずに付随ファイルを保存できる。migration 不要
- **Cons**: draft と付随ファイルが別ディレクトリに分散し、slug を使って 2 箇所を参照するロジックが必要。`rm <slug>` 時に 2 箇所の削除が必要になり誤操作リスクが上がる。`changes/<slug>/` との構造的対称性が崩れる
- **Why not**: slug 単位の成果物を 1 ディレクトリに集約するという `changes/<slug>/` の設計原則に反する

### Alternative 2: 付随ファイルは session ログとして別の場所に保存し、drafts は flat のまま維持する

architect レビュー結果等を `specrunner/logs/` や DB に保存し、drafts との紐付けは slug key で行う。

- **Pros**: drafts の構造変更が不要
- **Cons**: session をまたいだ参照に slug key lookup が必要になる。`specrunner/changes/` とは全く別の persistence 層を新設する必要がある。LLM session に state を持たせない設計原則（knowledge injection model）との整合性を保つには file-based persistence が自然
- **Why not**: 既存の change folder パターン（file-based、ディレクトリに集約）を踏襲することがシステム全体の一貫性を保つ

### Alternative 3: 付随ファイルを draft に inline 埋め込みし、flat ファイルのまま拡張する

`request.md` に付随情報（architect レビュー結果等）を YAML frontmatter や追記セクションとして埋め込む。

- **Pros**: 1 ファイルで完結し、ディレクトリ構造の変更が不要
- **Cons**: 付随情報が肥大化すると `request.md` の本来の目的（要件記述）が見づらくなる。LLM context に不要な情報を混入させるリスクがある。特定の付随ファイル（例: architect レビュー）を個別に参照・更新できない
- **Why not**: 関心の分離原則に反する。将来の付随ファイル多様化に耐えられない

## Consequences

- `specrunner/drafts/<slug>/request.md` が新しい標準パスになる
- 既存の flat ファイル draft は `resolveWithFallback()` により引き続き動作する（migration は任意）
- drafts ディレクトリと changes ディレクトリの構造が揃い、pipeline 全体の一貫性が高まる
- 将来の付随ファイル（architect レビュー結果、module-architect 分析）保存のための構造的基盤が確立される
- `store.ts` に `resolveWithFallback()` という後方互換専用の関数が追加される（将来 flat ファイルが完全に移行されたら削除可能）

## 関連 ADR

- [2026-05-20-flatten-request-files](./2026-05-20-flatten-request-files.md) — 本 ADR が逆転する判断。flat 化の根拠と本 ADR の根拠の違いを Context に記録
- [2026-05-20-requests-to-drafts-restructure](./2026-05-20-requests-to-drafts-restructure.md) — `requests/active/` → `drafts/` の rename。本 ADR はその `drafts/` のディレクトリ化
