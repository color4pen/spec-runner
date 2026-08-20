# ADR-20260820: spec-review loop を単一 fixer（spec-fixer）に統一し test-case-gen をプロデューサー専用に戻す

**Date**: 2026-08-20
**Status**: accepted

Updates: [ADR-20260724-spec-fixer-tasks-md-writable](2026-07-24-spec-fixer-tasks-md-writable.md) — D5「test-cases.md は escalation のまま」境界を本 ADR が撤回し、spec-fixer の書込集合に追加する
Extends: [ADR-20260723-spec-review-fixer-routing](2026-07-23-spec-review-fixer-routing.md) — spec-review round の単一 fixer 設計を test-cases.md まで完全に適用
Follows: [ADR-20260723-operator-canon-apply-on-resume](2026-07-23-operator-canon-apply-on-resume.md) — `--apply-canon` による operator 帰属ゲートは本 ADR で無変更のまま維持される

## Context

ADR-20260723（spec-review-fixer-routing）は spec-review round の fixable finding を spec-fixer
に routing して pipeline 内で自動収束させる仕組みを確立し、ADR-20260724（spec-fixer-tasks-md-writable）
は spec-fixer の書込集合を `{spec.md, design.md, tasks.md}` に拡張した。ただし ADR-20260724 D5 では
test-cases.md を明示的に境界外として維持していた:

> test-cases.md | ✗（escalation のまま）

この設計の下、spec-review loop は test-cases.md 宛の finding を test-case-gen に routing する
**2 系統の fixer モデル**として動作していた:

- spec.md / design.md / tasks.md 宛の finding → **spec-fixer**（targeted 修正）
- test-cases.md 宛の finding → **test-case-gen**（design/tasks を入力に test-cases.md を丸ごと再生成）

test-case-gen はその契約上「現在の test-cases.md を修正対象として読む」能力を持たない。
ループ内で起動されると wholesale 再生成になり、operator が `job resume --apply-canon` で
正式採用した test-cases.md の編集（例: TC-007 の priority 昇格）のうち、生成元 canon（design/tasks）に
根拠が載っていないものが **当該 finding と無関係でも警告なく消える**（#1015 の実害）。

2 系統の fixer を維持するため、以下の補助構造が積み上がっていた:

- `testCaseGenEffectiveFixer`（test-cases.md 宛 finding を test-case-gen に routable と判定する resolver）
- `deriveSpecReviewVerdict` の 4b 分岐（TC-routable finding は severity 問わず needs-fix）
- `specReviewNeedsFixIsTcOnly`（TC 宛のみの needs-fix を判定し spec-fixer を飛ばして test-case-gen 直行）+ その transition
- `specFixerNeedsFixForward`（spec-fixer 完了後 test-case-gen へ TC 再生成に送る）+ その transition
- `loopIntermediateSteps: {test-case-gen}`（spec-fixer → test-case-gen → spec-review が収束予算を
  リセットしないための episode 透過化）
- `step-completion.ts` の spec-review 用 dual-resolver

### 参照: 確立済みの設計基盤

`deriveSpecReviewVerdict` は `CanonWriteScope.writableByFixer`（各 fixer の `writes()` から導出）を
参照して routable / unroutable を判定するデータ駆動型の設計（ADR-20260724 D1）。
write-set の宣言変更だけで verdict 挙動が自動追随する構造になっており、TC-029 drift-guard が
`writes() ∩ protectedCanonPaths = writableByFixer エントリ` を機械検証する。

## Decision

### D1: test-cases.md を spec-fixer の書込集合に追加する — ADR-20260724 D5 境界の撤回

ADR-20260724 D5 が「test-cases.md は escalation のまま」と固定した境界を撤回し、
spec-fixer の書込集合（`writableByFixer["spec-fixer"]` および `SpecFixerStep.writes()`）に
test-cases.md を追加する。spec-fixer の system prompt に「**既存の TC を尊重した targeted 修正であり、
再生成はしない**」旨を追記する。

TC-029 drift-guard の要求（`writes() ∩ protectedCanonPaths = writableByFixer エントリ`）に従い、
3 つの同期点（`spec-fixer.ts` `writes()` / `canon-write-scope.ts` D5 map / TC-029 テスト）を
同一コミットで更新する。

