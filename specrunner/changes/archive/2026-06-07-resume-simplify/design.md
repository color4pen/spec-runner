# Design: resume の再開位置解決を resumePoint の記録から素直に決定する

## Context

`resolveResumeStep`（`src/core/resume/resolve-step.ts`, 全 237 行）は再開 step を決めるために、記録された `resumePoint` に加えて state の過去履歴を読んで推理している。現状の解決優先順位は次の通り:

1. `--from` 指定: step 名直指定（Tier 1a）／ legacy alias（critic/fixer/creator）→ phase 推定 → step mapping（Tier 1b）。
2. `--from` 未指定 + `resumePoint` あり:
   - Tier 2a: `resumePoint.step` が fixer かつ `state.steps[fixer]` が空 + 対の loop step の最終 verdict が needs-fix/failed → loop step に戻す（fixer-empty detection, #236）。
   - Tier 2b: `resumePoint.step` が reviewer かつ `iterationsExhausted > 0` → 対の fixer に飛ばす（review 枯渇）。
   - Tier 2c: それ以外 → `resumePoint.step`。
3. `--from` 未指定 + `resumePoint` null: fallback phase の critic step を推測（Tier 3）。

この推理ロジックは、`resumePoint` の記録が不十分だった時代の補完策である。event journal 整備後の現在、pipeline は `resumePoint` を明示的に記録する（`src/core/pipeline/pipeline.ts`）:

- crash safety net（unhandled error）: `resumePoint.step = current.step`
- escalation: `resumePoint.step = currentStep`
- `handleExhausted`（loop 枯渇）: `resumePoint.step = exhaustedLoopName`（= 枯渇した reviewer/gate step）

加えて signal handler（`src/core/runtime/local.ts`）と timeout（`src/core/step/executor.ts`）も in-flight step を記録する。`state.step` は executor が step 実行開始時に当該 step 名へ更新するため、記録される step は「kill 時に実行中だった step」を正確に指す。

唯一の不整合は `handleExhausted` で、枯渇した reviewer（例: `code-review`）を記録している。枯渇した reviewer をそのまま再実行すると同じ verdict を再生産して再枯渇するため、resume の生産的な入口は対の fixer（例: `code-fixer`）である。Tier 2b はこの不整合を「読み取り時の推理」で補正していた。

### 制約

- `resumePoint` のスキーマ（`iterationsExhausted` / `exhaustionPhase`）は変更しない。フィールドは残すが、再開 step の決定には使わない。
- pipeline のループ・枯渇判定ロジック（どこで枯渇とみなすか）は変更しない。変えるのは `handleExhausted` が `resumePoint.step` に書く値のみ。
- 現行の利用者向けエラーメッセージ「再開位置が不明です。`--from` で再開 step を指定してください」を維持する。

## Goals / Non-Goals

**Goals**:

- `resolveResumeStep` を「記録された `resumePoint.step` を素直に返す」だけの関数へ簡素化し、re-inference（Tier 2a / 2b / 3）を撤去する。
- 枯渇後の resume が対の fixer step から再開されるよう、`handleExhausted` の記録を修正する。
- `resumePoint` が null かつ `--from` 未指定のとき、推測せずエラーにする。
- `--from <step-name>` による任意 step からの明示再開を維持する。
- `resolveResumeStep` のコード量を現行比 50% 以上削減する。

**Non-Goals**:

- `--no-worktree` モードの追加（別 request `no-worktree-mode`）。
- pipeline のループ・枯渇判定ロジックの変更（`exhaustion-consolidation`）。
- `resumePoint` のスキーマ変更（`iterationsExhausted` / `exhaustionPhase` は残す）。
- crash / escalation / signal / timeout の記録ロジックの変更（これらは既に in-flight step を正しく記録している）。

## Decisions

### D1: `resolveResumeStep` は記録された `resumePoint.step` を verbatim で返す

`--from` 未指定で `resumePoint` が存在する場合、`resumePoint.step` をそのまま返す。Tier 2a（fixer-empty detection）・Tier 2b（review 枯渇 → fixer 推理）・Tier 3（null fallback → critic 推測）を撤去する。

- **Rationale**: pipeline が 3 箇所で「再開すべき step」を意図的に記録するようになった以上、読み取り側で過去履歴を再解釈するのは二重判断であり、記録と推理が食い違う原因になる。判断点を 1 箇所（記録時）に集約することで、agent/コードのどちらが解決しても結果が一致する。
- **Alternatives considered**:
  - 推理ロジックを残したまま記録を増強する: 二重判断が残り、`state.steps` 依存（optional パラメータ）も残るため簡素化目標と 50% 削減基準を満たさない。却下。
  - resolveResumeStep 内で transition table を引いて「needs-fix の遷移先」を計算する: 記録時に確定できる情報を読み取り時に再計算するもので、推理撤去の趣旨に反する。却下。

