# Design: GitHub Actions permissions と失敗時挙動の補完

## Context

`docs/operations.md` の GitHub Actions セクション（lines 101–141）には workflow YAML の例示があるが、`permissions:` ブロックが含まれていない。GitHub リポジトリのデフォルト設定では `GITHUB_TOKEN` が read-only になっている場合があり、その状態では agent が行う push / PR 作成 / issue コメントが権限エラーで失敗する。ドキュメントが示す動作が実際には権限不足で壊れうるという矛盾がある。

加えて、inbox run が失敗したとき（非ゼロ終了・escalation）の Actions 上の挙動と、`concurrency` 設定が多重発火をどう制御するかが記述されていない。

本 request は `docs/operations.md` のみを対象とする docs-only の変更。機構・`.github/workflows/`・README は対象外。

## Goals / Non-Goals

**Goals**:
- `docs/operations.md` の GitHub Actions workflow 例に `permissions:` ブロック（`contents: write` / `pull-requests: write` / `issues: write`）を追加し、各権限が何のために必要かを説明する。
- 失敗時の挙動（非ゼロ終了時の run の扱い・escalation 時の job state 保持と再開・`concurrency` による直列化）を同セクションに記述する。
- GitHub Actions を「クラウド環境での第一級の導入パス」として位置づける前置きを該当セクションに追加する。

**Non-Goals**:
- launchd / crontab セクションの変更。
- `README.md` の変更。
- 実際の `.github/workflows/` への稼働 workflow の追加。
- inbox / tick 機構の変更。

## Decisions

**D1: `permissions:` はジョブレベルに置く**

Rationale: ワークフローレベルではなくジョブ（`inbox-run`）レベルに `permissions:` を置くことで、最小権限の原則を満たしつつ、複数ジョブを持つ workflow への転用でも意図が明確になる。
Alternatives: workflow レベルの `permissions:` — 余剰スコープになりうるため却下。

**D2: 失敗時の挙動は GitHub Actions セクション内に記述する**

Rationale: 「inbox の挙動詳細」セクションはすでに runtime/platform 非依存の内容で完結している。Actions 固有の事象（job の exit code・concurrency キュー動作）は Actions YAML の近傍に置くことで読者のスキャン負荷を下げる。
Alternatives: 「inbox の挙動詳細」に追記 — platform 非依存の設計を壊すため却下。

**D3: 「GitHub Actions を選ぶ場面」の前置きを GitHub Actions セクション冒頭に配置する**

Rationale: 読者が YAML 詳細を読む前に自分のユースケースと合致するかを判断できる。launchd / crontab との使い分け基準を提示することで第一級の導入パスとして位置づける。
Alternatives: セクション末尾へ — YAML を先に見せる構成では導入判断が遅れるため却下。

## Risks / Trade-offs

[Risk] 失敗時の Actions 挙動の説明が実際の Actions 仕様と乖離する可能性。→ Mitigation: 記述を GitHub Actions の公開仕様（schedule は次回 cron まで再試行なし / `cancel-in-progress: false` は queue 動作）に沿った最小限の事実記述に留める。

[Risk] `permissions:` の追加でドキュメント例が複雑になり初見者の認知負荷が増す。→ Mitigation: 各フィールドにインラインコメントで用途を明記することで自己説明的にする。

## Open Questions

なし。architect 評価済みの設計判断（稼働 workflow 追加却下・README 展開却下）が request に明記されている。
