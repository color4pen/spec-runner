# Cross-boundary invariants review — iteration 3

## Scope and evidence

- `git diff main...HEAD --stat` で 44 files / 5238 insertions / 86 deletionsを確認した。
- `design.md` と `tasks.md` を通読し、remediation の「全 site を同一 iteration で修正する」契約を、既存の fixer routing / write scope / ledger 境界まで追跡した。
- 前周対象の `src/core/step/canon-escalation.ts` を現在の内容で読み直した。主 file が非 canon でも protected canon の副 site を検査するようになっており、前周 F-001 の具体例は解消済みである。
- `src/core/step/judge-verdict.ts`、`src/core/pipeline/findings-ledger.ts`、`src/core/pipeline/spec-observation.ts` と各 fixer の write-set 宣言を照合した。
- PR 上の verification 証跡を正本とし、test / lint / typecheck は重複実行していない。

## Findings

### F-001 — HIGH / fixable — 非 canon の副 site は effective fixer の write scope 外でも routing を通過する

- **File**: `src/core/step/canon-escalation.ts:100`
- **Rationale**: 前周修正は remediation site の検査を追加したが、対象を `scope.canonPaths` に含まれる path に限定している。新契約では同じ不変条件の site が fixer 境界をまたげるため、これは一般の write-scope 判定にはならない。具体的には conformance が主 site `specrunner/changes/<slug>/spec.md`、副 site `src/core/step/foo.ts`、`fixTarget: "spec-fixer"` の finding を返すと、主 site は spec-fixer writable canon であり、副 siteは非 canonなので無視される。`deriveConformanceVerdict` は `needs-fix:spec-fixer` を返し、spec-fixer prompt は両 site の同時修正を必須にするが、spec-fixer の宣言 write set は change-folder 正典に限られるため `src/**` を合法的に修正できない。同様に spec-review の finding が writable spec artifact を主 file、非 canon 実装 path を副 site に持つ場合も routable と分類される。実装前には finding が単一 file だけだったため protected canon の片方向検査で足りたが、全 site 契約の導入により「effective fixer は列挙された全 site を書ける」という、変更外 routing が暗黙に依存する前提が破られている。
- **Remediation**:
  - **Invariant**: 全 site 修正を要求する finding は、主 file と remediation sites のすべてが effective fixer の宣言 write scope に入る場合だけその fixer に routing できる。
  - **Sites**:
    - `src/core/step/canon-escalation.ts:100`
    - `src/core/step/canon-escalation.ts:143`
    - `src/core/step/judge-verdict.ts:173`
    - `src/core/step/judge-verdict.ts:94`
    - `src/core/step/write-scope.ts:94`
  - **Approach**: canon path の集合だけを持つ判定を remediation routing の一般判定として流用せず、effective fixer の実際の宣言 write scope に対して主 file＋全 remediation site を検査する共有 predicate を設ける。少なくとも spec-fixer の明示的な change-folder write set 外の site を fail-closed に escalation し、canon-only の既存互換判定と ledger filtering も同じ分類結果を利用する。

## Observations

なし。
