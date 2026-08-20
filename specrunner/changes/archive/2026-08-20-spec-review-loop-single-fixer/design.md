# Design: spec-review loop の単一 fixer 化 — test-case-gen を review loop から外す

## Context

Fixes #1015。

spec-review の needs-fix ループは現在 2 系統の fixer を持つ:

- spec.md / design.md / tasks.md 宛の finding → **spec-fixer**（targeted 修正）
- test-cases.md 宛の finding → **test-case-gen**（design/tasks を入力に test-cases.md を**丸ごと再生成する producer**）

test-case-gen は現在の test-cases.md を修正対象として読む契約を持たない。ループ内で
起動されると wholesale 再生成になり、operator が `job resume <slug> --apply-canon` で正式採用した
test-cases.md の編集（例: TC-007 の must 昇格）のうち、生成元 canon（design/tasks）に根拠が載って
いないものが、**当該 finding と無関係でも警告なく消える**。これが #1015 の実害である。

test-case-gen をループの fixer として使うために、現状は以下の補助構造が積み上がっている:

- `testCaseGenEffectiveFixer`（test-cases.md 宛 finding を test-case-gen に routable と判定する resolver）
- `deriveSpecReviewVerdict` の 4b 分岐（TC-routable finding は severity 問わず needs-fix）
- `specReviewNeedsFixIsTcOnly`（TC 宛のみの needs-fix を判定し、spec-fixer を飛ばして test-case-gen 直行）+ その transition
- `specFixerNeedsFixForward`（spec-fixer 完了後 test-case-gen へ TC 再生成に送る）+ その transition
- `loopIntermediateSteps: {test-case-gen}`（spec-fixer → test-case-gen → spec-review が
  収束予算をリセットしないための episode 透過化）
- `step-completion` の spec-review 用 dual-resolver（test-cases.md は test-case-gen、他は spec-fixer）

### 現状コードの前提（検証済み）

- `src/core/step/canon-write-scope.ts:37-45` — `writableByFixer`。spec-fixer = {spec.md, design.md, tasks.md}、test-case-gen = {test-cases.md}。
- `src/core/step/canon-escalation.ts:56` `specReviewEffectiveFixer`（常に spec-fixer）、`:63` `testCaseGenEffectiveFixer`（常に test-case-gen）。
- `src/core/step/judge-verdict.ts:86-118` `deriveSpecReviewVerdict` — 4a 二重不能→escalation / 4b TC-routable→needs-fix / 4c spec-routable critical|high→needs-fix, low|medium→approved。
- `src/core/step/step-completion.ts:211-221` — spec-review は dual-resolver、他 judge は judgeEffectiveFixer。
- `src/core/pipeline/spec-observation.ts` — `specReviewHasRoutableFixables`(38) / `specFixerObservationForward`(63) / `specFixerNeedsFixForward`(103) / `specReviewNeedsFixIsTcOnly`(129)。
- `src/core/pipeline/types.ts:253-272` STANDARD_TRANSITIONS の design/spec-review/test-case-gen/spec-fixer 行、`:141-156` `loopIntermediateSteps?` field。
- `src/core/pipeline/registry.ts:87` STANDARD_DESCRIPTOR のみが `loopIntermediateSteps` を設定（fast / design-only は未使用）。`src/core/pipeline/run.ts:72` が唯一の descriptor→Pipeline 受け渡し点。
- `src/core/pipeline/pipeline.ts:95-99,113,126,519-537` — `loopIntermediateSteps` の field / param / 消費（newEpisode 判定）。
- `src/core/step/spec-fixer.ts:99-106` `writes()` = {design.md, spec.md, tasks.md}。`src/prompts/spec-fixer-system.ts` の write-set は test-cases.md を含まない。
- `src/core/step/test-case-gen.ts:83-104` `buildMessage` — needs-fix 再入時に TC-routable finding を注入する分岐（ループ除去後は死ぬ）。
- drift-guard `tests/unit/core/step/canon-write-scope.test.ts:242-311`（TC-029）— `writableByFixer[fixer]` が各 step の `writes() ∩ protectedCanonPaths` と一致することを検証。
- `protectedCanonPaths`（`write-scope.ts:62-72`）= {request.md, spec.md, design.md, tasks.md, test-cases.md, attestation}。

## Goals / Non-Goals

**Goals**:

