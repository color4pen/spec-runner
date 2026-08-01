# Tasks: 欠落指摘 finding の構造化宣言と反転検証

## T-01: Finding 型と parseFindings に `fileMissing` を追加

対象: `src/kernel/report-result.ts`, `src/core/port/report-result.ts`

- [x] `src/kernel/report-result.ts` の `Finding` interface に optional フィールドを追加する:
      `fileMissing?: boolean`。doc コメントで「true = この finding は `file` の欠落自体を指摘する。
      absent/false = 従来挙動（file は実在する箇所を指す）」を明記する（`origin` と同様の additive
      discriminator）。
- [x] `src/core/port/report-result.ts` の `parseFindings` で、`f["fileMissing"] === true` のときのみ
      `finding.fileMissing = true` を設定する（`origin` の silent-capture パターンに倣う。true 以外は
      無視、missingFields には入れない）。strict モードの options 検証等は変更しない。

**Acceptance Criteria**:

- `Finding` 型に `fileMissing?: boolean` が存在し、既存の必須/optional フィールドは不変。
- `parseFindings` が `fileMissing: true` を持つ入力で `finding.fileMissing === true` を返す。
- `fileMissing` が absent / false / 非 boolean の入力では `finding.fileMissing` が未設定になる。
- `fileMissing` の有無で parse 成否は変わらない（既存の findings 必須/検証挙動に regression なし）。

## T-02: 4 tool schema の finding に `fileMissing` を追加し description に規約を明記

対象: `src/core/step/report-tool.ts`

- [x] `findingSchema`（JUDGE / CODE_REVIEW / REQUEST_REVIEW が共有）に
      `fileMissing: optional(boolean())` を追加する（`boolean` は既に import 済み）。
- [x] `conformanceFindingSchema`（CONFORMANCE 専用）に同じく `fileMissing: optional(boolean())` を
      追加する。
- [x] `JUDGE_REPORT_TOOL` / `CODE_REVIEW_REPORT_TOOL` / `CONFORMANCE_REPORT_TOOL` /
      `REQUEST_REVIEW_REPORT_TOOL` の description の finding 要素説明に次の規約を追記する:
      「`fileMissing?: boolean` — あるべきファイルが存在しないこと自体を指摘する場合に true。
      このとき `file` には欠落している path を書く（line は不要）」。prompt 本文（system prompt）は
      増築しない。

**Acceptance Criteria**:

- 4 tool の `zodSchema` の finding 要素に `fileMissing` が含まれ、`toJSONSchema` 生成の input_schema に
      反映される。
- 4 tool の description に `fileMissing` の用途（欠落指摘で true、file に欠落 path を書く）が明記される。
- 既存フィールド（severity/resolution/file/line/title/rationale/options/fixTarget/origin）の schema と
      description は不変。

## T-03: step-completion の finding-ref 検証を宣言別に分割・反転する

対象: `src/core/step/step-completion.ts`（現行 :238-256 の ref 検証ブロック）

- [x] `affectingFindings`（`collectVerdictAffectingFindings` の結果、対象集合は不変）を
      `fileMissing === true` の**欠落宣言群**と、それ以外の**非宣言群**に分割する。
- [x] 非宣言群: 従来通り `{ file, line }` の `FindingRef[]` を構築し `verifyFindingRefs` に渡す。
      返却（非実在部分集合）が 1 件でもあれば上書き条件を満たす（hallucination；従来挙動）。
- [x] 欠落宣言群: `{ file }` のみ（`line` を渡さない、D4）の `FindingRef[]` を構築し
      `verifyFindingRefs` に渡す。返却された非実在集合の file 集合を作り、**その集合に含まれない**
      欠落宣言 file（= 実在してしまっている = 虚偽宣言）が 1 件でもあれば上書き条件を満たす。
- [x] いずれかの群が上書き条件を満たしたときのみ `verdict = "escalation"` と
      `verdictOverriddenByFindingRef = true` を設定する。両群とも満たさなければ verdict 導出結果
      （routing 付き）をそのまま保持する。
- [x] seam のシグネチャ・呼び出し契約（`FindingRef[]` を渡し非実在部分集合を受け取る）は変更しない。
      `state.branch ?? null` / `deps.cwd ?? process.cwd()` の渡し方も従来通り。
- [x] `verdictOverriddenByFindingRef` を立てる経路は従来同様 escalationReason 計算を抑止する
      （`:300-321` は無変更）。

参考ロジック（両群を独立に評価し OR）:

```
const missingDecl = affectingFindings.filter((f) => f.fileMissing === true);
const regular     = affectingFindings.filter((f) => f.fileMissing !== true);
let override = false;

if (regular.length > 0) {
  const nonExistent = await verifyFindingRefs(
    regular.map((f) => ({ file: f.file, line: f.line })), cwd, branch);
  if (nonExistent.length > 0) override = true;   // 非宣言なのに不在 → 上書き
}

if (missingDecl.length > 0) {
  const nonExistent = await verifyFindingRefs(
    missingDecl.map((f) => ({ file: f.file })), cwd, branch);   // line なし
  const absent = new Set(nonExistent.map((r) => r.file));
  const falseDecl = missingDecl.filter((f) => !absent.has(f.file));  // 欠落宣言なのに実在
  if (falseDecl.length > 0) override = true;
}

if (override) { verdict = "escalation"; verdictOverriddenByFindingRef = true; }
```

