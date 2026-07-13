# Tasks: 保証集合 G1 の明文化と版号付け

## T-01: docs/guarantees.md を新設して G1 保証集合を記述する

- [ ] `docs/guarantees.md` を新規作成する
- [ ] ファイル冒頭に G1 の版号（`# Guarantee Set G1`）と制定日（2026-07-13）を明記する
- [ ] 以下の 6 保証を各々「保証の主張」＋「enforce 機構（file 参照付き）」の対として列挙する:

  **G1-1: verdict は findings からの機械導出（agent の自己申告に依らない）**
  - 保証の主張: review / conformance 系 step の verdict は agent が宣言するのでなく、agent が申告した findings（severity / resolution 属性付き）から CLI の純関数が機械的に導出する
  - enforce 機構:
    - `src/core/step/judge-verdict.ts` の `deriveJudgeVerdict()` / `deriveConformanceVerdict()`（副作用なし純関数; B-5 構造不変条件の適用対象）
    - `src/core/step/report-tool.ts` の `JUDGE_REPORT_TOOL` — typed schema が agent に findings の申告を強制し、verdict フィールドを持たない
  - 裏付け ADR: `architecture/adr/2026-06-10-findings-verification-seam.md` D2

  **G1-2: findings の file:line 実在は runtime で検証される**
  - 保証の主張: verdict に影響する finding（critical / high / decision-needed）が参照する file path と line 番号は、verdict 確定前に runtime が実在を確認する
  - enforce 機構:
    - `src/core/port/runtime-strategy.ts` の `verifyFindingRefs()` seam — local runtime: filesystem 検証、managed runtime: GitHub raw fetch 検証
  - 裏付け ADR: `architecture/adr/2026-06-10-findings-verification-seam.md` D1

  **G1-3: review / conformance gate は skip 不能**
  - 保証の主張: すべての pipeline profile（standard / fast）において、verification・code-review・conformance の各 gate は遷移テーブルに bypass path を持たず、approved を返さない限り次ステップへ進まない
  - enforce 機構:
    - `src/core/pipeline/registry.ts` の `STANDARD_DESCRIPTOR.loopNames` と `FAST_DESCRIPTOR.loopNames` — 両 profile に `VERIFICATION`, `CODE_REVIEW`, `CONFORMANCE` が含まれる
    - 遷移テーブル `STANDARD_TRANSITIONS` / `FAST_TRANSITIONS`（同ファイル） — これらの gate を迂回する遷移エントリが存在しない

  **G1-4: 収束ループは予算有界（無限ループしない）**
  - 保証の主張: review / fixer の収束ループは反復回数の上限（maxIterations）を持ち、上限到達時は escalation へ遷移してパイプラインを終了する
  - enforce 機構:
    - `src/core/pipeline/pipeline.ts` の `resolveMaxIterations()` — step ごとの反復上限を解決する
    - `src/core/pipeline/pipeline.ts` の `tryExhaust()` — 反復カウンタが上限に達したことを検出し escalation へ転送する

  **G1-5: credential / secret は seam 経由で封じ込められる**
  - 保証の主張: GitHub token・API key などの credential は subprocess や外部 SDK に raw で渡らず、また stdout / stderr にそのまま出力されない。seam が唯一の通過点となり、credential の漏洩面を構造的に集約する
  - enforce 機構（構造不変条件、`architecture/model.md` §4）:
    - B-6: subprocess / SDK query に渡す env は `src/util/env-filter.ts` の `stripSecrets` 経由が必須
    - B-7: stdout / stderr への出力は `src/logger/stdout.ts` の `maskSensitive` 経由が必須
    - B-10: GitHub token は紐づく host にしか送らない（host-token 束縛）
    - B-12: `node:child_process` の直接 import は seam モジュール（`src/util/spawn.ts`, `src/util/git-exec.ts`）と arch-allowlist に限定
  - 自動 enforce: `tests/unit/architecture/core-invariants.test.ts` が B-6/B-7/B-10/B-12 を grep・import 検査で検証する

  **G1-6: conformance gate が受け入れ基準の照合通過を必須とする**
  - 保証の主張: PR 作成の前に conformance gate が必ず実行され、request.md の受け入れ基準と実装の照合を行う。conformance が approved を返さない限り pr-create へ進まない
  - enforce 機構:
    - `src/core/step/conformance.ts` の `ConformanceStep` — request.md・tasks.md・design.md・spec.md を読み実装との照合を行う gate step
    - `src/core/pipeline/registry.ts` の `STANDARD_DESCRIPTOR` および `FAST_DESCRIPTOR` — 両 profile で `ConformanceStep` が `PR_CREATE` の直前に配置される

- [ ] ページ内に「版号更新の運用規約」節を設け、以下を明記する:
  - 版号を上げるトリガー: 保証の追加・削除・意味変更
  - 版号を上げないもの: typo 修正、file 参照の更新（enforce 機構の所在変更への追随）
  - 版号の命名規則: G1, G2, G3, …（フラット増分）
- [ ] ページ内に「変更履歴」節を設け、G1 の初版エントリ（制定日・含む保証集合の要約）を記録する

**Acceptance Criteria**:
- `docs/guarantees.md` が存在する
- ファイルに G1 の版号が明記されている
- G1-1 から G1-6 の 6 保証が記述され、各々に enforce 機構への file 参照が含まれている
- 版号更新の運用規約節が存在し、版号を上げるトリガー（追加・削除・意味変更）が明記されている
- 変更履歴節が存在し、G1 初版エントリが含まれている

## T-02: docs/README.md に guarantees.md へのリンクを追加する

- [ ] `docs/README.md` を編集し、既存のドキュメント配置表または原則節に `guarantees.md` へのリンクを追加する
- [ ] リンクは `docs/` 配下のドキュメントとして自然な位置に収める

**Acceptance Criteria**:
- `docs/README.md` に `guarantees.md` へのリンクが存在する
- リンクが既存のドキュメント構造と整合している（表の行または原則節への追記として自然な形）
