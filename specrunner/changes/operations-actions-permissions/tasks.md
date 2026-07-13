# Tasks: GitHub Actions permissions と失敗時挙動の補完

## T-01: GitHub Actions セクションに「いつ Actions を選ぶか」の前置きを追加

対象ファイル: `docs/operations.md`

現在の GitHub Actions セクション冒頭（`### GitHub Actions` の見出し直下）に、以下の内容を含む前置き段落を追加する。

- 常時稼働 Mac が不要なクラウド環境・サーバーサイドリポジトリに適すること。
- チームリポジトリで per-developer 設定なしに共有トリガーを使いたい場合に適すること。
- すでに Actions で CI/CD を運用しているリポジトリでは自然な選択であること。
- launchd / crontab はローカル Mac 環境向け、Actions はクラウド環境向けの棲み分けを一文で示す。

**Acceptance Criteria**:
- `### GitHub Actions` 見出し直後（既存の「3 つのトリガーで…」の段落より前）に前置き段落が存在する。
- launchd / crontab との選択基準が読み取れる。

---

## T-02: workflow YAML 例に `permissions:` ブロックを追加し説明を記述

対象ファイル: `docs/operations.md`

現在の GitHub Actions workflow YAML（`jobs.inbox-run` ブロック）に `permissions:` を追加する。挿入位置は `runs-on: ubuntu-latest` の直後、`steps:` の前。

追加する `permissions:` ブロック:

```yaml
    permissions:
      contents: write        # agent の push / branch 操作に必要
      pull-requests: write   # agent の PR 作成に必要
      issues: write          # agent の issue コメント（escalation 通知・完了通知）に必要
```

YAML ブロックの後（または「承認ラベルフィルタ」の補足コードブロック前後）に、`permissions:` が必要な理由を説明する散文を追加する:

- GitHub リポジトリのデフォルト設定では `GITHUB_TOKEN` が read-only になる場合がある。
- agent が push / PR 作成 / issue コメントを行うには `contents: write` / `pull-requests: write` / `issues: write` が必要。
- `GITHUB_TOKEN` は run ごとに自動注入されるため secret 設定は不要だが、`permissions:` の明示宣言が必須。

既存の「`GITHUB_TOKEN` は GitHub Actions が run ごとに自動注入するため、手動の secret 設定は不要。」という文は残す（削除しない）。説明の補足として `permissions:` の必要性を続けて説明する形にする。

**Acceptance Criteria**:
- workflow YAML の `jobs.inbox-run` に `permissions:` ブロックが含まれ、`contents: write` / `pull-requests: write` / `issues: write` の 3 フィールドが存在する。
- 各フィールドにインラインコメントで用途が記されている（日本語または英語）。
- YAML の外に `permissions:` が必要な理由を説明する散文が存在する。
- 既存の `GITHUB_TOKEN` 自動注入の説明は保持される。

---

## T-03: 失敗時の挙動を GitHub Actions セクションに追記

対象ファイル: `docs/operations.md`

GitHub Actions セクション内（workflow YAML とその補足の後）に、失敗時挙動の説明を追加する。

以下の 3 点を含む小見出しまたは段落を追加する:

1. **inbox run が非ゼロ終了した場合**: Actions の job が failed になる。次のスケジュール tick（次の cron 発火）または次のトリガーイベントで新しい run が起動し、inbox の冪等設計により安全に再試行される。
2. **agent escalation 時**: job の状態（進捗・context）はブランチに保持される。次の tick または issue への `/resume` コメントで再開できる（`inbox の挙動詳細` セクションの `/resume` ワークフロー参照）。
3. **`concurrency` による直列化**: `cancel-in-progress: false` により、実行中の run は完走させつつ次の run はキューに入る。複数のトリガーが短時間に重なっても多重実行にならない。

**Acceptance Criteria**:
- 非ゼロ終了時の Actions run の扱いが記述されている。
- escalation 時に job state が保持され、次の tick / `/resume` で再開されることが記述されている。
- `concurrency` 設定が多重発火を直列化することが記述されている。

---

## T-04: 受け入れ基準の機械検証

`typecheck && test` を実行して既存テストが green であることを確認する。

```sh
bun run typecheck && bun run test
```

docs のみの変更であるため型エラー・テスト失敗は発生しないはずだが、変更後に必ず実行して確認する。

**Acceptance Criteria**:
- `bun run typecheck` が 0 で終了する。
- `bun run test` が 0 で終了する（既存テスト無変更）。
