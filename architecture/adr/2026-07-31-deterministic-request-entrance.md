# ADR-20260731: 決定的な request 入口 — OneShotQueryClient port の廃止

## ステータス

accepted

## コンテキスト

`OneShotQueryClient` port（一発 query）は request 生成コマンド専用の seam であり、消費者は `cli` → `core/command/request-create` → `core/request/manager` → `core/request/generator` → adapter（claude-code）の一本鎖しかない。この port の存在により、request 系の CLI 入口だけが job 実行経路の外で LLM に到達し、そのために config overlay のロードと認証を入口に引き込んでいる。

一方、spec-runner の知識注入モデルでは、起票の文脈は CLI の外側（利用者のセッション）にあり、CLI の責務は規律・雛形という**静的な知識**をそこへ渡すことにある。入口で CLI 自身が LLM を呼ぶ構造は、このモデルと二重になっている。

## 決定

**D1 — `OneShotQueryClient` port を廃止する。** port surface は `AgentRunner` / `SessionClient` / `GitHubClient` / `ConfigStore` / `AnthropicClient` の 5 つとなり、claude-code adapter が実装する port は `AgentRunner` のみになる。

**D2 — LLM 到達境界を job 実行経路に閉じる。** LLM に到達しうる port（`AgentRunner` / `SessionClient` / `AnthropicClient`）へ依存してよいのは job 実行経路（pipeline の組み立て・実行・resume）のみ。request 系入口（`cli` の request コマンド群と `src/core/request/`）は決定的であり、LLM 系 port・その adapter への import edge を持たない。入口が提供する知識（雛形・起票規律）は CLI が静的アセットとして所有し、出力するのみとする。

**D3 — 不変条件 B-18（提案・ratify 待ち）。** 「`src/core/request/` および request 系 CLI コマンド経路は、LLM 系 port（`AgentRunner` / `SessionClient` / `AnthropicClient`）とその adapter を import しない」。歯（`tests/unit/architecture/` の import 検査）の実装と同時に `model.md` §4 へ昇格する。歯が入るまで §4 には置かない。

> コマンドの新設・廃止（何を出力するか）は振る舞いであり、spec（`specrunner/changes/`）側で定義する。本 ADR は層・port・依存方向のみを定める。

## 構造的含意

- **port surface の縮小**: `src/core/port/one-shot-query-client.ts` と adapter 実装（`src/adapter/claude-code/one-shot-query-client.ts`）、およびその一本鎖の core モジュール群が層から消える。
- **入口の依存の縮小**: request 系コマンドは config overlay・認証への依存を失い、決定的（オフライン実行可能）になる。LLM・認証の必要性は job 実行経路の開始点に揃う。
- **DSM への影響**: 新しい edge は増えない。削除のみ（cli → core/request → port(one-shot) → adapter の鎖）。
- **B-18 成立後**: 入口から LLM への edge の再導入は grep 検査で red になり、構造 ADR なしには戻せない。

## 検討した代替案

- **port を残し headless 生成用途に温存する** — 現在consumer が存在せず、起票知識の出口が二重（静的出力と port 経由生成）になる。知識の単一ソース化と矛盾するため棄却。
- **port を汎用 one-shot seam として維持する** — 将来用途の仮置きは port surface を太らせるだけで、必要になった時点で ADR とともに再導入すれば足りる。棄却。

## 結果

**Positive**: LLM 境界が「job 実行経路のみ」の例外なしになり、入口の全コマンドが決定的になる。install 直後（認証前）に起票フローが完結する。port・adapter・core 一本鎖ぶんの保守面が消える。

**Negative**: セッションを介さない headless の request 生成は不可能になる。必要になった場合は port の再設計と構造 ADR を要する。