### D2: `--from` の legacy alias（critic / fixer / creator）を撤去する

`--from` は step 名の直指定のみを受け付ける。alias（critic/fixer/creator）と、その解決に必要な descriptor 由来ヘルパー（phase 推定・role→step mapping）を撤去する。

- **Rationale**:
  - alias 自体が「alias → phase → step」の推理層であり、本変更の「素直に step 名から再開する」という主旨と矛盾する。
  - alias は step 名直指定で完全に代替できる（`--from fixer` → `--from code-fixer`、`--from critic` → `--from code-review`、`--from creator` → `--from implementer`）。step 名直指定は phase 推定が不要で曖昧さがない。
  - 受け入れ基準「行数 50% 以上削減（現行 237 行）」は、alias 解決に必要な `buildStepMapping` / `reviewerOf` / `creatorOf` / `isSpecPhase` 等（約 100 行）を残すと達成できない。alias 撤去は削減基準を満たすための必須条件でもある。
- **Alternatives considered**:
  - alias を維持: 後方互換は得られるが、推理層と descriptor 由来ヘルパーが残り、削減基準を満たせない。要件 4 が設計判断に委ねており、削減基準と主旨の双方が撤去を支持するため却下。
- **影響**: 利用者向け CLI の挙動変更。Migration Plan に移行手順を記す。

### D3: `resolveResumeStep` のシグネチャを `(from, resumePoint)` に縮約する

`descriptor` / `fallbackStep` / `steps` の各パラメータを撤去する。

- **Rationale**: D1/D2 により、phase 推定（descriptor）・null fallback（fallbackStep）・fixer-empty detection（steps）の入力がすべて不要になる。`--from` の step 名検証は全登録 step 集合（`AGENT_STEP_NAMES` + `CLI_STEP_NAMES`）で足り、特定 pipeline の descriptor を要しない（これは現行 Tier 1a と同じ挙動）。呼び出し側（`src/core/command/resume.ts`）からも `getPipelineDescriptor` / `state.steps` / `fallbackStep` の受け渡しが消え、簡素化が末端まで波及する。
- **Alternatives considered**:
  - `descriptor` を残して pipeline 固有の step 検証を行う: 現行 Tier 1a もグローバル集合で検証しており追加の安全性は得られない。不要なため却下。

### D4: `handleExhausted` は `resumePoint.step` に「対の fixer step」を記録する

`handleExhausted` が `resumePoint.step` に書く値を、枯渇した loop step（reviewer）から「`loopFixerPairs[exhaustedLoopName]`（対の fixer）」へ変更する。対の fixer が存在しない loop step（後述の conformance 等、gate）は従来通り自身を記録する（`loopFixerPairs[name] ?? name`）。

- error code（`LOOP_ERROR_CODES` 参照）と「最終 reviewer entry の verdict を escalation に上書き」する処理は、従来通り `exhaustedLoopName`（reviewer）を基準に保持する。変更するのは `resumePoint.step` フィールドのみ。
- **Rationale**: 枯渇した reviewer を再実行しても同じ verdict を再生産して再枯渇する。生産的な再開入口は対の fixer であり、これは旧 Tier 2b が読み取り時に行っていた補正と同じ意味を、記録時に確定させるもの。resume 時は loop/fixer の反復カウンタが 0 から再スタートするため、fixer から再開すれば新しい収束エピソードに満額の反復予算が与えられる。
- **対の fixer を持たない loop step の扱い**: 標準 pipeline では conformance が `loopNames` に含まれるが `loopFixerPairs` に対の fixer を持たない（needs-fix は implementer へ遷移する gate）。この場合は自身を記録する（挙動据え置き）。conformance の枯渇後 resume は conformance を再評価し、needs-fix なら implementer へ進むため一巡で自己補正する。reviewer→fixer ペアの最適化に範囲を限定し、gate の遷移先推定（implementer）には踏み込まない（`exhaustion-consolidation` がスコープ外であるため）。
- **Alternatives considered**:
  - transition table を引いて「枯渇 step の needs-fix 遷移先」を一般化記録（conformance → implementer も含む）: より一般的だが `handleExhausted` に遷移解決を持ち込み、枯渇判定ロジックの変更に接近する。要件 5 が「対応する fixer step（`loopFixerPairs`）」を明示しているため、`loopFixerPairs` ベースを採用し conformance は据え置く。

