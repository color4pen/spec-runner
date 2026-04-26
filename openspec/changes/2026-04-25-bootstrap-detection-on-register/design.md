## Context

`registerRepository()` は GitHub API でリポジトリのアクセスを検証した後、`bootstrap_status: 'uninitialized'` で固定 INSERT している。openspec-workflow が既にセットアップ済みのリポジトリを登録すると、不要な bootstrap フローが発生する。

既存の `github-api.ts` には `getFileContent()` と `getDirectoryContents()` が実装済みで、GitHub Contents API (`GET /repos/{owner}/{repo}/contents/{path}`) を使ったファイル/ディレクトリ存在確認が可能。これらは 404 を例外ではなく null/空配列で返す設計になっている。

## Goals / Non-Goals

**Goals:**

- bootstrap 済みリポジトリを `ready` で登録し、不要な bootstrap フローをスキップする
- GitHub API エラー時は安全側に倒して `uninitialized` で登録する (機能劣化は許容)
- 既存の `registerRepository()` の API 契約を維持する (戻り値の型変更なし)

**Non-Goals:**

- 既存リポジトリの bootstrap_status を遡及的に修正する機能 (マイグレーション)
- `openspec/project.md` の内容を解析して OpenSpec バージョンを判定する
- bootstrap_status の状態マシン遷移ルール自体の変更
- `ready` 以外の中間状態 (`bootstrapping`, `pr_pending`) での自動判定

## Decisions

### 1. 判定基準: `openspec/project.md` + `requests/active/` の存在チェック

**選択**: 2つのパスの存在を AND 条件で判定する。

**理由**: `openspec/project.md` だけでは OpenSpec 初期化のみで workflow が未セットアップの可能性がある。`requests/active/` の存在が openspec-workflow bootstrap の証拠となる。両方揃って初めて `ready` と判定できる。

**代替案**:
- `.claude/` ディレクトリの存在確認 — bootstrap が何を生成するかに強く依存し、変更に脆い
- `openspec/project.md` のみ — false positive のリスク (OpenSpec 初期化のみで workflow 未セットアップ)

### 2. 既存の `getFileContent` / `getDirectoryContents` を再利用

**選択**: `github-api.ts` の既存関数を使う。新しい API ラッパーは作らない。

**理由**: 
- `getFileContent` は 404 → null を返す設計で、ファイル存在チェックに適している
- `getDirectoryContents` は 404 → 空配列を返す設計で、ディレクトリ存在チェックに適している
- ただし判定に内容は不要なため、`getDirectoryContents` でファイルの存在もチェック可能 (path がファイルの場合は非配列を返し空配列になる → 不適)
- `openspec/project.md` は `getFileContent` (null チェック)、`requests/active/` は `getDirectoryContents` (配列長チェック) を使う

### 3. `Promise.all` による並列実行

**選択**: 2つの API 呼び出しを `Promise.all` で並列化する。

**理由**: 直列実行では登録のレイテンシが倍増する。2つの独立した存在チェックは並列化に適している。

### 4. エラーハンドリング: 安全側倒し

**選択**: GitHub API エラー (ネットワーク障害、レートリミット等) 時は `uninitialized` にフォールバックする。エラーを throw しない。

**理由**: 
- 登録操作自体は成功させるべき (ユーザーが登録したいのに API エラーで登録できないのは不合理)
- `uninitialized` で登録されても、ユーザーは後から手動で bootstrap を実行できる (最悪でも従来動作)
- `ready` で誤判定するリスク (false positive) を回避する

### 5. 判定ロジックの配置: `registerRepository()` 内のヘルパー関数

**選択**: `detectBootstrapStatus()` を `repository-registration-actions.ts` 内のモジュールプライベート関数として定義する。

**理由**:
- 判定ロジックは `registerRepository()` でのみ使用される
- テスト可能性のため関数として切り出すが、export は不要
- 将来的に他の箇所で再利用が必要になった場合に export に昇格すればよい

## Risks / Trade-offs

- **[リスク] GitHub API レートリミット**: 登録ごとに 2 回の追加 API 呼び出しが発生する → 緩和: 登録は低頻度操作であり、レートリミットへの影響は軽微。エラー時は `uninitialized` にフォールバック
- **[リスク] default branch 以外に bootstrap 済みファイルがある場合**: 判定は default branch のみを参照する → 緩和: bootstrap は default branch に対して実行されるため、default branch にファイルがない = bootstrap 未完了と判定して問題ない
- **[トレードオフ] false negative (bootstrap 済みなのに uninitialized)**: API エラーやレートリミット時に発生しうる → ユーザーが手動 bootstrap を実行すれば解消。安全側に倒す設計として許容
- **[トレードオフ] 登録レイテンシの増加**: 2 回の追加 API 呼び出し (並列) 分だけ増加 → GitHub Contents API の応答は通常 100ms 以下であり、体感への影響は軽微
