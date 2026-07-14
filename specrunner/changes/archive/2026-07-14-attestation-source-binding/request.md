# fact-check attestation を source revision にも束縛し、request.md 不変でも source 変化で stale にする

## Meta

- **type**: spec-change
- **slug**: attestation-source-binding
- **base-branch**: main
- **pipeline**: standard
- **adr**: false

<!-- adr: 既存 attestation の staleness 判定を refine する範囲であり、新しい port/pattern の導入ではないため false。source 信号の選択は design.md に記す。 -->

## 背景

request-review → design の fact-check attestation は、attestation が valid のとき design が code 断定の再検証を省略できる仕組み。現状 attestation は **request.md の content hash のみ**に束縛されている。request.md が不変のまま source が変更された場合（手動編集、または commit 後の resume）、attestation は valid のままで、design が古い code 検証結果を再利用する——もはや一致しない source に対して「検証済み」と誤認する。

staleness 判定を source 信号にも束縛し、request-review 以降に source が変化していれば attestation を stale にする。これは attestation を **より保守的**にするだけ（再検証が増える方向）で、決して緩める方向には働かない——正しさに対して fail-safe。

## 現状コードの前提

- attestation は `requestHash` + `codeAssertionsVerified` + `verifiedAssertions` を持つ（`src/core/factcheck-attestation.ts:19-20`, `:91-92`）。
- `evaluateFactCheckAttestation` の stale 判定は `!codeAssertionsVerified || requestHash !== hashRequestContent(current)` のみ（`src/core/factcheck-attestation.ts:124`）。source 束縛は無い。
- 通常の連続実行では request-review と design の間に source commit が無いため、その窓では HEAD は安定する。穴は手動編集 / commit 後の resume。
- attestation の CLI 側評価は決定論的（AI ターン不要）。design は enrichContext で attestation を読む既存経路を持つ。

## 要件

1. attestation に source revision 信号を記録する（request-review 実行時点の git HEAD sha）。
2. `evaluateFactCheckAttestation` の stale 判定に source 信号の不一致を加える。current source revision が attestation の記録と異なれば stale とする。current revision の取得は CLI 側の決定論的読み取りで行う（AI ターン不要、既存の attestation 評価と同経路）。
3. fail-safe: source 信号が欠落・取得不能な場合は stale（verify-all）扱いにする。既存の「requestHash 不一致 / codeAssertionsVerified false → stale」挙動は保存する。

## スコープ外

- attestation が検証する assertion の内容・粒度の変更。
- request-review が attestation を生成する条件・タイミングの変更（source 信号の記録追加を除く）。

## 受け入れ基準

- [ ] attestation の source revision が current と一致し、かつ requestHash 一致・codeAssertionsVerified true のとき valid になることをテストで固定する。
- [ ] requestHash は一致するが source revision が異なるとき stale になることをテストで固定する（本 request の核心）。
- [ ] source 信号を持たない旧 attestation は stale（verify-all）になることをテストで固定する（fail-safe・後方互換）。
- [ ] 既存の requestHash 不一致 / codeAssertionsVerified false → stale の挙動が保存されることをテストで固定する。
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: source 信号は git HEAD sha を primary とする（決定論・安価）。stale 方向に倒す fail-safe（欠落 / 不明 → stale → verify-all）。
- **採用**: source 信号を持たない旧 attestation は stale 扱いで後方互換。design は verify-all にフォールバックするだけで壊れない。
- **却下**: source 束縛なしのまま request.md hash だけで運用継続する案。resume / 手動編集経路で stale を検出できず、design が不整合な source に対し検証済みと誤認する。
- **architect 判断事項**: 未 commit の working-tree 編集（HEAD 不変・tree 変化）まで捕捉するか（tree hash / dirty marker の追加）を費用対効果で判断する。捕捉しない場合、その残余を design.md に明記する。