### D5: null `resumePoint` + `--from` 未指定のエラーは command 層に残す

「再開位置が不明です。`--from` で再開 step を指定してください」のメッセージと exit code は、現行どおり `ResumeCommand.prepare()`（`src/core/command/resume.ts`）のガードで出す。`resolveResumeStep` は、この不能ケースに対しては防御的に Error を投げる invariant とする（正常系では command 層ガードにより到達しない）。

- **Rationale**: 利用者向けメッセージと exit code は command 層の責務（`logError` + `PrepareError`）。純関数 `resolveResumeStep` は再利用可能な不変条件のみを持つ。既存テスト（command 層でメッセージを検証）を壊さず、関数は防御で堅牢化する。
- **Alternatives considered**: メッセージを `resolveResumeStep` に移す案は、純関数に CLI 文言と出力責務を持ち込むため却下。

### D6: crash / escalation / signal / timeout の記録は据え置く

これら 4 箇所は in-flight step（`state.step` ないし `currentStep`）を記録しており、「中断された step を再実行する」という新方針と一致する。本変更では触らない。

- **Rationale**: executor が step 実行開始時に `state.step` を当該 step に更新するため、記録される step は kill 時に実際に走っていた step を指す。これを素直に返すのが正しい。`handleExhausted` のみが「枯渇 reviewer」という再実行に不向きな step を記録していたため、D4 で是正する。

## Risks / Trade-offs

- [#236（fixer-empty）シナリオの再開先が変わる] 旧 Tier 2a は「reviewer needs-fix → fixer 遷移直後に kill」されたケースで reviewer に戻していた。本変更では記録された fixer から再開する。→ **Mitigation**: fixer は最新の review-feedback を読んで修正する step であり、中断直後の fixer 再実行は feedback を消化して reviewer へ進む生産的な入口。reviewer から再開すると未変更コードを再 review して needs-fix を再生産し fixer へ戻る分だけ非効率。よって挙動変更は退行ではなく改善。該当テスト（TC-RESUME-013 等）は新挙動へ更新する。

- [consecutive-escalation ガードへの影響] `ResumeCommand.prepare()` は `resumePoint.step` を対象に「3 連続 escalation で `--force` 必須」を判定する。D4 で exhaustion の `resumePoint.step` が reviewer から fixer に変わる。→ **Mitigation**: このガードは escalation path（hard error が同一 step で 3 連続）向けに機能する。exhaustion path では reviewer の末尾 verdict が `[…, needs-fix, needs-fix, escalation]` と interleave するため、現行設計でも「末尾 3 件すべて escalation」に到達せずガードは元から発火しない。fixer は escalation verdict を蓄積しないため、ガードの実効挙動に退行はない。escalation path（`resumePoint.step` = escalation した step）は本変更で不変。

- [legacy state の resumePoint] 旧 exhaustion ロジックで記録された既存 state は `resumePoint.step` に reviewer を持つ。これを resume すると reviewer から再開し、再枯渇しうる。→ **Mitigation**: 一過性。`--from <fixer-step>` で明示再開可能。新規の枯渇は D4 により fixer を記録する。

- [`--from` alias 撤去による利用者影響] スクリプト等が `--from critic/fixer/creator` に依存していると失敗する。→ **Mitigation**: Migration Plan に step 名対応表を記載。CLI の `--from` 受理値からも alias を除く（不正値時のエラーに有効 step 名を列挙）。

## Open Questions

なし（要件 4 の alias 判断は D2 で撤去に確定。`exhaustionPhase` / `iterationsExhausted` はスキーマ据え置きで read-only 化）。

## Migration Plan

- **`--from` alias → step 名対応**（利用者向け）:
  - `--from critic` → `--from spec-review`（spec phase）／`--from code-review`（impl phase）
  - `--from fixer` → `--from spec-fixer`／`--from code-fixer`
  - `--from creator` → `--from design`／`--from implementer`
- CLI registry（`src/cli/command-registry.ts`）の `resume.flags.from.values` から `critic` / `fixer` / `creator` を除去し、有効値を登録 step 名のみにする。
- legacy state（reviewer を指す `resumePoint`）は次回 resume 時に reviewer から再開する。再枯渇を避けたい場合は `--from <fixer-step>` を案内する。ロールバックは本変更の revert で旧推理ロジックに戻せる（state スキーマ非互換は発生しない）。
