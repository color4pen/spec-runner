# Conformance Result — job-list-archive-skip — iteration 001

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | yes | T-01〜T-04 すべてのチェックボックスが [x] |
| design.md | yes (with note) | D1/D3 は実装と一致。D2 の「opt-in 不要」表に `resolve-target.ts` / `resolve-job.ts` が誤記載されているが実装は正しく、spec 対象外のため conformance 上の問題なし |
| spec.md | yes | 全 SHALL/MUST および全シナリオを実装が満たす |
| request.md | yes | 全 5 件の受け入れ基準を充足（テスト green、archive ロード 0 確認済み） |

---

## J-1: Tasks Completeness

T-01、T-02、T-03、T-04 — すべてのチェックボックスが `[x]`。問題なし。

---

## J-2: Design Decisions vs. Implementation

**D1** — `opts?: { includeArchived?: boolean }` を `JobStateStore.list` に追加。`job-state-store.ts:210` で正確に実装されている。`opts?.includeArchived === true` の条件分岐で archive ディレクトリ走査をガードしており、既存呼び出し元は変更なしで速いデフォルトを得る。✓

**D2** — Caller audit の「opt-in 不要」表に `src/core/finish/resolve-target.ts` と `src/core/resume/resolve-job.ts` が掲載されているが、実装は両者に `{ includeArchived: true }` を渡す。tasks.md T-02 は「required for existing multi-slug tests」と明記しており、finish/resume でアーカイブ済みスラグを解決する実用上の必要性が存在する。spec.md はこれら 2 ファイルの挙動を規定していないため spec 違反はなく、conformance 判定への影響はない。design.md の表が実態と乖離している点は documentation 上の問題にとどまる（code review finding #1: low/no-fix 認識済み）。

**D3** — `src/store/__tests__/job-state-store-archive-skip.test.ts` が作成され、`vi.mock` で `fs.readdir` を spy し TC-ARC-01/02 を実装している。✓

---

## J-3: Spec Requirements (SHALL/MUST) and Scenarios

**Requirement 1**: `JobStateStore.list` SHALL skip archive scan by default / MUST accept `includeArchived`
- `job-state-store.ts:210`: シグネチャ `static async list(repoRoot: string, opts?: { includeArchived?: boolean })` — 要件適合 ✓
- `job-state-store.ts:243`: `if (opts?.includeArchived === true)` で archive ブロックをガード — デフォルトでスキップ ✓
- Scenario "default list skips archive directory" → TC-ARC-01 が `fs.readdir` spy で archive path へのコールがゼロであることをアサート ✓
- Scenario "opt-in returns archived states" → TC-ARC-02 が `{ includeArchived: true }` で 3 件の archived state が返ることをアサート ✓

**Requirement 2**: `job ls` default / `--active` SHALL NOT load archived states
- `ps.ts:130`: `{ includeArchived: opts.all === true || opts.status === "archived" }` — `--all`/`--status archived` 非指定時は `false` が渡り archive スキャン実行なし ✓
- Scenario "default `job ls`" / "`--all` includes archived" / "`--status archived` includes archived": 実装が全 3 ケースを正しく処理 ✓

**Requirement 3**: inbox tick SHALL NOT load archived states
- `run-inbox.ts:86`: `JobStateStore.list(repoRoot)` — opts なし ✓
- `run-inbox.ts:331`: `JobStateStore.list(repoRoot)` — opts なし ✓
- Scenario "inbox tick with large archive": 実装レベルの適合は確認。inbox 経路を直接 assert するテストは不在だが（code review finding #2: low/no-fix 認識済み）、TC-ARC-01 がストア層で同等の保証を提供。

---

## J-4: Acceptance Criteria (request.md)

| 受け入れ基準 | 判定 |
|---|---|
| archive を大量に置いた fixture で既定の `job ls` の archive ロード回数がゼロ | TC-ARC-01 が `fs.readdir` spy で 0 コールをアサート ✓ |
| `--all` で archived job が従来どおり表示される | `ps.ts:130` で `opts.all === true` 時に `includeArchived: true` ✓ |
| inbox run の経路で archived state がロードされない | line 86, 331 ともに opts なし ✓ |
| 既存テストが無変更で green | verification-result.md: test phase passed（全スイート green）✓ |
| `typecheck && test` が green | verification-result.md: typecheck passed（exit 0）、test passed ✓ |
