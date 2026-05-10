# Design: restore-design-md-instructions

## Context

PR #190 で openspec CLI 依存を除去した際、`openspec instructions design` が返していた design.md の構造指示が `src/prompts/propose-system.ts` の 4 行箇条書きに圧縮された。結果として:

- 6 セクション構成（Context / Goals・Non-Goals / Decisions / Risks・Trade-offs / Migration Plan / Open Questions）の指示が消失
- 「Alternatives considered」の記述ガイドラインが消失
- 「When to include design.md」の条件が消失

spec-review が design.md の Decisions セクションで代替案を検証していた実績があり、入力品質の劣化に直結する。

## Goals / Non-Goals

**Goals:**
- propose prompt の design.md ガイドラインに旧 openspec CLI 相当の構造指示を復元する

**Non-Goals:**
- design.md 以外の artifact ガイドライン変更
- テンプレート骨格の別ファイル分離

## Decisions

### D1: インラインで propose-system.ts に埋め込む

request.md が指定する置換テキストをそのまま `PROPOSE_SYSTEM_PROMPT` のテンプレートリテラル内に埋め込む。

**なぜ別ファイル分離でないか**: request.md のスコープ外で明示的に除外されている。現時点では prompt 定数内に直書きで十分。

## Risks / Trade-offs

- [Risk] prompt token 増加（約 200 tokens 増） → Mitigation: propose は 1 回きりの呼び出しで、この程度の増加は無視できる

## Open Questions

なし