- test-cases.md 宛の spec-review finding を、他 canon と同じく **spec-fixer** に route する（targeted 修正、再生成でない）。
- test-case-gen を「design 後に一度だけ走る producer」に戻す。needs-fix ループ内では二度と起動されない。
- 上記補助構造（TC-only routing 述語・TC 再生成 transition・episode 透過化・dual-resolver）を丸ごと削除し、spec-review ⇄ spec-fixer を code-review ⇄ code-fixer と同形にする。
- resume / apply-canon を無変更のまま、operator 修正 → `--apply-canon` → canon 確定 → 通常 pipeline、という契約で #1015 を解消する。

**Non-Goals**:

- resume / apply-canon の挙動変更（何も足さない）。
- code-review loop・conformance の routing 変更。
- test-case-gen の生成品質・system prompt の変更（ループからの結線除去のみ）。
- spec-review の finding 検出基準の変更。
- #1015 で不採用裁定済みの「operator 差分保護機構」の導入。
- `FixTarget` 型からの `"test-case-gen"` 除去（test-case-gen は producer として test-cases.md を書き続けるため型メンバは維持）。

## Decisions

### D1: spec-fixer の write scope に test-cases.md を追加する

`writableByFixer` の spec-fixer エントリと `SpecFixerStep.writes()` の双方に `test-cases.md` を追加する。
両方を同時に更新するのは drift-guard（TC-029）が「map == writes() ∩ canonPaths」を要求するため。
write scope の実効性（commit-push の scoped 検査で test-cases.md の commit を許可する）は `writes()` 側が担う。

spec-fixer の system prompt（`spec-fixer-system.ts`）の Contract/write-set/Method に test-cases.md を追記し、
**既存内容を尊重した targeted 修正であり再生成ではない**ことを明示する。

- Rationale: test-cases.md を他 canon と同格の spec-fixer 修正対象にすることが、TC-only 補助構造を
  すべて不要にする最短経路。effective fixer が spec-fixer 一本になれば `testCaseGenEffectiveFixer` /
  dual-resolver / TC 分岐の存在理由が同時に消える。
- Alternatives considered:
  - *resume に operator 差分保護機構を足す*: #1015 で不採用裁定済み。resume が「この差分を後段から守れ」を
    覚え始めると resume が肥大化する。採用後に壊す再生成経路を消す方が構造的に小さい。
  - *test-case-gen に「既存を読んで差分修正する」契約を足す*: producer に修正責務を二重化する。spec-fixer が
    既に targeted 修正の agent として存在するのに、もう一つの修正 agent を育てるのは重複。

### D2: test-cases.md 宛 finding は escalation でなく spec-fixer に倒す

`deriveSpecReviewVerdict` から 4b（TC-routable → needs-fix）を削除する。test-cases.md は D1 で
spec-fixer-routable になるため、他の canon（spec/design/tasks）と同じ severity 則に従う:

- critical|high の test-cases.md fixable → needs-fix（spec-fixer → 再 spec-review）
- low|medium の test-cases.md fixable → approved に fall-through（observation auto-fix: spec-fixer → implementer）

4a（canon 不能 → escalation）の判定は `!specRoutableFiles.has(f.file)` のみになる。request.md /
attestation は依然 spec-fixer 非 writable なので escalation を維持する。

- Rationale: test-cases.md がループの単一 fixer 配下に入ることの必然的な帰結。severity 則を canon 全体で
  統一することで「TC だけ severity 問わず needs-fix」という特例が消える。
- Trade-off: low/medium の test-cases.md finding は従来 needs-fix（TC 再生成）だったが、今後は
  observation auto-fix（spec-fixer で直して implementer へ）になる。これは request 要求4「observation
  auto-fix 経路の維持 + routable の test-cases.md 拡張」の直接の結果であり、意図した挙動である。
- Alternatives considered: *test-cases.md だけ severity 問わず needs-fix を残す* → 特例を温存し補助分岐が
  残る。単一 fixer 化の目的（同形化）に反する。却下。

### D3: TC-only / TC 再生成の routing 述語と transition を削除する

削除対象:

- `testCaseGenEffectiveFixer`（canon-escalation.ts）
- `specReviewNeedsFixIsTcOnly`（spec-observation.ts）+ `spec-review needs-fix → test-case-gen` transition
- `specFixerNeedsFixForward`（spec-observation.ts）+ `spec-fixer approved(needs-fix) → test-case-gen` transition
- step-completion.ts の spec-review 用 dual-resolver → `specReviewEffectiveFixer` 一本に単純化

削除後の spec-fixer 完了時の行き先: observation pass（guarded → implementer）／それ以外は
**unconditional → spec-review**（re-review）。needs-fix 一巡は spec-review → spec-fixer → spec-review。

