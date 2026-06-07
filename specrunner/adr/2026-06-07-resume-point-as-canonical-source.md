# resume 再開位置の決定を記録時に集約し読み取り時推理を撤去する

**Date**: 2026-06-07
**Status**: accepted
**Related**: `specrunner/adr/2026-06-06-event-journal-slug-dir-state-model.md`（event journal 整備の上位決定）

## Context

`resolveResumeStep`（`src/core/resume/resolve-step.ts`）は再開 step を決めるために、記録された `resumePoint` に加えて job state の過去履歴を読んで推理していた。解決優先順位は次の 3 層構造：

1. `--from` 指定: step 名直指定（Tier 1a）／ legacy alias（critic/fixer/creator）→ phase 推定 → step mapping（Tier 1b）
2. `--from` 未指定 + `resumePoint` あり:
   - Tier 2a: `resumePoint.step` が fixer かつ `state.steps[fixer]` が空 + 対の loop step の最終 verdict が needs-fix/failed → loop step に戻す（fixer-empty detection）
   - Tier 2b: `resumePoint.step` が reviewer かつ `iterationsExhausted > 0` → 対の fixer に飛ばす（review 枯渇補正）
3. `--from` 未指定 + `resumePoint` null: fallback phase の critic step を推測（Tier 3）

この推理ロジックは `resumePoint` の記録が不十分だった時代の補完策として実装されたが、event journal 整備（#532）後は pipeline が `resumePoint` を明示的に 3 箇所（crash safety net / escalation / `handleExhausted`）で記録するようになり、推理の必要がなくなった。

唯一の不整合として、`handleExhausted` が枯渇した reviewer（例: `code-review`）を `resumePoint.step` に記録していた。枯渔した reviewer を再実行すると同じ verdict を再生産して再枯渇するため、Tier 2b がこれを読み取り時に補正していた。

## Decision

### D1: `resolveResumeStep` は記録された `resumePoint.step` を verbatim で返す

`--from` 未指定で `resumePoint` が存在する場合、`resumePoint.step` をそのまま返す。Tier 2a（fixer-empty detection）・Tier 2b（review 枯渇 → fixer 推理）・Tier 3（null fallback → critic 推測）を撤去する。

**Rationale**: pipeline が「再開すべき step」を記録時に決定するようになった以上、読み取り側で過去履歴を再解釈するのは二重判断であり、記録と推理が食い違う原因になる。判断点を記録時に集約することで、コードと agent のどちらが実行しても結果が一致する。

### D2: `--from` の legacy alias（critic / fixer / creator）を撤去する

`--from` は step 名の直指定のみを受け付ける。alias（critic/fixer/creator）と、その解決に必要な descriptor 由来ヘルパー（phase 推定・role→step mapping）を撤去する。

**Rationale**: alias 自体が「alias → phase → step」の推理層であり「素直に step 名から再開する」方針と矛盾する。step 名直指定で完全に代替可能（`--from fixer` → `--from code-fixer` 等）であり、phase 推定が不要で曖昧さがない。行数 50% 削減基準の達成にも必須。

**Migration**:
- `--from critic` → `--from spec-review`（spec phase）または `--from code-review`（impl phase）
- `--from fixer` → `--from spec-fixer` または `--from code-fixer`
- `--from creator` → `--from design` または `--from implementer`

### D3: `resolveResumeStep` のシグネチャを `(from, resumePoint)` に縮約する

`descriptor` / `fallbackStep` / `steps` の各パラメータを撤去する。

**Rationale**: D1/D2 により、phase 推定（descriptor）・null fallback（fallbackStep）・fixer-empty detection（steps）の入力がすべて不要になる。`--from` の step 名検証はグローバル集合（`AGENT_STEP_NAMES` + `CLI_STEP_NAMES`）で足り、特定 pipeline の descriptor を要しない。

### D4: `handleExhausted` は `resumePoint.step` に対の fixer step を記録する

`handleExhausted` が `resumePoint.step` に書く値を、枯渇した loop step（reviewer）から `loopFixerPairs[exhaustedLoopName] ?? exhaustedLoopName`（対の fixer、存在しなければ自身）へ変更する。error code と最終 verdict 上書きの基準は従来通り reviewer を基準に保持する。

**Rationale**: 枯渇した reviewer を再実行しても同じ verdict を再生産して再枯渇する。生産的な再開入口は対の fixer であり、これを記録時に確定させることで Tier 2b の読み取り時補正を不要にする。対の fixer を持たない loop（conformance 等）は自身を記録し挙動を据え置く。

