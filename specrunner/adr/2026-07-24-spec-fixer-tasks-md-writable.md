# ADR-20260724: spec-fixer の書込集合に tasks.md を追加し、spec-round 内で tasks.md finding を収束させる

**Date**: 2026-07-24
**Status**: accepted

Extends: [ADR-20260723-spec-review-fixer-routing](2026-07-23-spec-review-fixer-routing.md)
Updates: [ADR-20260723-canon-finding-escalation-routing](2026-07-23-canon-finding-escalation-routing.md) — fixer 別書込可能集合表の spec-fixer 行を `{spec.md, design.md}` → `{spec.md, design.md, tasks.md}` に更新

## Context

ADR-20260723（spec-review-fixer-routing）は、spec-review round の fixable finding を
spec-fixer に routing して pipeline 内で収束させる仕組みを確立した。その時点での
spec-fixer の canon 書込可能集合は `{spec.md, design.md}` であり、tasks.md への
fixable finding（テスト計画補強・design 既決事項の転記型）は unroutable と判定されて
`CANON_FINDING_ESCALATION` で operator 停止していた。

実運用ではこの tasks.md escalation が canon escalation の最頻要因となっていた。
spec-review は tasks.md を読んで整合性をレビューするにもかかわらず、round 内の誰も
tasks.md を修正できない——「指摘できるが修正経路がない」非対称が 1 ファイル分残っていた。

tasks.md は design step が spec.md / design.md と同時に生成する同格の派生成果物であり、
同じ spec round で spec-fixer が修正できないままにしておく構造的理由がない。

### 確立済みの設計基盤

`deriveSpecReviewVerdict` は `CanonWriteScope.writableByFixer`（各 fixer の `writes()` から
導出）を参照して routable / unroutable を判定する純粋データ駆動型の設計であり、
verdict 導出ロジック自体に per-file 特殊ケースは存在しない。write-set の宣言を変えると
verdict 挙動が自動追随する構造になっている。

write-set の宣言は 3 つの同期点で二重防壁されている:

| 同期点 | 役割 |
|--------|------|
| `spec-fixer.ts` `writes()` | permission 層（workspace tool guard + scoped-commit staging） |
| `canon-write-scope.ts` D5 map | routing 層（verdict 導出が参照する `writableByFixer`） |
| TC-029 drift-guard | `writes() ∩ protectedCanonPaths` = D5 map entry を機械検証 |

## Decision

### D1: tasks.md を書込集合の拡張のみで routing する — verdict ロジックは変更しない

tasks.md への fixable finding が escalation → needs-fix に変わるよう、spec-fixer の
canon 書込集合に tasks.md を追加する。verdict 導出関数（`deriveSpecReviewVerdict` 等）、
effective-fixer resolver、遷移表は一切変更しない。

- **採用理由**: write-set は routing 境界の唯一の正典（single authoritative representation）。
  ここを広げるだけで verdict が自動追随する。verdict ロジックを変えると境界が 2 か所に
  二重化し、TC-029 drift-guard が守る単一ソース原則に反する。
- **却下案 — tasks.md を verdict 関数内で特殊ケース**: write-set とは別の経路で境界を
  宣言することになり、drift-guard が機械検証する不変の外に出る。

### D2: 書込集合の 3 同期点すべてを同一コミットで更新し、prompt も更新する

以下の 4 点を一括更新する:

1. `spec-fixer.ts` `writes()` に `${folder}/tasks.md` を追加
2. `canon-write-scope.ts` D5 map の spec-fixer エントリを `{spec.md, design.md, tasks.md}` に更新
3. drift-guard テスト（TC-029）はこの 2 点が同期している限り green を維持する
4. spec-fixer prompt（conformance entry の user message と system-prompt write-set 節）に tasks.md を追記

- **採用理由**: permission 層（writes()）だけを更新すると routing 層（D5 map）との skew が
  発生し、routing 側が tasks.md finding を spec-fixer に送ったのに spec-fixer が書けない
  という矛盾に TC-029 が即座に気づく。4 点を同一コミットで更新することで
  drift-guard が整合証明を担い続ける。

### D3: conformance 経路は write-set 拡張の自然な帰結として tasks.md finding を受け取る

`deriveConformanceVerdict` は `conformanceEffectiveFixer`（finding.fixTarget 尊重）を使う。
tasks.md が spec-fixer-writable になったことで、fixable conformance finding に
`fixTarget: spec-fixer` がついていれば `needs-fix:spec-fixer` を返す。これは既存設計の
自然な帰結であり、verdict 関数の変更なしに達成される。

**FAST pipeline への影響**: `FAST_TRANSITIONS` に `needs-fix:spec-fixer` 行がないため、
conformance finding が `needs-fix:spec-fixer` に倒れると no-match default の `escalate`
終端に落ちる。この経路では `escalationReason` が設定されない（旧 unroutable escalation と
異なる）。FAST profile はこの reason-less halt を既知の動作として pin するテストで固定する。

- **採用理由**: conformance の verdict 関数に per-file 特殊ケースを追加すると D1 が否定した
  単一ソース原則に反する。FAST プロファイルの挙動差は known-debt ではなく、
  FAST の設計（needs-fix:spec-fixer 遷移を持たない）の当然の帰結であり、
  テストで documented contract として固定することが正しい。

### D4: tasks.md 専用 fixer を新設しない