write-set を広げるだけで verdict が自動追随する（ADR-20260724 D1 の確立済み設計）ため、
verdict 導出ロジックそのものへの変更は最小（後述 D3 の 4b 分岐削除のみ）。

- **採用理由**: test-cases.md を他 canon と同格の spec-fixer 修正対象にすることが、
  TC-only 補助構造をすべて不要にする最短経路。effective fixer が spec-fixer 一本になれば
  `testCaseGenEffectiveFixer` / dual-resolver / TC 分岐の存在理由が同時に消える。
  境界を一段階広げることで構造的複雑性が下がるというエコノミー。
- **却下案** — *resume に operator 差分保護機構を足す*: #1015 で不採用裁定済み。resume が
  「この差分を後段から守れ」を覚え始めると resume が肥大化する。採用後に壊す再生成経路を消す
  方が構造的に小さい。ADR-20260723（operator-canon-apply-on-resume）が確立した
  `--apply-canon` の意味論——「operator が採用した = canon として確定」——で十分であり、
  追加の保護機構は二重防壁に留まらず resume の責務を侵食する。
- **却下案** — *test-case-gen に targeted 修正契約を追加する*: producer に修正責務を二重化する。
  spec-fixer が既に targeted 修正の agent として存在するのに、もう一つの修正 agent を育てるのは
  構造の複製であり Non-Goal（spec-fixer が担う）を達成する迂回路に過ぎない。

### D2: test-case-gen を review loop から除去し、design 後の一度限りのプロデューサーに戻す

以下を削除する:

- `testCaseGenEffectiveFixer`（TC routable 判定の用途が消滅する）
- `specReviewNeedsFixIsTcOnly` + `SPEC_REVIEW → TEST_CASE_GEN` transition（guarded）
- `specFixerNeedsFixForward` + `SPEC_FIXER approved → TEST_CASE_GEN` transition（TC 再生成）
- `step-completion.ts` の spec-review 用 dual-resolver → `specReviewEffectiveFixer` 一本に単純化

needs-fix 一巡のシーケンスは `spec-review → spec-fixer → spec-review`（spec-review ⇄ spec-fixer と
code-review ⇄ code-fixer が同形）になる。`design → test-case-gen → spec-review` の初回経路と
exempt type の bypass（#987）は変更しない。

- **採用理由**: test-case-gen は現在の test-cases.md を修正対象として読む契約を持たない。
  ループに居ることそのものが #1015 の根本原因であり、除去が最小根本解。補助構造が
  test-case-gen を loop に結線するためだけに存在していたため、除去で構造が単純化する。
- **却下案** — *test-case-gen を loop に残し TC-only finding だけ保護*: loop に再生成 step が
  存在する限り、finding に関係ない operator 編集を保護する機構が必要になる。そのような機構を
  resume / apply-canon に追加することは D1 却下案と等価。

### D3: `deriveSpecReviewVerdict` から TC-only 分岐を削除し、test-cases.md に severity 規則を統一する

4b 分岐（TC-routable finding → severity 問わず needs-fix）を削除する。
test-cases.md が D1 で spec-fixer-writable になるため、他の canon（spec/design/tasks）と
同一の severity 規則に従う:

- critical|high の test-cases.md fixable finding → `needs-fix`（spec-fixer → 再 spec-review）
- low|medium の test-cases.md fixable finding → `approved` fall-through（observation auto-fix: spec-fixer → implementer）

4a（unroutable → escalation）の判定は `!specRoutableFiles.has(f.file)` のみになる。
request.md / attestation は依然 spec-fixer 非 writable なので escalation を維持する。

- **採用理由**: test-cases.md を spec-fixer の routing 下に収めた帰結として severity 規則を
  統一することが自然。「TC だけ severity 問わず needs-fix」という特例を温存すると、
  spec-fixer 書込集合を広げた意味（補助構造の削除）が半減する。
- **挙動変更点**: low/medium test-cases.md finding は従来 needs-fix（test-case-gen 再生成）
  だったが、今後は observation auto-fix（spec-fixer targeted 修正 → implementer）になる。
  これは D1/D2 の直接的帰結であり意図した変更。

### D4: `loopIntermediateSteps` パラメータをパイプラインごと削除する

