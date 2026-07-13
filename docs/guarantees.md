# Guarantee Set G1

**版号**: G1  
**制定日**: 2026-07-13

すべての run が例外なく通過する保証群をここに列挙する。各保証は「何を保証するか」と「それを enforce する機構」を対にして記す。対応する機構が現存しない主張はこの集合に含めない。

---

## 保証一覧

### G1-1: verdict は findings からの機械導出（agent の自己申告に依らない）

**保証の主張**  
review / conformance 系 step の verdict は agent が宣言するのでなく、agent が申告した findings（severity / resolution 属性付き）から CLI の純関数が機械的に導出する。agent は verdict フィールドを持たないスキーマへの申告のみ行う。

**enforce 機構**

- `src/core/step/judge-verdict.ts` — `deriveJudgeVerdict()` / `deriveConformanceVerdict()`: 副作用なし純関数。findings の severity・resolution をもとに verdict を一意に決定する（B-5 構造不変条件の適用対象）
- `src/core/step/report-tool.ts` — `JUDGE_REPORT_TOOL`: agent に findings の申告を強制する typed schema。verdict フィールドを持たないため、agent が verdict を直接宣言する経路がない

**裏付け ADR**: `architecture/adr/2026-06-10-findings-verification-seam.md` D2

---

### G1-2: findings の file:line 実在は runtime で検証される

**保証の主張**  
verdict に影響する finding（critical / high / decision-needed）が参照する file path と line 番号は、verdict 導出後に runtime が実在を検証し、参照が実在しなければ verdict を escalation へ上書きする。存在しない参照に基づく verdict は成立しない。

**enforce 機構**

- `src/core/step/executor.ts` — judge / request-review step で verdict 導出後に `collectVerdictAffectingFindings`（critical / high / decision-needed を抽出）が集めた finding の参照を検証し、不在があれば verdict を escalation へ上書きする
- `src/core/port/runtime-strategy.ts` — `verifyFindingRefs()` seam: local runtime では filesystem 上の実在を検証し、managed runtime では GitHub raw fetch で検証する。runtime の実装がここに集約されるため、検証を省略する経路がない

**裏付け ADR**: `architecture/adr/2026-06-10-findings-verification-seam.md` D1

---

### G1-3: review / conformance gate は skip 不能

**保証の主張**  
すべての pipeline profile（standard / fast）において、verification・code-review・conformance の各 gate は遷移テーブルに bypass path を持たず、approved を返さない限り次ステップへ進まない。

**enforce 機構**

- `src/core/pipeline/registry.ts` — `STANDARD_DESCRIPTOR.loopNames` と `FAST_DESCRIPTOR.loopNames`: 両 profile に `VERIFICATION`・`CODE_REVIEW`・`CONFORMANCE` が含まれる
- `src/core/pipeline/registry.ts` — `STANDARD_TRANSITIONS` / `FAST_TRANSITIONS`: これらの gate を迂回する遷移エントリが存在しない。遷移テーブルはデータとして宣言されており、bypass を追加するには table を明示的に変更する必要がある

---

### G1-4: 収束ループは予算有界（無限ループしない）

**保証の主張**  
review / fixer の収束ループは反復回数の上限（maxIterations）を持ち、上限到達時は escalation へ遷移してパイプラインを終了する。上限なしに動き続けることはない。

**enforce 機構**

- `src/core/pipeline/pipeline.ts` — `resolveMaxIterations()`: step ごとの反復上限を設定・解決する
- `src/core/pipeline/pipeline.ts` — `tryExhaust()`: 反復カウンタが上限に達したことを検出し、escalation へ転送する

---

### G1-5: credential / secret は seam 経由で封じ込められる

**保証の主張**  
GitHub token・API key などの credential は subprocess や外部 SDK に raw で渡らず、stdout / stderr にそのまま出力されない。seam が唯一の通過点となり、credential の漏洩面を構造的に集約する。

**enforce 機構**（構造不変条件、`architecture/model.md` §4）

- B-6: subprocess / SDK query に渡す env は `src/util/env-filter.ts` の `stripSecrets` 経由が必須
- B-7: stdout / stderr への出力は `src/logger/stdout.ts` の `maskSensitive` 経由が必須
- B-10: GitHub token は紐づく host にしか送らない（host-token 束縛）
- B-12: `node:child_process` の直接 import は seam モジュール（`src/util/spawn.ts`, `src/util/git-exec.ts`）と arch-allowlist に限定

**自動 enforce**: `tests/unit/architecture/core-invariants.test.ts` が B-6/B-7/B-10/B-12 を grep・import 検査で継続的に検証する

---

### G1-6: conformance gate が受け入れ基準の照合通過を必須とする

**保証の主張**  
PR 作成の前に conformance gate が必ず実行され、request.md の受け入れ基準と実装の照合を行う。conformance が approved を返さない限り pr-create へ進まない。

**enforce 機構**

- `src/core/step/conformance.ts` — `ConformanceStep`: request.md・tasks.md・design.md・spec.md を読み実装との照合を行う gate step
- `src/core/pipeline/registry.ts` — `STANDARD_DESCRIPTOR` および `FAST_DESCRIPTOR`: 両 profile で `ConformanceStep` は `PR_CREATE` より前に配置され、approved を返さない限り pr-create に到達しない（standard では conformance と pr-create の間に adr-gen 生成 step が入るが、これは受け入れ基準を判定する gate ではない）

---

## 版号更新の運用規約

版号（G1, G2, G3, …）はフラット増分で管理する。

**版号を上げるトリガー（G1 → G2 → …）**

- 保証の**追加**: G1 の集合に新たな保証項目を加える
- 保証の**削除**: G1 の集合から既存の保証項目を取り除く
- 保証の**意味変更**: 保証の主張または enforce 機構の本質的な変更（「何を保証するか」が変わる場合）

**版号を上げないもの**

- typo 修正、表現の明確化（保証の意味が変わらない散文の改善）
- file 参照の更新（リファクタリング等で enforce 機構の所在が変わったが、機構の本質は変わらない場合）

**変更手順**: 版号を上げる場合は、この節の上の保証一覧と下の変更履歴節を同時に更新する。

---

## 変更履歴

| 版号 | 日付 | 内容 |
|------|------|------|
| G1 | 2026-07-13 | 初版。6 保証（G1-1〜G1-6）を制定: verdict の機械導出、findings の実在検証、gate skip 不能、収束ループの予算有界、credential seam 封じ込め、conformance による受け入れ基準照合 |