### D5: null `resumePoint` + `--from` 未指定はエラー（推測しない）

`resolveResumeStep` は null `resumePoint` に対して防御的に Error を投げる。利用者向けメッセージ「再開位置が不明です。`--from` で再開 step を指定してください」と exit code は `ResumeCommand.prepare()` のガードで出す。

**Rationale**: CLI 文言と終了コードは command 層の責務。純関数 `resolveResumeStep` は不変条件のみを持ち、正常系では command 層ガードにより null には到達しない。

## Alternatives Considered

### Alternative 1: D1 — 推理ロジックを残したまま記録を増強する

- **Pros**: 既存ロジックを壊さず記録の質だけを高められる
- **Cons**: 二重判断が残る。`state.steps` 依存（optional パラメータ）も残り、50% 削減基準を満たせない
- **Why not**: 却下

### Alternative 2: D1 — `resolveResumeStep` 内で transition table を引いて遷移先を再計算する

- **Pros**: 記録変更なしで再開先を正確に決定できる
- **Cons**: 記録時に確定できる情報を読み取り時に再計算するもので、推理撤去の趣旨に反する。二重判断が残る
- **Why not**: 却下

### Alternative 3: D2 — alias を維持して後方互換を保つ

- **Pros**: `--from critic/fixer/creator` に依存する既存スクリプトが壊れない
- **Cons**: 推理層と descriptor 由来ヘルパーが残り、削減基準を満たせない。alias → phase → step の間接解決が残り「素直に step 名から返す」方針と矛盾する
- **Why not**: 要件が設計判断に委ねており、削減基準と「素直に step 名から返す」方針の双方が撤去を支持する。却下

### Alternative 4: D3 — `descriptor` を残して pipeline 固有の step 検証を行う

- **Pros**: 特定 pipeline に存在しない step 名をエラーにできる
- **Cons**: 現行 Tier 1a もグローバル集合（`AGENT_STEP_NAMES` + `CLI_STEP_NAMES`）で検証しており、追加の安全性は得られない
- **Why not**: 不要なため却下

### Alternative 5: D4 — transition table で「枯渇 step の needs-fix 遷移先」を一般化記録する

- **Pros**: conformance → implementer を含めてすべての枯渇シナリオの遷移先を記録時に確定できる
- **Cons**: `handleExhausted` に遷移解決を持ち込み、枯渇判定ロジック変更（`exhaustion-consolidation`）のスコープに接近する
- **Why not**: 要件が `loopFixerPairs` ベースの reviewer/fixer ペアを明示しており、conformance は据え置く。却下

### Alternative 6: D5 — 利用者向けメッセージを `resolveResumeStep` に移す

- **Pros**: エラー文言と原因判断が同じ関数に集まる
- **Cons**: 純関数に CLI 文言と出力責務を持ち込む。既存テスト（command 層でメッセージを検証）を壊す
- **Why not**: 却下

## Consequences

### Positive

- `resolve-step.ts` が 237 行→38 行（84% 削減）となり、再開位置解決の責務が明確になる
- 判断点が記録時（`handleExhausted`・crash safety net・escalation）に集約され、読み取り側の副作用（`state.steps` 参照）が消える
- `resolveResumeStep` のシグネチャが `(from, resumePoint)` に縮小し、呼び出し側（`resume.ts`）から `getPipelineDescriptor` / `state.steps` / `fallbackStep` の受け渡しが消える

### Negative / Known Debt

- legacy state（旧 exhaustion ロジックで記録された `resumePoint.step` が reviewer を指す）を resume すると reviewer から再開し再枯渇しうる。`--from <fixer-step>` で明示再開可能（一過性）
- `--from critic/fixer/creator` に依存するスクリプトが失敗する。Migration Plan の step 名対応表（D2 参照）で対処する
- #236（fixer-empty）シナリオの再開先が変わる: 旧 Tier 2a は「reviewer needs-fix → fixer 遷移直後に kill」で reviewer に戻していたが、本変更では記録された fixer から再開する。最新の review-feedback を消化して reviewer へ進む生産的な入口であり退行ではない

## References

- Request: `specrunner/changes/resume-simplify/request.md`
- Design: `specrunner/changes/resume-simplify/design.md`
- Related: `specrunner/adr/2026-06-06-event-journal-slug-dir-state-model.md`