STANDARD_DESCRIPTOR の `loopIntermediateSteps: {test-case-gen}` を削除し、
これを唯一の利用点とする `loopIntermediateSteps` パラメータ自体（`types.ts` field /
`pipeline.ts` field・param・消費 / `run.ts` 受け渡し）を削除する。

pipeline.ts の newEpisode 判定は:

```
// before:
let newEpisode = currentStep !== pairedFixerForNext && !this.loopIntermediateSteps.has(currentStep);

// after:
let newEpisode = currentStep !== pairedFixerForNext;
```

ループが `spec-fixer → spec-review` 直行に戻れば、fixer→reviewer の復帰は
`currentStep === pairedFixerForNext` で自然に same-episode 判定される。透過化は不要になる。

- **採用理由**: 透過化は spec-fixer → **test-case-gen** → spec-review という間接経路のためだけに
  存在した。test-case-gen がループから消えると参照がゼロになる dead インフラ。
  registry を grep した結果、STANDARD_DESCRIPTOR 以外（fast / design-only）に利用はない。
- **却下案** — *パラメータは残し registry の指定のみ削除*: 未使用の descriptor field と
  pipeline 配管が残る。将来の利用者が目的不明の dead parameter を見ることになる。
  利用が STANDARD のみと確認できたため全削除が正しい。

### D5: resume / `--apply-canon` は無変更のまま維持する

resume / apply-canon には何も足さない。ADR-20260723（operator-canon-apply-on-resume）が確立した
「operator 修正 → `--apply-canon` → canon として確定 → 以降は通常 pipeline」という契約が、
test-cases.md に対しても同様に成立する。

ループ内に wholesale 再生成する step が存在しなくなることで、finding と無関係の operator 編集は
構造上保存される（spec-fixer は finding 箇所のみを targeted 修正する）。

- **採用理由**: resume が「この差分だけ後段 agent から守れ」を覚え始めると resume が肥大化する。
  ループ内の破壊的 step を消すことで resume は単純なまま保てる。#1015 の根本原因は
  「ループ内の wholesale 再生成」であり、その step を消すことが契約違反なく解決する最小介入。

## Alternatives Considered

### A1: operator 差分保護機構を resume に追加する

operator が `--apply-canon` で適用した test-cases.md の差分を resume が記録し、後段の
test-case-gen から保護する機構（差分 patch / canonical fingerprint 等）を追加する案。

- **Pros**: test-case-gen を loop に残しながら operator 編集の消失を防げる。
- **Cons**: resume が「後段から守るべき差分」を知る責務を持ち始め、resume が肥大化する。
  operator 修正 → `--apply-canon` → canon として確定 → 以降は通常 pipeline という契約
  （ADR-20260723）に保護 state を注入することになり、設計の一貫性を損なう。
  破壊的 step を消す方が resume を無変更のまま保てる最短解。
- **Why not**: #1015 の設計議論で不採用と裁定済み。D5 で明示的に維持される契約の外に出る。

### A2: test-case-gen に targeted 修正の契約を追加する

test-case-gen の buildMessage に「既存の test-cases.md を読んで差分だけ修正する」モードを追加し、
spec-review loop 内で targeted fixer として機能させる案。

- **Pros**: test-case-gen が loop に留まり、既存の遷移構造を変えずに済む。
- **Cons**: producer に修正責務を二重化する。spec-fixer が既に targeted 修正の agent として
  存在する。test-case-gen が「読んで差分修正する」契約を正しく実装できるか agent の
  内部挙動に依存し、機械的に保証する手段がない。
- **Why not**: spec-fixer で対応できるものを別 agent に二重化する理由がない。D2 で却下。

### A3: test-cases.md を severity 問わず needs-fix のまま spec-fixer に送る（4b 相当の特例を維持）

spec-fixer の書込集合に test-cases.md を追加しつつ、severity 規則は従来通り
severity 問わず needs-fix（4b 相当）を維持する案。

- **Pros**: 変更範囲が最小（test-case-gen を消すだけ、severity 規則不変）。
- **Cons**: TC 向け特例分岐が verdict 関数に残り、補助構造の一部を温存する。
  単一 fixer 化で「同形化」が目的なのに spec-review だけ特別な severity 規則を持ち続ける。
  low/medium test-cases.md finding が needs-fix ループを回し続け、observation auto-fix 経路に
  乗らない。
- **Why not**: D3 で却下。severity 規則を统一することが同形化の完成。特例の温存は中途半端。

