# ADR-20260416: Session 紐付けは DB 主導で管理する

**Date**: 2026-04-16
**Status**: accepted

## Context

Managed Agents API の `sessions.list()` はアカウント全体のセッション一覧を返すが、ユーザーフィルタやリポジトリフィルタを持たない。Phase 2 でマルチユーザー対応するにあたり、「このユーザーの、このリポジトリに対するセッション一覧」を効率的に取得する仕組みが必要になった。

また、セッション作成時にユーザーの OAuth トークンでリポジトリをマウントするため、セッションとユーザー・リポジトリの関係を記録する必要がある。

## Decision

`user_sessions` テーブルでユーザーと Managed Agents Session の紐付けを管理する。セッション作成時に DB レコードを書き込み、一覧表示は DB クエリで実現する。Managed Agents API は補助的に使用し、ステータス同期のみに利用する。

## Alternatives Considered

### Alternative 1: Managed Agents API の sessions.list() を毎回呼ぶ
- **Pros**: DB が不要。API が唯一の真実（Single Source of Truth）
- **Cons**: ユーザー・リポフィルタがないため全セッションを走査してクライアント側でフィルタリングが必要。セッション数が増えるとパフォーマンスが悪化。resources の取得に追加 API 呼び出しが必要
- **Why not**: N+1 問題が発生する。数百セッション規模で実用に耐えない

### Alternative 2: API レスポンスをキャッシュ（Redis / in-memory）
- **Pros**: DB スキーマ管理が不要。キャッシュ invalidation で鮮度を維持
- **Cons**: キャッシュの一貫性管理が複雑。ローカル開発で Redis は過剰。in-memory はプロセス再起動で消失
- **Why not**: 永続的な紐付け情報を揮発性ストアに置くのは不適切

### Alternative 3: Managed Agents の metadata にユーザー情報を書き込む
- **Pros**: API 側にデータが集約される
- **Cons**: metadata はセッション作成時にしか設定できず更新不可。フィルタリング API が提供されていない
- **Why not**: API の制約で実現不可能

## Consequences

### Positive
- ユーザー × リポジトリの絞り込みが DB インデックスで高速に実行できる
- セッションのステータスをキャッシュすることで、一覧表示時の API 呼び出しを最小化
- セッション作成の失敗時にロールバック処理が可能（API セッション作成後の DB INSERT 失敗時に API セッションを archive する）
- 将来のワークフロー状態管理（Phase 4）の土台になる

### Negative
- DB と API の状態が乖離する可能性がある（API 側でセッションが終了しても DB のステータスが古いまま）
- セッション作成が API 呼び出し + DB INSERT の2段階になり、部分的失敗のハンドリングが必要

### Risks
- ステータスキャッシュの鮮度: 初回表示は DB の値を使い、ユーザーが明示的にリフレッシュした場合のみ API から再取得する方式を採用。バックグラウンド同期は Phase 4 以降で検討
- 所有権検証の一貫性: `user_sessions` テーブルを使った所有権検証（`verifySessionOwnership`）を全 Server Action と API Route に適用する必要がある。Phase 2 コードレビューで SSE エンドポイント・`sendMessage`・`listSessionEvents` の IDOR が検出され修正済み
