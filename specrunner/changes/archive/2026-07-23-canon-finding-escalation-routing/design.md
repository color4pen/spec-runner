# Design: 保護正典への fixable finding を、書けない fixer に routing せず escalation に倒す

## Context

write-scope 強制により、guarded fixer（code-fixer / build-fixer / implementer）の commit は
保護正典（request.md / spec.md / design.md / tasks.md / test-cases.md / request-review-attestation.json）
への書込を機械的に拒否する。guard の実装は `src/core/step/write-scope.ts` にあり、各 step の
`forbiddenWritePaths(stepName, slug, declaredWritePaths)` = `protectedCanonPaths(slug)` − 宣言 write
を境界とする。違反時は commit を中止し `WRITE_SCOPE_VIOLATION` で halt する。

一方、verdict 導出（`src/core/step/judge-verdict.ts`）と routing（`src/core/pipeline/*`）は
「fixable = fixer が直せる」という write-scope 以前の前提のままで、**`finding.file` を一切見ていない**。
このため保護正典を対象とする fixable finding は、`needs-fix` として code-fixer 等に routing され、
fixer が書込を試み、guard が阻止して halt する — **構造的に解消不能なループ**になる（実例:
regression-gate が test-cases.md の誤分類を fixable として報告 → code-fixer が guard に阻止され halt）。

guard の動作は正しい。欠陥は routing 側にあり、「routing 先の fixer が合法に書けない file への
fixable finding」は最初から escalation（operator 判断）に倒すべきである。

### 確立済みの不変（単一ソース）: fixer 別の正典書込可能集合

各 fixer が合法に書ける正典 file は、その step の `writes()` 宣言 ∩ 正典集合で一意に定まる。
現行コードから確認した集合は以下（`src/core/step/write-scope.ts` + 既存テスト
`tests/unit/step/write-scope-rules-consistency.test.ts` で固定済み）:

| fixer (FixTarget) | 宣言 write に含まれる正典 | 合法に書ける正典 |
|---|---|---|
| `code-fixer`  | なし（`code-fixer.ts:155` は gitState folder のみ）        | ∅ |
| `build-fixer` | なし（`build-fixer.ts:70` は gitState folder のみ）        | ∅ |
| `implementer` | **tasks.md**（`implementer.ts:176` が `verify:false` で宣言） | **{tasks.md}** |
| `spec-fixer`  | spec.md / design.md（`spec-fixer.ts:99-105`）               | {spec.md, design.md} |

`commit-push.ts:544` は `writes().filter(artifact !== "gitState")` を declaredWritePaths とするため、
implementer の tasks.md 宣言は guard を通過する（＝ implementer は tasks.md を合法に書ける）。

### request.md の主張との相違（本設計で解消する仕様矛盾）

request.md は「request.md / tasks.md / test-cases.md はどの fixer も書けないため、これらへの
fixable finding は fixTarget によらず常に escalation になる」と記述する。しかし上表のとおり
**implementer は tasks.md を合法に書ける**（既存テストで固定された不変）。したがって tasks.md への
finding が実効 fixer=implementer に routing される場合は write-scope loop は発生せず、escalation は
過剰反応（over-escalation）となる。本設計は architect 採用方針「fixable = 実効 fixer が合法に書ける」
に忠実に従い、**tasks.md は「実効 fixer が tasks.md を書けない場合に限り escalation」** とする
（詳細は D2 / Open Questions）。request.md / test-cases.md / attestation はどの fixer の宣言 write にも
含まれないため、これらは実効 fixer によらず常に escalation となり、request.md の主張と一致する。

## Goals / Non-Goals

**Goals**:

- 判定層（pure）に file-aware escalation 規則を追加し、「実効 fixer が合法に書けない保護正典 file への
  fixable finding」を needs-fix でなく escalation 要因として扱う（R1 / R2）。
- `deriveJudgeVerdict` / `deriveRegressionGateVerdict` / `deriveConformanceVerdict` に規則を適用し、
  step-completion で正典集合・fixer 別書込可能集合を渡す（R2）。
- findings-ledger 経路（`collectFindingsLedger` / `collectParallelFixerFindings`）が fixer prompt に渡す
  集合から該当 finding を除外し、除外があった round / gate の verdict が escalation に倒れることを保証する（R3）。
- escalation reason に該当 finding の file / title と「operator の適用が必要」の旨を含める（R2）。
- 非正典 file への routing、spec-fixer の正典（spec.md / design.md）routing、decision-needed / critical /
  high の既存規則を不変に保つ（R4）。

