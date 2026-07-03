# Design: docs — Installation セクションに依存サイズの説明を追加

## Context

README.md の Installation セクション（現行 `README.md:45-63`）には `--omit=optional` を使った slim install 手順が既に存在するが、**なぜ slim 化したいのか（サイズ動機）** が書かれていない。

optionalDependencies として既定インストールされる SDK は 2 つ:

| SDK | 用途 |
|-----|------|
| `@anthropic-ai/claude-agent-sdk` | local runtime（Claude Agent SDK 経由の agent 実行） |
| `@openai/codex-sdk` | Codex runtime |

両 SDK は platform binary を同梱しているため、node_modules へのサイズ寄与が大きい。多くのユーザーはいずれか一方のランタイムしか使わないため、片方だけインストールすれば十分だが、現在の README はその選択肢の動機（節約できるサイズ）を伝えていない。

依存極小はこのプロダクトの最大の長所であり、その事実を導入時点で可視化することがこの変更の目的。

**変更対象**: `README.md` の Installation セクションのみ。ソースコード・設定ファイルには変更なし。

## Goals / Non-Goals

**Goals**:
- デフォルト install のサイズ規模（実測値）と、その内訳（どの SDK の binary が寄与するか）を Installation セクションに追記する
- 既存の slim install 手順（`--omit=optional`）に、サイズ削減という動機の説明を付加する

**Non-Goals**:
- `package.json` の依存構成変更（optional → devDependencies 等）
- グローバルインストール推奨への方針転換（本文への軽い言及は許容するが実装は 1.0 後）
- README 以外のドキュメント変更・再構成

## Decisions

### D1: 追記箇所は既存の「Provider SDKs … ship as optional dependencies」文の直後

現行テキスト（`README.md:55`）:

```
Provider SDKs (`@anthropic-ai/claude-agent-sdk` for local runtime, `@openai/codex-sdk` for Codex) ship as optional dependencies and install by default. To slim the install:
```

この一文を拡張し、"install by default" の直後にサイズ情報と動機を挿入する。コードブロック（`--omit=optional` 手順）は現行位置のまま残す。

**Rationale**: 既存構造を壊さず、最小限の変更で動機を追加できる。新しいセクションや見出しを作ると構造が過剰になる。

**Alternatives considered**:
- 別の箇所（Quick Start や Design Principles）に追記 → インストール時の判断材料はインストールセクションに集約すべきで分散が不適切
- テーブル形式でサイズ内訳を別ブロックに分離 → chore の規模としてオーバーエンジニアリング。文中の数値で十分

### D2: サイズ値は実測値のみ記載、推測値を断定しない

実装者が実際にインストールして `du` 等で計測した値を記載する。バージョン番号を付記し、測定タイミングを明示することで「古い情報」の誤解を防ぐ。

**Rationale**: request に「推測値を断定しない」と明示されており、実測値の記載が要件。

**Alternatives considered**:
- 「数百 MB」のような定性表現のみ → サイズの目安が伝わらない
- 常時最新値を自動更新する仕組み → スコープ外、過剰

### D3: slim install 手順の前に動機文を一行追加

`To slim the install:` → `To reduce install size by ~N MB, install with --omit=optional and add only the SDK you need:` のように動機を含む導入文に書き換える（N は実測値から算出）。

**Rationale**: 手順の直前に動機があると、なぜその手順を選ぶかが即座に伝わる。

**Alternatives considered**:
- 動機を別段落に分けてから手順コードブロックを続ける → ほぼ同等だが冗長になる可能性あり
- コメント行を手順 bash ブロック内に追加 → bash コメントは機械向け、動機説明は散文が適切

## Risks / Trade-offs

- **[Risk] サイズ値の陳腐化**: SDK バージョンアップ時に binary サイズが変わり、README の数値が古くなる。**Mitigation**: バージョン番号を明記して「いつ計測したか」を残す。将来のバージョンアップ PR で更新する慣習とする（注記を tasks.md に残す）。
- **[Risk] 計測方法のばらつき**: `node_modules` 全体と SDK 単独の差分、あるいは `du -sh` の計測対象によって数値が異なる。**Mitigation**: tasks.md に計測コマンドの指定を明記する。

## Open Questions

なし。要件・スコープ・実装方針に未解決事項はない。