## Consequences

### Positive

- spec-review loop が `spec-review ⇄ spec-fixer` の単純な形に収束し、
  code-review ⇄ code-fixer と完全に同形になる。
- test-case-gen が loop に存在しないため、operator が `--apply-canon` で確定した
  test-cases.md の編集が finding と無関係でも構造的に保存される（#1015 の根本解消）。
- 補助構造（TC-only routing 述語 / TC 再生成 transition / episode 透過化 / dual-resolver）が
  丸ごと削除され、pipeline コードが简化される（STANDARD_TRANSITIONS -2 行、
  `loopIntermediateSteps` パラメータ削除、dead export ゼロ）。
- `deriveSpecReviewVerdict` の評価ロジックが単純化され、test-cases.md finding が
  他 canon と同一の severity 規則（critical|high → needs-fix / low|medium → auto-fix）に従う。
- resume / apply-canon が無変更のまま維持され、operator の操作フロー（#903 の設計）が
  test-cases.md に対しても同様に成立する。

### Negative

- low/medium の test-cases.md finding が従来の needs-fix（test-case-gen 再生成）から
  observation auto-fix（spec-fixer targeted 修正 → implementer）に変わる。
  この挙動変更は意図的だが、旧挙動に依存していたテストの期待を更新する test churn が発生する。
- spec-fixer が test-cases.md を targeted に修正する挙動の保証は prompt（system prompt の
  「再生成はしない / targeted」指示）に依存する。E2E レベルでの agent 挙動確認は
  mocked pipeline では実行不可能（review-feedback-001 F-001 の既知制約）。
  structural pin（loop 中 test-case-gen が起動しないこと + spec-fixer route の確認）で代替する。
- test-cases.md が spec-fixer と test-case-gen の両方の `writableByFixer` に含まれる状態になるが、
  routing の effective fixer は spec-fixer 一本（test-case-gen は producer として宣言のみ）。
  TC-029 drift-guard が両エントリを独立して machine-verify することで整合を保証する。

### Known Debt

- TC-009（should）として定義された「`SPEC_FIXER_SYSTEM_PROMPT` に test-cases.md と
  targeted 修正の記述が含まれる」は実装されていない（review-feedback-001 で指摘）。
  prompt の drift を検出する structural pin として追加が望ましい（非ブロッキング）。
- spec-fixer が test-cases.md を targeted に修正する挙動の E2E 検証は mocked pipeline では
  不可能。real pipeline での E2E テストが整備された際に補完することが望ましい。

## References

- Request: `specrunner/changes/spec-review-loop-single-fixer/request.md`
- Design: `specrunner/changes/spec-review-loop-single-fixer/design.md`
- Spec: `specrunner/changes/spec-review-loop-single-fixer/spec.md`
- Issue: #1015（operator 採用 TC priority が loop で無警告に消えた実害）
- Implementation: `src/core/step/canon-write-scope.ts` / `src/core/step/spec-fixer.ts` /
  `src/core/step/judge-verdict.ts` / `src/core/step/canon-escalation.ts` /
  `src/core/step/step-completion.ts` / `src/core/pipeline/spec-observation.ts` /
  `src/core/pipeline/types.ts` / `src/core/pipeline/pipeline.ts` /
  `src/core/pipeline/registry.ts` / `src/core/pipeline/run.ts` /
  `src/core/step/test-case-gen.ts` / `src/prompts/spec-fixer-system.ts` / `src/prompts/rules.ts`
- Related: [ADR-20260724-spec-fixer-tasks-md-writable](2026-07-24-spec-fixer-tasks-md-writable.md)
  — tasks.md 追加（本 ADR が D5 境界を撤回）
- Related: [ADR-20260723-spec-review-fixer-routing](2026-07-23-spec-review-fixer-routing.md)
  — spec-review round の single-fixer 設計基盤（本 ADR が test-cases.md まで完全適用）
- Related: [ADR-20260723-operator-canon-apply-on-resume](2026-07-23-operator-canon-apply-on-resume.md)
  — `--apply-canon` による operator 帰属ゲート（本 ADR で無変更のまま維持）
- Related: [ADR-20260723-canon-finding-escalation-routing](2026-07-23-canon-finding-escalation-routing.md)
  — fixer 別書込可能集合と unroutable finding escalation の設計基盤
