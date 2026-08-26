# Codex provider 実行時に speculative な edge case を blocking finding へ昇格しすぎない guidance を注入する

## Meta

- **type**: new-feature
- **slug**: codex-scope-guidance
- **base-branch**: main
- **adr**: false

## 背景

PR #1078 の `cross-boundary-invariants` を `gpt-5.6-sol` で実行したところ、初回は実害のある cross-boundary defect を複数検出できた一方、再レビューを重ねるにつれて「理論上は構成できるが、通常利用での到達可能性・merge を止める価値が低い edge case」まで blocking finding として掘り続ける傾向が出た。

これは pipeline 全体や reviewer 定義そのものの問題として扱いたくない。同じ reviewer を Claude で動かした場合まで挙動を変える必要はなく、Codex provider 利用時のモデル特性に対する補正として扱う方が局所的である。

## 方針

Codex adapter から実行する際だけ、step 固有 prompt に薄い provider-level guidance を追加する。

例:

```text
SpecRunner execution guidance:

- Do not invent requirements beyond the supplied request/spec/reviewer criteria.
- Prioritize issues that materially affect correctness or normal supported execution.
- Do not promote merely theoretical, extremely unlikely, or speculative edge cases to blocking findings.
- A finding must explain the concrete user/runtime impact that justifies changing the implementation.
- If an issue is technically possible but does not justify blocking completion, report it as an observation or omit it.
- Do not broaden the scope in order to make the implementation more defensive or general.
```

## 要件

- Codex provider で実行される step にのみ適用すること
- pipeline transition / convergence budget / maxIterations は変更しないこと
- custom reviewer 定義 (`specrunner/reviewers/*.md`) は変更しないこと
- Claude provider の prompt / behavior は変更しないこと
- reviewer 以外の Codex step にも不自然な制約をかけないよう、文面は SpecRunner 共通の scope discipline に留めること
- provider-specific guidance は adapter 内の小さい定数/ヘルパ程度に留め、新しい provider config protocol や pipeline abstraction を作らないこと

## 期待する効果

Codex の cross-boundary 探索能力は維持しつつ、

```text
「具体的に壊れる」
```

と

```text
「理論上は壊れる実行列を構成できる」
```

を区別し、後者だけを理由に fixer loop を延々継続しにくくする。

## 受け入れ基準

- [ ] Codex adapter 経由で実行される step の prompt に guidance 文面が含まれることが unit test で固定されている
- [ ] Claude provider の prompt 組み立てに変更がない
- [ ] 新しい provider config protocol / pipeline abstraction が追加されていない
- [ ] pipeline transition / convergence budget / maxIterations / `specrunner/reviewers/*.md` に diff がない
- [ ] typecheck / test / architecture tests が green

## 非目標

- Codex の reasoning effort 調整
- reviewer ごとの再レビュー protocol 追加
- pipeline 全体の iteration / resume semantics 変更
- findings severity policy の全面改訂

## 関連

- #1061
- PR #1078
- PR #1077