`design → test-case-gen`（初回生成）、exempt type の bypass（#987）、`test-case-gen → spec-review`
（初回経路）は変更しない。

- Rationale: `specFixerNeedsFixForward` は削除する TC 再生成 transition 専用の guard であり、transition が
  消えれば参照ゼロの死コードになる。損益表の「補助構造が丸ごと削除できる」に含まれる。残すと dead export。
- Alternatives considered: *述語だけ残して transition を消す* → 未参照 export が残り「削除対象が存在しない」
  という受け入れ基準を満たせない。却下。

### D4: episode 透過化 `loopIntermediateSteps` をパラメータごと削除する

STANDARD_DESCRIPTOR の `loopIntermediateSteps: {test-case-gen}` を削除し、これを唯一の利用点とする
`loopIntermediateSteps` パラメータ自体（types.ts の field / pipeline.ts の field・param・消費 / run.ts の
受け渡し）を削除する。`pipeline.ts` の newEpisode 判定は
`currentStep !== pairedFixerForNext && !this.loopIntermediateSteps.has(currentStep)` から
`currentStep !== pairedFixerForNext` に単純化する。

- Rationale: 透過化は spec-fixer → **test-case-gen** → spec-review という間接経路のためだけに存在した。
  ループが spec-fixer → spec-review 直行に戻れば、fixer→reviewer の復帰は `currentStep === pairedFixerForNext`
  で自然に same-episode 判定される。透過化は不要になる。registry を grep した結果、STANDARD_DESCRIPTOR 以外
  （fast / design-only）に利用は無く、パラメータごと削除して安全（request 要求2の条件を満たす）。
- Alternatives considered: *パラメータは残し registry の指定だけ削除* → 未使用の descriptor field と pipeline
  配管が残る。利用が STANDARD のみと確認できたので全削除が正しい。

### D5: test-case-gen.ts の needs-fix finding 注入を除去する

`test-case-gen.ts` の `buildMessage` から spec-review findings 注入分岐（`getLatestJudgeFindings` +
`selectRoutableCanonFindings(..., testCaseGenEffectiveFixer)`）を削除し、
`buildTestCaseGenInitialMessage({ slug, branch, requestContent })` を呼ぶだけにする。

- Rationale: test-case-gen が design 後に一度しか走らない producer に戻ると、実行時点で spec-review は未実行 →
  注入対象 finding は常に空。かつ `testCaseGenEffectiveFixer` 削除でこの分岐は compile しない。生成物は
  first-run と同一（`specReviewFindingsBlock` は optional で省略時 findings セクション空）なので、prompt の
  生成品質は変わらない（結線除去のみ、Non-Goal を侵さない）。
- Alternatives considered: *注入分岐を残す* → 削除された `testCaseGenEffectiveFixer` に依存し compile 不能。不可。

## Risks / Trade-offs

- [Risk] test-cases.md が spec-fixer と test-case-gen の両方の `writableByFixer` に含まれ、意味が曖昧になる →
  Mitigation: routing の effective fixer は spec-fixer 一本（`testCaseGenEffectiveFixer` 削除後、test-case-gen
  への routable 判定は存在しない）。test-case-gen の map エントリは producer の writes() 宣言として drift-guard
  にのみ照合され、routing には使われない。両者の意味は「producer が生成／fixer が targeted 修正」で明確。
- [Risk] low/medium test-cases.md finding が needs-fix→approved に変わる挙動変更を見落とす → Mitigation: D2 を
  spec/tests で明示 pin（TC-005 系の期待更新を tasks で列挙）。
- [Risk] #1015 の歯が「agent が実際に targeted 修正するか」に依存し、決定的テストで再現できない →
  Mitigation: 根本原因は「ループ内の wholesale 再生成」。歯は「needs-fix 一巡で test-case-gen が起動されない
  こと（transition 検証）」+「test-cases.md finding が spec-fixer に route され escalation にならないこと」で
  構造的に pin する。再生成 step がループに存在しなければ、無関係な operator 編集は構造上保存される。
- [Trade-off] 既存の archived-change 由来テスト（test-case-gen-design-phase / spec-observation-autofix /
  spec-fixer-tasks-md-writable の一部）が旧挙動を pin しており、期待更新が必要。これは純 refactor でなく意図的な
  挙動変更のため正当な test churn。tasks で対象を全列挙する。

## Open Questions

なし（routing・削除範囲・パラメータ削除可否はコード確認で確定済み）。
