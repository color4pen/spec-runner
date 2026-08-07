# Test Cases: glob-unify

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual | gate
  **Priority**: must | should | could
  **Source**: reference to spec Scenario (spec.md > Requirement: <name> > Scenario: <name>) or design.md / tasks.md section

GIVEN/WHEN/THEN structure (mixed format — depends on TC type):
  Scenario 由来 TC (Source = spec.md > Requirement: <name> > Scenario: <name>):
    GWT は記述しない。Source 参照のみ。behavior の正典は spec の Scenario。
  非 Scenario 由来 TC (Source = design.md or tasks.md section):
    GWT は必須:
    **GIVEN** <preconditions>
    **WHEN** <action>
    **THEN** <expected result>
  gate TC:
    GWT は記述しない。充足を担う verification phase 名（または verification.commands の command 名）を本文に記録する。

Summary section MUST appear immediately after the title with ALL 4 items:
  ## Summary
  - **Total**: {count} cases
  - **Automated** (unit/integration): {count}
  - **Manual**: {count}
  - **Priority**: must: {count}, should: {count}, could: {count}

Result section MUST appear at the very end as a YAML code block:
  ## Result
  ```yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  ```

  所有権と書込時点: Result YAML は test-case-gen によるテストケース生成の結果記録である。
  生成時に一度だけ書かれ、後続ステップ（test-materialize を含む）は更新しない。

  `result` の値の意味:
  - completed = 全 TC の設計が完了し blocked_reasons が空
  - partial   = 一部 TC が設計不能で blocked_reasons に記録あり
  - failed    = 生成自体が成立しなかった
-->

## Summary

- **Total**: 18 cases
- **Automated** (unit/integration + gate): 12
- **Manual**: 6
- **Priority**: must: 16, should: 2, could: 0

---

### TC-001: `matchGlob` が src/ tests/ に存在しない

**Category**: gate
**Priority**: must
**Source**: spec.md > Requirement: glob matching 実装が 1 つだけ存在する > Scenario: `matchGlob` が src/ tests/ に存在しない

T-05 verification: `grep -rn '\bmatchGlob\b' src/ tests/` が 0 件

---

### TC-002: `matchesGlob` の本体が委譲のみ

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: glob matching 実装が 1 つだけ存在する > Scenario: `matchesGlob` の本体が委譲のみ

---

### TC-003: 構造テスト（shared-glob-match-imports）が通過する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `matchesGlob` の関数名が `src/util/glob-match.ts` で維持される > Scenario: 構造テスト TC-009 が通過する

---

### TC-004: `scope.ts` の `globMatch` 呼び出しが `(file, pattern)` 順

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: 消費者 3 ファイルの引数順が `(file, pattern)` に統一される > Scenario: `scope.ts` の呼び出し

---

### TC-005: `globMatch` で `?` が任意 1 文字にマッチする

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `?` wildcard が `globMatch` および `matchesGlob` で正しく動作する > Scenario: `?` を含むパターンが 1 文字にマッチする

---

### TC-006: `matchesGlob` でも `?` が wildcard として動く

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `?` wildcard が `globMatch` および `matchesGlob` で正しく動作する > Scenario: `matchesGlob` でも `?` が wildcard として動く

---

### TC-007: `a/**/b` が `a//b` にマッチしない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `**/` の segment 非空意味論が維持される > Scenario: 空 segment にマッチしない

---

### TC-008: `a/**/b` が `a/x/b` にマッチする

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `**/` の segment 非空意味論が維持される > Scenario: 非空 segment にはマッチする

---

### TC-009: 本番 pattern 代表ケース群が期待値を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 本番 pattern 形状で `globMatch` が正しく動作する > Scenario: 代表ケース群

---

### TC-010: `activation.ts` の `globMatch` 呼び出しが `(file, pattern)` 順

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** `src/core/reviewers/activation.ts` が `globMatch` に repoint された状態
**WHEN** L87 付近の呼び出しを確認する
**THEN** `globMatch(file, pattern)` の順（file が第 1 引数）である

---

### TC-011: `main-checkout-guard.ts` の `globMatch` 呼び出しが `(file, pattern)` 順

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** `src/core/step/main-checkout-guard.ts` が `globMatch` に repoint された状態
**WHEN** L76 付近の呼び出しを確認する
**THEN** `globMatch(filePath, g)` の順（filePath が第 1 引数）である

---

### TC-012: `src/util/glob-match.ts` の「2 実装は独立」注記コメントブロックが削除されている

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `src/util/glob-match.ts` が更新された状態
**WHEN** L71-79 付近を確認する
**THEN** 「2 実装は独立・統一はスコープ外」の注記コメントブロック（`// ---` 区切り含む）が存在しない

---

### TC-013: `src/core/reviewers/__tests__/glob-match.test.ts` が削除されている

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-04

T-05 verification: `ls src/core/reviewers/__tests__/glob-match.test.ts` でファイルが存在しない（exit code 非 0）

---

### TC-014: `globMatch` が literal `.` を任意文字として扱わない（injection safety）

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 > injection safety 移植

**GIVEN** `globMatch("src/auth.ts", "src/authXts")` を呼び出す
**WHEN** 実行する
**THEN** `false` を返す（pattern 内の `.` が regex の `.`（任意文字）ではなくリテラルとして escape されている）

---

### TC-015: `globMatch` が正規表現メタ文字 `(` `)` を含むパターンで正しく動く（injection safety）

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 > injection safety 移植

**GIVEN** `globMatch("(invalid)", "(invalid)")` および `globMatch("(invalid)", "invalid")` を呼び出す
**WHEN** 実行する
**THEN** 前者は `true`、後者は `false` を返す

---

### TC-016: `matchesGlob` で `?` がゼロ文字にマッチしない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 > matchesGlob 委譲テスト

**GIVEN** `matchesGlob("src/foo.ts", "src/foo?.ts")` を呼び出す（path が `foo.ts` で終わり、pattern の `?` 位置に対応する追加文字が存在しない）
**WHEN** 実行する
**THEN** `false` を返す（`?` は必ず 1 文字に対応し、ゼロ文字は許容しない）

---

### TC-017: `main-checkout-guard.ts` の doc comment が `step → util: globMatch` に更新されている

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-03 > doc comment 更新

**GIVEN** `src/core/step/main-checkout-guard.ts` が更新された状態
**WHEN** L12 付近の doc comment を確認する
**THEN** `step → util: globMatch` と記載されており、旧記述 `step → reviewers: matchGlob` は存在しない

---

### TC-018: `typecheck && test` が全て green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-05

T-05 verification: `bun run typecheck` および `bun run test` が共に exit code 0 で終了する（新規テスト含む全ケースが green）

---

## Result

```yaml
result: completed
total: 18
automated: 12
manual: 6
must: 16
should: 2
could: 0
blocked_reasons: []
```