（規模が小さいため、非宣言群で override 確定時に欠落宣言群の seam 呼び出しを短絡するのは任意の最適化。）

**Acceptance Criteria**:

- 欠落宣言 finding が実在しない file を指すとき、escalation 上書きが起きず routing 付き verdict が
      保たれる。
- 欠落宣言 finding が実在する file を指すとき、escalation に上書きされる。
- 非宣言 finding が実在しない file を指すとき、従来通り escalation に上書きされ
      `verdictOverriddenByFindingRef` が立つ。
- 欠落宣言群の ref に `line` が渡らない。
- `verifyFindingRefs` の呼び出しシグネチャと seam 契約は不変。

## T-04: step-completion 反転検証の verdict シナリオ歯を新設（mock seam）

対象: `src/core/step/__tests__/`（新規テストファイル、例
`step-completion-missing-file-finding.test.ts`）

`deriveStepCompletion` を、`verifyFindingRefs` を mock した `runtimeStrategy` 付き `deps` で呼び、
`permissionScope: undefined`（scope 合成を無効化）で以下を固定する。judge step は
`JUDGE_REPORT_TOOL` を使い、必要に応じ `judgeVerdictFn = deriveRegressionGateVerdict` を設定して
#916 の needs-fix 導出を再現する。

- [x] **シナリオ歯（#916 再現）**: verdict 導出が needs-fix 系を返す finding（critical/high または
      decision-needed）が `fileMissing:true` かつ実在しない file を指す（mock seam が当該 ref を
      非実在として返す）→ `completion.verdict` が needs-fix 系のまま（escalation でない）。
- [x] **虚偽宣言**: `fileMissing:true` だが file が実在する（mock seam が当該 ref を返さない）→
      `completion.verdict === "escalation"`。
- [x] **回帰保護**: 非宣言 finding（`fileMissing` 無し）の file が実在しない（mock seam が非実在で返す）
      → `completion.verdict === "escalation"` かつ `completion.escalationReason === undefined`
      （上書き経路が escalationReason を抑止することを直接固定；この歯は本 request で新設）。
- [x] mock `verifyFindingRefs` は「入力 ref のうち mock が定義する非実在 file 集合に一致するものだけを
      返す」実装とし、欠落宣言群で `line` を含まない ref が渡ることも合わせて確認する。

**Acceptance Criteria**:

- 上記 3 シナリオがそれぞれ独立テストとして pass する。
- 回帰保護テストが `verdict === "escalation"` と `escalationReason === undefined` の両方を assert する。
- テストは `deriveStepCompletion` の公開シグネチャのみを使い、内部実装に依存しない。

## T-05: runtime 対称性の歯を新設（real LocalRuntime / real ManagedRuntime 経由）

対象: `src/core/step/__tests__/`（T-04 と同一ファイルまたは併設ファイル）

呼び出し側の反転ロジックが runtime 非依存であることを、`deriveStepCompletion` に実 runtime を
`deps.runtimeStrategy` として注入して固定する（seam 実装は無変更）。

- [x] **local**: `LocalRuntime` を temp worktree（`fs.mkdtemp`）上に構築。欠落宣言 finding が
      「存在しない path」を指すケース → 上書きなし（routing 保持）、「存在する path」を指すケース →
      escalation 上書き、を確認する（`state.branch = "main"`, `deps.cwd = tempDir`）。
- [x] **managed**: `ManagedRuntime` を mock `githubClient.getRawFile` 付きで構築。`getRawFile` が
      null を返す（欠落）→ 上書きなし、非 null を返す（実在）→ escalation 上書き、を確認する
      （`state.branch = "main"`）。
- [x] 同一入力条件（欠落宣言 + file 有無）に対し local / managed の判定（上書き有無）が一致することを
      対（パラメタライズ可）で示す。

**Acceptance Criteria**:

- local / managed 両 runtime 経由で、欠落宣言 finding の valid（不在）→ routing 保持、
      false（実在）→ escalation 上書き、が同一結果になる。
- 既存の seam 単体テスト（`tests/unit/core/runtime/verify-finding-refs.test.ts` TC-VFR-L/M-*、
      `src/core/runtime/__tests__/managed-verify-finding-refs.test.ts`）は無変更で green のまま。

## T-06: 検証（typecheck && test）

- [x] `bun run typecheck` が error なし。
- [x] `bun run test` が全 pass（新規 T-04 / T-05 + 既存全て）。
- [x] 既存テスト（`managed-verify-finding-refs.test.ts`, `verify-finding-refs.test.ts`,
      step-completion / judge-verdict 系）が無変更で green。

**Acceptance Criteria**:

- `bun run typecheck` exit code 0。
- `bun run test` exit code 0。
- 既存テストファイルへの変更が無い（新設テストの追加のみ）。