spec round の fixer は `loopFixerPairs[SPEC_REVIEW] = SPEC_FIXER` により構造的に
spec-fixer 一択。tasks.md は design step が同時生成する同格の派生成果物であり、
既存の spec-fixer に収めることが最小構造の変更。

- **却下理由**: 専用 fixer は transition/loop pair の追加とスコープ管理の二重化を
  招くだけで、動作上の利得がない。

### D5: tasks.md の書込境界はこの変更で固定し、request.md / test-cases.md は変更しない

tasks.md を spec-fixer の書込集合に加えることで、fixable finding の収束境界は:

| ファイル | spec-fixer で収束 |
|---------|-----------------|
| spec.md | ✓（変更前から） |
| design.md | ✓（変更前から） |
| tasks.md | ✓（本変更で追加） |
| request.md | ✗（escalation のまま） |
| test-cases.md | ✗（escalation のまま） |
| request-review attestation | ✗（escalation のまま） |

TC-019 が request.md / test-cases.md の除外を引き続きアサートし、
テストコードで境界を機械固定する。

### D6: tasks.md は実行フェーズで二重所有を持つが、ラウンド単位で分離される

tasks.md は implementer（task checkbox 更新）と spec-fixer（spec round での仕様補完）の
両方が書く。D5 map の per-fixer 設計は重複所有を許容しており、各 fixer は
自分の round 内でのみ tasks.md を書く。単一ライター不変は存在しないが、
ラウンド境界と実行ウィンドウによって衝突しない構造となっている。

## Alternatives Considered

### A1: tasks.md 専用 fixer の新設

- **Pros**: fixer の責務分離が明示的になる。
- **Cons**: spec round は構造的に fixer 一択（loopFixerPairs で宣言済み）。
  新 fixer は transition edge / loop pair の追加と write-scope 管理の二重化を招く。
- **Why not**: D4 で却下。書込集合の拡張がより小さく明快な解。

### A2: verdict 関数に tasks.md 専用分岐を追加

- **Pros**: verdict ロジックで境界を直接制御できる。
- **Cons**: write-set とは別に境界が書かれ、drift-guard の機械検証の外に出る。
  単一ソース原則（write-set が routing 境界の正典）と矛盾する。
- **Why not**: D1 で却下。データ（write-set）を変えれば verdict は自動追随する。

### A3: 現状維持（tasks.md は常に escalation）

- **Pros**: 変更ゼロ。
- **Cons**: 転記型 finding のたびに operator 停止と手動適用が続く。実測で
  canon escalation の最頻要因。「request だけで自律収束する」契約に反する。
- **Why not**: 最頻停止要因を取り除ける最小変更が明確なため採用不可。

## Consequences

### Positive

- tasks.md への fixable spec-review finding が severity 不問で `needs-fix → spec-fixer` に
  routing され、pipeline 内で収束する。operator 停止の最頻要因を除去。
- write-set を広げるだけで routing が変わる「宣言が正典」の設計を検証・強化した。
- TC-029 drift-guard が 3 点同期を引き続き機械検証し、将来の write-set 変更に対して
  同一コミット更新を強制する構造が保たれる。
- spec-fixer prompt が tasks.md を明示的に記述することで、エージェントが tasks.md
  finding を scope 外と誤判断するリスクを排除する。

### Negative

- spec-review → spec-fixer のループが発火する条件が広がり、tasks.md に finding がある
  場合も iteration を消費する。ループは有界（`maxIterations` / `SPEC_REVIEW_RETRIES_EXHAUSTED`）。
- tasks.md の実行フェーズ二重所有（implementer + spec-fixer）が明示的になる。
  per-round 分離は設計上安全だが、将来の並列実行拡張では衝突検証が必要になる。

### Known Debt

- FAST pipeline での conformance tasks.md finding（`fixTarget: spec-fixer`）が
  `needs-fix:spec-fixer` を返し、reason-less halt になる挙動は pin テストで固定したが、
  FAST での spec-fixer 実行を想定した `FAST_TRANSITIONS` 拡張が将来必要になる可能性がある。
- tasks.md dual-write のラウンド分離は現在テストで保護されていない。
  並列メンバー実行が拡張される際に衝突検証を追加することが望ましい。

## References

- Request: `specrunner/changes/spec-fixer-tasks-md-writable/request.md`
- Design: `specrunner/changes/spec-fixer-tasks-md-writable/design.md`
- Spec: `specrunner/changes/spec-fixer-tasks-md-writable/spec.md`
- Implementation: `src/core/step/spec-fixer.ts` / `src/core/step/canon-write-scope.ts` /
  `src/prompts/spec-fixer-system.ts` / `src/prompts/rules.ts`
- Tests: `tests/unit/core/step/spec-fixer-tasks-md-writable.test.ts` /
  `src/core/step/__tests__/spec-review-fixer-routing.test.ts` /
  `tests/unit/core/step/canon-write-scope.test.ts` /
  `tests/unit/core/step/judge-verdict-canon.test.ts`
- Related: [ADR-20260723-spec-review-fixer-routing](2026-07-23-spec-review-fixer-routing.md)
  — spec-review round の fixable canon finding を spec-fixer に routing する基盤
- Related: [ADR-20260723-canon-finding-escalation-routing](2026-07-23-canon-finding-escalation-routing.md)
  — fixer 別書込可能集合と unroutable finding escalation の設計基盤