**Non-Goals**:

- spec-fixer の write-set 拡張（test-cases.md 等の条件付き許可）。TC ID 凍結規律との整合を要する別議論。
- operator 修正の半自動化（escalation 後の適用支援）。
- custom reviewer の finding schema 変更。
- write-scope guard（commit 層）の変更。guard は正しく、本設計は routing 側のみを直す。
- transition table の変更。escalation verdict は既存の terminal fallback（`pipeline.ts:366` の `?? "escalate"`）
  で awaiting-resume に落ちる既存経路を再利用する。

## Decisions

### D1: 判定ロジックを pure module に分離する（`canon-escalation.ts`）

新規 pure module `src/core/step/canon-escalation.ts` を追加する。import は型（`Finding` / `FixTarget`）のみ。
slug も write-scope も import しない。エクスポート:

- `interface CanonWriteScope { canonPaths: ReadonlySet<string>; writableByFixer: ReadonlyMap<FixTarget, ReadonlySet<string>>; }`
  — 正典集合と fixer 別書込可能集合。両方とも引数で受け取り、判定関数内では I/O しない。
- `selectUnroutableCanonFindings(findings, scope, resolveEffectiveFixer): Finding[]`
  — `f.resolution === "fixable"` かつ `scope.canonPaths.has(f.file)` かつ
  `!(scope.writableByFixer.get(resolveEffectiveFixer(f)) ?? ∅).has(f.file)` を満たす finding を返す。
- `buildCanonEscalationReason(findings): string` — file / title / 実効 fixer / operator 適用の必要性を含む
  reason 文字列を構築する。
- 実効 fixer resolver: judge / regression-gate 用 `judgeEffectiveFixer = () => "code-fixer"` と、
  conformance 用 `conformanceEffectiveFixer = (f) => f.fixTarget ?? "implementer"`。

`judge-verdict.ts` は `canon-escalation.ts` を import する（両者 pure、型のみ依存で純粋性を保つ）。

**Rationale**: request の「正典集合は引数で渡す形で純粋性を保てる」に従い、判定を pure に保つ。file/title の
reason 構築を verdict 関数から切り離し、独立した unit テスト面を得る。

**Alternatives considered**: (a) judge-verdict.ts に直接ロジックを埋める → reason 構築と verdict 導出が
混ざりテストしづらい。(b) write-scope.ts を judge-verdict から import → 純粋性・leaf 性を破る（却下）。

### D2: 書込可能性は「実効 fixer の宣言 write ∩ 正典」で判定する（target-aware, 単一ソース）

「保護正典なら一律 escalation」は spec-fixer の正当な正典修正ルート（conformance `needs-fix:spec-fixer`）を
殺す過剰反応であり、implementer の正当な tasks.md 修正ルートも殺す。architect 採用方針に従い、
「fixable = 実効 fixer が合法に書ける」を単一の判定基準とする。fixer 別書込可能集合は各 fixer の
`writes()` 宣言 ∩ `protectedCanonPaths(slug)` から導出し（単一ソース）、判定関数へ引数で渡す。

この結果、Context の相違点（tasks.md + implementer）は escalation にならず `needs-fix:implementer` のまま
routing される。これは既存テスト（write-scope-rules-consistency）で固定された不変
「tasks.md ∉ forbiddenWritePaths(implementer)」と整合し、implementer による正当な tasks.md 修正を殺さない。

**Rationale**: routing の欠陥（書けない fixer への routing）だけを正確に直す最小変更。既存の合法な正典修正
ルート（spec-fixer→spec/design、implementer→tasks）を保存する。

**Alternatives considered**: (a) 「正典なら一律 escalation」→ spec-fixer / implementer の合法ルートを殺す
（却下、request の spec-fixer 保存要件とも矛盾）。(b) fixer 側で正典 finding を skip して続行 → 「指摘が
握り潰されたが green」の無言弱体化（却下）。

### D3: 実効 fixer は verdict 関数ごとに解決する

- `deriveJudgeVerdict`（code-review / custom reviewer）と `deriveRegressionGateVerdict`（regression-gate）:
  routing は finding.fixTarget を見ず常に code-fixer へ倒す（`reviewer-chain.ts` の needs-fix → code-fixer /
  approved+fixable → code-fixer）。したがって実効 fixer = **code-fixer 固定**。code-fixer は正典を一切
  書けないため、これらの経路では正典 fixable finding は file によらず常に escalation。
