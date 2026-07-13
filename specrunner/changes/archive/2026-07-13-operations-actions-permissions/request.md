# GitHub Actions tick の権限設計と失敗時挙動を補完

## Meta

- **type**: chore
- **slug**: operations-actions-permissions
- **base-branch**: main
- **pipeline**: fast
- **adr**: false

## 背景

`docs/operations.md` に GitHub Actions の inbox tick 例は既にある（`docs/operations.md:101-141`: 3 トリガー / `concurrency` / `GITHUB_TOKEN` 自動注入 / workflow YAML / 承認ラベルフィルタ）。しかし agent が PR 作成・push・issue コメントを行うのに必要な `permissions:` ブロックが欠けており、既定 read-only トークン設定では documented workflow が権限不足で失敗しうる。また失敗時（inbox run の非ゼロ終了、agent escalation）の Actions 上の挙動が未記述。これらを補完し、GitHub Actions を第一級の導入パスにする。本 request は docs のみで機構は変更しない。

## 現状コードの前提

- `docs/operations.md:101-141` に GitHub Actions セクションが存在（workflow YAML 含む）。ただし `permissions:` ブロックが無い。
- GitHub Actions の既定 `GITHUB_TOKEN` は repo 設定により read-only のことがあり、PR 作成 / push / issue コメントには `contents: write` / `pull-requests: write` / `issues: write` が要る。
- inbox run の冪等性・issue linkage・`/resume` は `docs/operations.md`「inbox の挙動詳細」に記述済み。

## 要件

1. `docs/operations.md` の GitHub Actions workflow 例に `permissions:` ブロック（`contents: write` / `pull-requests: write` / `issues: write`）を追加し、なぜ必要か（agent の push / PR 作成 / issue コメント）を簡潔に説明する。
2. 失敗時の挙動を明記する: inbox run が失敗（非ゼロ終了）した場合の Actions run の扱い、agent escalation 時に job state が保持され次 tick / `/resume` で再開されること、`concurrency` により多重発火が直列化されること。
3. GitHub Actions を「第一級の導入パス」として位置づける短い前置き（どういう場合に Actions を選ぶか）を該当セクションに追加する。

**最重量部の名指し**: `permissions:` の欠落は documented workflow を実際に権限不足で壊しうる箇所 — ここを正すのが本 request の主眼。

## スコープ外

- launchd / crontab セクションの変更。
- `README.md` の変更（別 request が扱う）。
- inbox / tick の機構変更。docs のみ。
- 実際の `.github/workflows/` への稼働 workflow 追加（本 request は docs の例示のみ）。

## 受け入れ基準

- [ ] `docs/operations.md` の GitHub Actions workflow 例に `permissions:`（contents / pull-requests / issues: write）が含まれ、必要性が説明される。
- [ ] 失敗時の挙動（非ゼロ終了・escalation 保持と再開・concurrency 直列化）が記述される。
- [ ] `typecheck && test` が green（既存テスト無変更）。

## architect 評価済みの設計判断

- 稼働 workflow を `.github/workflows/` に追加する案は却下。導入者が自分の repo に置くもので、本体 repo では docs 例示に留める。
- README に Actions を展開する案は却下（README は別 request で扱い、Actions 詳細は `docs/operations.md` に集約する）。
