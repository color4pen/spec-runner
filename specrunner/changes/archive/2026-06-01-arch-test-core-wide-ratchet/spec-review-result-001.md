# Spec Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:    specification is complete, consistent, and ready for implementation
  - needs-fix:   specification has issues that must be resolved before implementation
  - escalation:  unresolvable conflicts, missing context, or requires human judgment
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | File | Description | How to Fix
- Valid Severity values (uppercase): CRITICAL | HIGH | MEDIUM | LOW
  - CRITICAL: production outage, data loss, security breach
  - HIGH:     functional failure, clear bug, no workaround — blocks approval
  - MEDIUM:   quality degradation, maintainability issue, future risk
  - LOW:      informational, style, minor improvement
- If no findings, write a table row with "None" or omit the table body.
- Approval is blocked when CRITICAL ≥ 1 OR HIGH ≥ 1.
-->

- **verdict**: needs-fix

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | Consistency | tasks.md (T-02) | B-3/B-4 テストのスキャン範囲記述が自己矛盾している。B-3 は冒頭で「shared-kernel (`src/parser/`, `src/config/`, `src/state/`) が `src/core/` を import していないことを assert」と書きながら、直後の括弧書きで「本 change は core scope のため…shared-kernel 側の歯は src-wide 拡張で追加」と後退している。B-4 も「`src/util/` が他モジュールを import していないことを assert」と書いた直後に「core scope からの参照確認。util 側の歯は src-wide で追加」と矛盾する。実装者が「core/ ファイルのみスキャンすべきか、parser/config/state/util もスキャンすべきか」を判断できない。 | T-02 の B-3/B-4 記述を一本化する。「本 change では B-3/B-4 の違反は core/ 外のファイルに起点があるため、直接スキャンは src-wide 拡張に委ねる。本 change の B-3/B-4 coverage は closure model チェック（core が domain→adapters 逆方向を import しないこと）で代替する」と明確化するか、あるいは「parser/config/state/util を B-3/B-4 のためにスキャンする（必要な allowlist エントリも T-01 に追加）」と明確化する。 |
| 2 | MEDIUM | Consistency | request.md (§2), tasks.md (T-01) | requirement §2 は「allowlist は R1=parser→core / R3=step-names back-edge / R4=util leaf 違反を網羅し」と明記しているが、T-01 の allowlist エントリには R1/R3/R4 が存在しない。これらの違反は非 core ファイル（`src/parser/`, `src/config/`, `src/state/`, `src/util/`）に起点があり、core-scoped テストからは検出されない。T-02 が上記ファイルをスキャンするなら対応 allowlist エントリが必要（未追加で test red）。スキャンしないなら requirement §2 の記述が誤り。どちらかに矛盾が生じる。 | 以下いずれかで解消する。(A) T-02 の B-3/B-4 で parser/config/state/util をスキャンする方針なら、T-01 に R1（`src/parser/request-md.ts` B-3 R1）・R3（`src/config/migrate.ts` B-3 R3、`src/state/schema.ts` B-3 R3）・R4（`src/util/slugify.ts` B-4 R4）の allowlist エントリを追加する。(B) core-only スキャン方針ならば request.md §2 の「allowlist は R1/R3/R4 を網羅し」を「本 change の allowlist は core-scoped 違反（R2/B-6/B-8）を対象とする。R1/R3/R4 の allowlist 化は src-wide 拡張 change で実施」に修正する。 |
| 3 | LOW | Completeness | tasks.md (T-01, T-03) | request.md §2 は「allowlist は…単一mutator を網羅し」と記載しているが、T-01 に単一mutator（`store.fail()` / `exit-guard` の raw status 書き）の allowlist エントリが存在せず、T-03 にも対応テストがない。`model.md` §5 では「（lifecycle）」扱いで B-# 番号が振られていないため、grep アサーション化が難しい面がある。 | request.md §2 の「単一mutator」に言及している箇所を「単一mutator は lifecycle 不変条件であり B-# grep 対象外のため本 change の allowlist・テスト対象から除外する。後続 change で enforcement 設計を別途検討する」と明記し、受け入れ基準との整合を取る。 |
| 4 | LOW | Accuracy | tasks.md (T-01) | T-01 の「B-8: `src/core/step/executor.ts` — `config.runtime` 分岐（3 箇所）」は実コードの grep 結果（L203/L208/L287/L295 の 4 件）と一致しない。file-level allowlist なら実害はないが、line-level フィルタを実装した場合に 4 件目が未 allowlist で test red になるリスクがある。 | コメントの「3 箇所」を「4 箇所」に修正するか、「allowlist はファイル単位で適用する（行単位ではない）」と設計ノートに明記して曖昧さを解消する。 |
