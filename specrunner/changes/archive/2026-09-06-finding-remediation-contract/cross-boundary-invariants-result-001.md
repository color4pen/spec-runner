# Cross-boundary invariants review — iteration 1

## Scope and evidence

- `git diff main...HEAD --stat` で 39 files / 4962 insertions / 74 deletions を確認した。
- `design.md` と `tasks.md` を通読し、typed remediation が fixer prompt、ledger、regression-gate に渡る経路を確認した。
- 新しい `remediation.sites` と、変更されていない canon routing / fixer no-op detection の境界を追跡した。
- PR 上の verification 証跡を正本とし、test / lint / typecheck は重複実行していない。

## Findings

### F-001 — HIGH / fixable — remediation の副 site が fixer の write-scope 判定を迂回する

- **File**: `src/core/step/canon-escalation.ts:76`
- **Rationale**: fixer prompt は remediation に列挙された全 site の同時修正を必須にした一方、既存の `selectUnroutableCanonFindings` / `selectRoutableCanonFindings` は finding の主 `file` だけを `canonPaths` と fixer の writable set に照合している。したがって、主 site が writable（例: spec-review finding の `spec.md`）でも remediation の別 site が同じ change folder の `request.md` や `test-cases.md` なら、canon escalation は発火せず spec-fixer に渡る。spec-fixer はその副 site を書けないため、「全 site を同一 iteration で直す」という新契約を正常経路で履行できず、部分修正または staging/write-scope failure の反復になる。これは従来の「finding 1 件の修正対象は `finding.file` で代表できる」という暗黙の不変条件が、複数 site 契約によって破られたもの。
- **Remediation**:
  - **Invariant**: fixer へ routing する前に、finding が修正を要求する全 path がその fixer の write scope 内でなければならない。
  - **Sites**:
    - `src/core/step/canon-escalation.ts:76`
    - `src/core/pipeline/findings-ledger.ts:58`
    - `src/core/pipeline/findings-ledger.ts:164`
  - **Approach**: canon routability 判定の対象 path を主 `finding.file` と `remediation.sites[].file` の和集合へ拡張し、いずれかの必須 site が書けない finding は fixer に渡さず既存 escalation 経路へ倒す。legacy finding は従来どおり主 file のみを使う。

### F-002 — MEDIUM / fixable — remediation の副 site が no-op exemption に含まれない

- **File**: `src/core/step/executor.ts:522`
- **Rationale**: code-fixer の prompt は全 remediation site を修正対象として表示するが、executor は `collectRoutedFixerFindings(state).map(f => f.file)` だけを `findingTargetPaths` に渡す。`detectNoOp` はこの集合に含まれる path だけを artifact-prefix filtering から免除するため、finding の主 file ではなく remediation の副 site にある change artifact を正当に修正した run は、実作業を完了していても `sourceFiles.length === 0` となり verdict を `needs-fix` に上書きされる。既存 exemption の「reviewer が機械的に指定した全修正対象は artifact でも実作業として数える」という前提が、新しい複数 site 契約に追随していない。
- **Remediation**:
  - **Invariant**: fixer に機械的に渡された全修正対象 path は、pipeline-managed path を除き no-op 判定で同じ exemption を受ける。
  - **Sites**:
    - `src/core/step/executor.ts:522`
    - `src/core/step/routed-findings.ts:93`
    - `src/core/step/no-op-detect.ts:85`
  - **Approach**: routed findings から主 `file` と全 `remediation.sites[].file` を flatten / dedupe して `findingTargetPaths` に渡す。`pipelineManagedPaths` の cap は維持し、remediation のない persisted finding は従来どおり扱う。

## Observations

なし。
