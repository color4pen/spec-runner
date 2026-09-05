# Cross-boundary invariants review — iteration 2

## Scope and evidence

- `git diff main...HEAD --stat` で 43 files / 5147 insertions / 81 deletions を確認した。
- `design.md` と `tasks.md` を通読し、remediation の全 site 契約と canon routing / no-op detection の境界を追跡した。
- 前周 finding の対象だった `src/core/step/canon-escalation.ts`、`src/core/step/executor.ts`、`src/core/step/no-op-detect.ts` を現在の内容で読み直した。
- 前周 F-002 は、executor が主 file と全 remediation site を `findingTargetPaths` に渡し、既存の `pipelineManagedPaths` cap も維持しているため解消済みと確認した。
- PR 上の verification 証跡を正本とし、test / lint / typecheck は重複実行していない。

## Findings

### F-001 — HIGH / fixable — 主 file が非 canon だと保護正典の副 site が依然 routing を迂回する

- **File**: `src/core/step/canon-escalation.ts:89`
- **Rationale**: 前周修正は主 `finding.file` が canon である場合の副 site 検査を追加したが、89 行目で主 file が非 canon なら remediation を見る前に `false` を返す。具体的には、(1) code-review/custom reviewer が主 site `src/core/step/foo.ts`、副 site `specrunner/changes/<slug>/request.md` の fixable finding を報告する、(2) code-fixer の writable canon set は空だが主 siteが非 canonなので `selectUnroutableCanonFindings` は finding を選ばない、(3) verdict は `needs-fix` となり code-fixer に routing され、prompt は両 site の同時修正を要求する、(4) code-fixer は保護正典 `request.md` を合法的に書けず、契約どおりの修正が不可能になる。このため前周修正は「主 site が writable canon」の例だけを塞いでおり、「修正対象の全 path を routing 前に検査する」という不変条件には未達である。同じ早期 return は `selectRoutableCanonFindings` にもあり、spec-review で主 file が非 canon・副 site が canon の組合せを全 site 単位で分類できない。
- **Remediation**:
  - **Invariant**: fixer へ routing する前に、主 file が canon かどうかに関係なく、finding が修正を要求する全 canon path がその fixer の write scope 内でなければならない。
  - **Sites**:
    - `src/core/step/canon-escalation.ts:89`
    - `src/core/step/canon-escalation.ts:134`
    - `src/core/step/judge-verdict.ts:55`
    - `src/core/pipeline/findings-ledger.ts:64`
  - **Approach**: 主 `finding.file` と `remediation.sites[].file` の和集合を先に作り、その集合に canon path が一つでもあれば全 canon member の writable 判定を行う。主 file が非 canonでも unwritable canon 副 site があれば unroutable とし、routable/unroutable selector の補集合関係と ledger filtering に同じ判定を共有させる。legacy remediation なし finding の挙動は維持する。

## Observations

なし。
