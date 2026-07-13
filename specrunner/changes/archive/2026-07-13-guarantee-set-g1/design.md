# Design: 保証集合 G1 の明文化と版号付け

## Context

spec-runner の差別化の核心は、全 run が例外なく同一の保証群を通過することにある。これらの保証は現状 `README.md` と `docs/design-philosophy.md` に散在し、版号を持たない主張として存在する。

本変更は既存の enforcement 機構を変更せず、それらの機構が担保する保証を **G1** という版号付きの集合として `docs/guarantees.md` に一箇所で文書化する。G1 の各エントリはすべて現存する機構（ソースファイル・テスト・アーキテクチャ定義・seam）に裏打ちされる。機構が存在しない保証は G1 に載せない。

変更ファイルは docs のみ（`docs/guarantees.md` 新設、`docs/README.md` にリンク追加）。挙動・機構は一切変更しない。

**現存する enforcement 機構の確認済み所在**:

| 保証領域 | 機構 | 所在 |
|---|---|---|
| verdict 機械導出 | `deriveJudgeVerdict()` / `deriveConformanceVerdict()` 純関数 | `src/core/step/judge-verdict.ts` |
| verdict 機械導出 | typed `JUDGE_REPORT_TOOL`（agent は findings を申告、verdict は CLI が導出） | `src/core/step/report-tool.ts` |
| findings 実在検証 | `verifyFindingRefs()` seam | `src/core/port/runtime-strategy.ts` |
| gate skip 不能 | `loopNames` + 遷移テーブル（bypass path なし） | `src/core/pipeline/registry.ts` |
| 予算有界ループ | `resolveMaxIterations()` / `tryExhaust()` | `src/core/pipeline/pipeline.ts` |
| credential 封じ込め | B-6/B-7/B-10/B-12 構造不変条件 | `architecture/model.md` §4 + `tests/unit/architecture/core-invariants.test.ts` |
| credential 封じ込め seam | `stripSecrets` / `maskSensitive` / `spawn.ts` | `src/util/env-filter.ts`, `src/logger/stdout.ts`, `src/util/spawn.ts` |
| conformance gate | `ConformanceStep`（pr-create 前の必須 gate） | `src/core/step/conformance.ts`, `src/core/pipeline/registry.ts` |

## Goals / Non-Goals

**Goals**:
- `docs/guarantees.md` を新設し、保証集合 G1 を列挙する
- 各保証に enforce 機構の file 参照を付ける
- G1 に版号を付け、版を上げる運用規約と変更履歴節を設ける
- `docs/README.md` から `guarantees.md` へリンクする

**Non-Goals**:
- 保証を enforce する機構の追加・変更（本 request は既存機構の文書化のみ）
- 保証集合の自動生成（test からの抽出等）
- G1 の機械可読サマリ・出力先設計（A-2）
- `specrunner verify <PR>` コマンド（A-3）
- PR ごとの attestation 添付

## Decisions

### D1: `docs/guarantees.md` を独立した専用ページとする

**Rationale**: 版号管理（G1 → G2 → …）を行うには、保証集合が独自のライフサイクルを持つ必要がある。README の一節として置くと、README の他の編集と保証集合の版号更新が混ざり、版号の意味が薄れる。専用ページにすることで「このファイルの実質的な変更 = 版号更新」という規律が成立する。

**Alternatives considered**:
- README 内の一節: 却下（architect 評価済み）。版号付き独立管理の対象を README に埋め込むと版号の境界が曖昧になる。

### D2: 各保証を「保証の主張」と「enforce 機構 + file 参照」の対として記述する

**Rationale**: 保証は主張だけでは検証不能な散文になる。各保証が現存する機構に紐づくことで、機構が変更・移動された際に参照が壊れ、ドキュメントの腐敗を検知しやすくなる。対応機構が現存しないものは G1 に載せない。

**Alternatives considered**:
- 機構なし・主張のみの列挙: 却下。腐敗が検知不能な散文になる。

### D3: 版号を G1, G2, … とし、変更履歴節を同ページに置く

**Rationale**: 版号の粒度はシンプルにする。保証の追加・削除・意味変更（≠ typo 修正や file 参照の更新）が版号更新のトリガーとする運用規約を明記することで、版号の意味を固定する。変更履歴節はページ内に置き、版ごとの差分を人間が追跡できるようにする。

**Alternatives considered**:
- SemVer: 却下。docs の版号に major/minor/patch の区別は過剰。G1/G2 のフラット増分で十分。
- 版号なし・機構一覧のみ: 却下（architect 評価済み）。版号付けが本 request の主目的。

### D4: G1 の内容は手動列挙とする

**Rationale**: 現在 enforce されている保証のうち、明文化に値するものを人間が選別する。自動抽出（test コードからの生成等）は A-2 以降で検討する。本 request の重心は「何が G1 か」の確定であり、その作業は人間判断を要する。

**Alternatives considered**:
- test からの自動抽出: 却下（architect 評価済み）。スコープ外。

## Risks / Trade-offs

- [Risk] file 参照が実装変更によって腐敗する → Mitigation: 特定行番号ではなくファイルパス + 関数名/変数名レベルで参照し、リファクタ時に参照更新が自明になるよう記述する。
- [Risk] 版号更新の閾値が曖昧で typo 修正でも版号を上げてしまう → Mitigation: 運用規約で「追加・削除・意味変更が版号更新トリガー、typo / file 参照の更新は版号を上げない」と明記する。
- [Risk] typecheck / test が red になる → Mitigation: 本変更は `.md` のみを変更するため、既存テスト・型検査に影響しない。

## Open Questions

なし。本 request の設計判断は request.md の architect 評価済みセクションで確定済み。