- `deriveConformanceVerdict`: routing は fixTarget 別（`types.ts:266-270` の needs-fix:spec-fixer /
  implementer / code-fixer）。実効 fixer = **`f.fixTarget ?? "implementer"`**（`aggregateFixTarget` の
  default と一致）。ここで spec.md/design.md + spec-fixer、tasks.md + implementer は書込可能 → 非 escalation。

**Rationale**: 「実効 routing 先 fixer」は各 verdict 関数の実際の routing 規則に一致させる必要がある。
judge/regression は fixTarget を無視して code-fixer へ倒すのが現実であり、それに合わせる。

### D4: 各 verdict 関数への適用と step-completion での配線

3 つの verdict 関数に **optional 4th 引数 `canonScope?: CanonWriteScope`** を追加する（省略時は現行挙動と
完全同一 — 後方互換の additive 変更）。`judgeVerdictFn` 型（`src/core/port/step-types.ts:284`）も 4th
optional 引数を許すよう widen する（3-arg 関数は依然 assignable、既存 assign は不変）。

- `deriveJudgeVerdict(findings, ok, evidence?, canonScope?)`: decision-needed / vacuous / ok=false の
  既存 escalation の後、`canonScope` があり `selectUnroutableCanonFindings(findings, canonScope, judgeEffectiveFixer)`
  が非空なら **escalation**。以降は現行（critical/high → needs-fix、else approved）。
- `deriveRegressionGateVerdict(findings, ok, evidence?, canonScope?)`: 同様に fixable → needs-fix の
  **前** に canon 判定を挿入し、非空なら escalation。
- `deriveConformanceVerdict(findings, ok, evidence?, canonScope?)`: base = `deriveJudgeVerdict(findings, ok, evidence)`
  （canonScope は渡さない — conformance は独自 resolver を使う）。base が escalation ならそのまま返す。
  次に `selectUnroutableCanonFindings(findings, canonScope, conformanceEffectiveFixer)` が非空なら escalation。
  それ以外は現行（`needs-fix:${aggregateFixTarget}`）。

配線は `src/core/step/step-completion.ts` の既存 verdict 導出点（:149-169）で行う。finding-ref 検証失敗時の
escalation 上書き（:200-211）と同じ層で、`canonScope` を構築して各 verdict 関数に渡す。

**Rationale**: R2 の「3 関数に R1 を適用」を満たしつつ、optional 引数で後方互換を保つ（既存テストの期待は
不変）。配線点は finding-ref override と同一層で、機械的に判定可能。

### D5: `canonScope` の構築（wiring, 単一ソース from writes()）

新規 wiring 関数（例 `src/core/step/canon-write-scope.ts` の `buildCanonWriteScope(state, deps): CanonWriteScope`）:

- `canonPaths = new Set(protectedCanonPaths(deps.slug))`（write-scope から import）。
- `writableByFixer`: 各 fixer step（`CodeFixerStep` / `BuildFixerStep` / `ImplementerStep` / `SpecFixerStep`）の
  `writes(state, deps)` を呼び、`artifact !== "gitState"` の path を canonPaths と交差した集合を FixTarget
  キーで格納する。これにより writableByFixer は各 fixer の `writes()` を単一ソースとして自動追随する
  （spec-fixer の write-set が将来変われば自動で反映）。

step-completion / regression-gate / code-fixer はこの関数を呼んで `canonScope` を得る。

**Rationale**: fixer 別書込可能集合を `writes()` から導出することで、write-scope guard と escalation 判定が
同一の真実（宣言 write）を参照し、drift を構造的に排除する。

**Alternatives considered**: 明示 map をハードコード → `writes()` との drift 源になる（採る場合は drift-guard
テスト必須）。import cycle が生じる場合のみ、明示 map + 各 fixer writes() との一致を assert する drift-guard
テストへ fallback する（実装時に cycle 有無を検証）。

### D6: escalation reason の plumbing

`StepCompletion`（`step-completion.ts:73`）に **optional `escalationReason?: string`** を追加する。
`deriveStepCompletion` は verdict が canon 由来で escalation になった場合
（`selectUnroutableCanonFindings(...)` 非空）に `buildCanonEscalationReason(...)` の結果を設定する。

`src/core/step/commit-orchestrator.ts` の `commitSuccess`（:316-382）で、`verdict === "escalation"` かつ
`completion.escalationReason` があるとき `state.error = { code: "CANON_FINDING_ESCALATION", message: escalationReason, hint: ... }`
を設定してから persist する。これにより `pipeline.ts:428-443` の escalate 分岐が
`resumePoint.reason = state.error.message` を用いる。`CANON_FINDING_ESCALATION` は `FATAL_ERROR_CODES`
（`pipeline.ts:19`）に含めない → `awaiting-resume` に落ちる（failed でない）。

