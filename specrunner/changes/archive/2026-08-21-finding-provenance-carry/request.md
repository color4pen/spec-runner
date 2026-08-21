# regression-gate の finding 再報告に由来を保持し --wontfix の逆引きを識別子照合にする

## Meta

- **type**: spec-change
- **slug**: finding-provenance-carry
- **base-branch**: main
- **adr**: true

## 背景

`job resume --wontfix <index>` は、最新 regression-gate findings の fingerprint（file|line|title）で「発生元 step の finding」を逆引きし、disposition record に発生元 step 名 + findingKey を記録する。しかし regression-gate は LLM reviewer であり、ledger の finding を再報告する際に title を言い換える（実測: 「〜の範囲が曖昧 — …」→「〜の範囲が**依然として**曖昧」）。title は fingerprint の構成要素のため照合が外れ、all-or-nothing 検証により resume 全体が exit 2 で拒否される。

さらに、regression-gate の ledger は spec-review findings と implementation reviewer chain findings を合流しているのに、逆引き索引は impl reviewer chain しか見ない。したがって spec-review 由来の finding は title が完全一致しても発生元に到達できない（title 保存だけでは直らない確定バグ）。

再生成された文章から identity を復元する構造が根本的に脆い。由来（発生元 step + 元 finding の識別子）を最初から保持して運ぶ形に変える。（台帳: issue #1037）

## 現状コードの前提

- `src/core/decision/wontfix.ts:85-117` — `resolveWontfixDispositions` は `deriveImplReviewerChain(state)` の StepRun findings から fingerprint → Map<stepName, Finding> の索引を作り、gate finding の fingerprint（file|line|title）で逆引きする。見つからないと all-or-nothing で失敗し resume は exit 2
- `src/core/pipeline/findings-ledger.ts:124-218` — regression-gate の ledger は `collectSpecReviewLedger`（spec-review 全 StepRun の fixable findings）と `collectFindingsLedger`（impl reviewer chain）を `dedupeFindings` で合流する。つまり ledger には spec-review 由来 finding が含まれるが、wontfix の逆引き索引には含まれない
- regression-gate は LLM step であり、ledger finding を自分の typed findings として再報告する。元 finding の title / rationale を verbatim に保持する契約は存在しない
- 実測エラー: `--wontfix: index 1 finding fingerprint '<file>|<line>|<title>' not found in any reviewer chain step`
- `DecisionRecord` union（`src/state/schema/types.ts`）は `OptionDecisionRecord | DispositionDecisionRecord`。persisted フィールド名 `decisions` の形式維持が後方互換要件（#1022 の実装で確立）
- disposition 済み finding の機械尊重（ledger 除外・fixer 入力除外・approved+fixable ガード）は step 名 + findingKey のフィルタで機能している

## 要件

1. **由来の保持**: ledger finding に発生元（sourceStep + 元 finding の識別子）を機械的に付与し、regression-gate の再報告を経ても由来が失われない形で運ぶ。
2. **LLM 非依存の解決**: `--wontfix <index>` → 発生元 finding の解決が、LLM が再生成した文字列（title / rationale）に依存しないこと。機械側で保持された対応で解決する（gate の prompt echo に依存する場合は typed schema + 機械検証で強制する — 機構の選択は design で決定し根拠を明記）。
3. **全発生元対応**: 逆引き対象は ledger に寄与する全 step（spec-review を含む）。spec-review 由来 finding の wontfix が成立し、disposition が spec-review 発生元として記録される。
4. **後方互換**: `decisions` の persisted 形式は不変（フィールド追加は可）。既存 OptionDecisionRecord / DispositionDecisionRecord の読み込みに影響しない。不正 index・由来不明 finding への all-or-nothing exit 2 は維持する。

## スコープ外

- `computeFindingKey` / ledger fingerprint の識別式そのものの再設計（由来を運ぶことで文字列照合への依存を消すのが本筋）
- verdict 側の disposition 尊重（step-completion のフィルタ群）の変更 — 既存のまま
- regression-gate の FIXED / STILL PRESENT 判定ロジックの変更

## 受け入れ基準

- [ ] gate が title を言い換えて再報告した finding への `--wontfix` が成功し、DispositionDecisionRecord に正しい発生元 step が記録されることをテストで固定する（実測形の再現）
- [ ] spec-review 由来 finding への `--wontfix` が成功することをテストで固定する
- [ ] 存在しない index / 由来を解決できない finding への `--wontfix` が引き続き all-or-nothing で exit 2 になることをテストで固定する
- [ ] wontfix 済み finding の機械尊重（ledger 除外 / fixer 入力除外 / approved+fixable ガード）が新しい解決方式でも機能することをテストで固定する
- [ ] 既存テストのうち `tests/unit/core/decision/wontfix.test.ts` の「title 文字列照合」を pin するケースに限り新契約への更新を許容する。それ以外の既存テストは無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **再生成文章からの identity 復元を捨てる**: title 照合は LLM の言い換え 1 つで壊れる。由来を最初から運び、照合を識別子で行う。
- **sibling と統合しない**: artifact provenance（bite-evidence tamper、issue #1036）は思想上の兄弟だが、修正する正本も壊れ方も異なるため別 request とする。共有するのは「出自を最初から運ぶ」原則のみ。
- **schema 変更は加算のみ**: gate の typed finding / ledger への由来フィールド追加は additive とし、既存の finding 消費者（report tool / 表示 / 台帳）を壊さない。