**Rationale**: 既存の escalate 経路（awaiting-resume + resumePoint）を再利用し、reason だけを供給する。
既存の escalation（vacuous / finding-ref）は `escalationReason` を設定しないため挙動不変。

### D7: findings-ledger 経路の整合（R3）

`src/core/pipeline/findings-ledger.ts` の 2 関数に optional `canonScope?: CanonWriteScope` を追加する:

- `collectFindingsLedger(reviewerChain, state, canonScope?)`: 出力から
  `selectUnroutableCanonFindings(..., judgeEffectiveFixer)` 該当分を除外する（regression-gate は
  needs-fix → code-fixer なので実効 fixer = code-fixer）。
- `collectParallelFixerFindings(state, members, canonScope?)`: 同様に除外する（coordinator needs-fix →
  code-fixer）。

呼び出し側（`regression-gate.ts` の buildMessage / skipWhen、`code-fixer.ts:207`）は
`buildCanonWriteScope(state, deps)` を渡す。

**除外時の escalation 保証**は verdict 層が担う（D4）。正典 fixable finding を観測した reviewer round /
regression-gate は `deriveJudgeVerdict` / `deriveRegressionGateVerdict`（canonScope 付き）で escalation を
返すため、その round / gate は fixer に到達せず escalation に倒れる。ledger 除外は「（historical / resolved
含む）正典 finding が fixer prompt に決して届かない」ための防御層であり、verdict 層と二重で不変を守る。

`collectFindingsLedger` に対し「除外時に gate を強制 escalation」する別 seam は**追加しない**。理由:
未解決の正典 finding は発生 round で既に escalation 済みで converged な gate に到達しない一方、
operator が解決済みの historical 正典 finding（immutable な過去 StepRun に残る）を gate で再 escalation
すると解消不能な再ループを生むため。したがって ledger 層は除外のみ、escalation は verdict 層に一元化する。

**Rationale**: R3 の意図（fixer に「直せない findings」が届かない／除外があれば escalation に倒れる）を、
verdict 層の escalation + ledger 層の除外という二層で満たしつつ、historical-resolved の再ループを避ける。

## Risks / Trade-offs

- [Risk] 混在 round（正典 fixable + 非正典 fixable が同一 round）→ escalation dominates。非正典 finding も
  operator 解決・resume まで保留される。→ Mitigation: R3 の「除外があれば round が escalation に倒れる」に
  合致。operator が正典分を解決し resume すると、次 round で非正典分が再提示され通常 routing に戻る。
- [Risk] parallel member の canon-escalation reason は coordinator が verdict 文字列に集約するため generic に
  なりうる。→ Mitigation: member の StepRun には reason を記録。主要な reason plumbing は sequential 経路
  （regression-gate / code-review / conformance）と unit（`buildCanonEscalationReason`）で保証する。
  #890 実例の regression-gate は sequential step であり主経路に含まれる。
- [Risk] `writableByFixer` と実際の fixer `writes()` の drift。→ Mitigation: D5 で `writes()` から導出し drift を
  排除。明示 map へ fallback する場合は drift-guard テストで一致を固定する。
- [Risk] step-completion / wiring module が fixer step を import して cycle を生む可能性。→ Mitigation: 実装時に
  cycle 有無を検証。cycle があれば明示 map + drift-guard へ切替。

## Open Questions

- **tasks.md + implementer の扱い（仕様矛盾の解消方針）**: 本設計は D2 に従い「tasks.md は実効 fixer が
  tasks.md を書けない場合に限り escalation、fixTarget=implementer（conformance）では needs-fix:implementer を
  維持」とした。これは request.md の「tasks.md は fixTarget によらず常に escalation」の記述と相違するが、
  既存テストで固定された不変「implementer は tasks.md を合法に書ける」に整合し、over-escalation を避ける
  正確な扱いである。受け入れ基準のうち「tasks.md への fixable finding が fixTarget によらず escalation」の
  一項は、この target-aware 挙動へ修正する（tasks.md + code-fixer/spec-fixer/build-fixer/judge・regression
  経路 default → escalation、tasks.md + implementer → needs-fix:implementer）。spec-review / operator の確認を
  仰ぐ。request.md / test-cases.md / attestation は引き続き fixTarget によらず常に escalation。
