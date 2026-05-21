# Spec Review Result: merged-to-archive-consolidation

- **verdict**: needs-fix
- **reviewed-at**: 2026-05-21

---

## Summary

design.md / tasks.md の方向性は正しい。ただし delta spec と tasks.md に **baseline 整合性を壊す問題が 2 件** あり、修正が必要。

---

## 問題 1（CRITICAL）: `request rm` の delta Requirement header が baseline と不一致

### 事実

- Baseline L592: `### Requirement: \`specrunner request rm <slug>\` は active 配下から request を削除する`
- Delta spec header: `### Requirement: \`specrunner request rm <slug>\` は **drafts** 配下から request を削除する`

### 影響

rules.md Rule 3 に従い、header が baseline と完全一致しない場合は ADDED（新規追加）として分類される。finish 後の baseline に以下が共存する：

- 旧 `active 配下から request を削除する`（削除されず残存）
- 新 `drafts 配下から request を削除する`（ADDED として追加）

acceptance criteria「`requests/active/` パス言及の完全消失」が達成されない。

### 修正方法

`## Renamed` セクションを追加:

```
## Renamed

- "`specrunner request rm <slug>` は active 配下から request を削除する" → "`specrunner request rm <slug>` は drafts 配下から request を削除する"
```

または、delta Requirement header を baseline と一致させたまま（"active" のまま）body だけを更新し、title 変更はアーキテクチャ上不要として諦める。

---

## 問題 2（CRITICAL）: `(flat パス対応)` 系 Requirements が未除去

### 事実

Baseline に以下の Requirements が残存しており、`requests/active/` を **primary path** として記述している：

| 行 | Requirement header | `requests/active/` 言及 |
|---|---|---|
| L671 | `specrunner request サブコマンド群が動作する（flat パス対応）` | L673, L678, L683, L688 |
| L690 | `specrunner job サブコマンド群が動作する（flat パス対応）` | L692, L697 |

delta spec が更新する L432 `request サブコマンド群が動作する` と L475 `job サブコマンド群が動作する` はこれらとは **別の Requirement** であり、`flat パス対応` 系は delta で触れていない。

### 影響

finish 後の baseline に：
- L432（delta で drafts に更新済み）
- L671（`requests/active/` が primary のまま残存）

が共存し、**矛盾する Requirements** が baseline に存在することになる。acceptance criteria の「完全消失」が達成されない。

### 修正方法

delta spec に `## Removed` セクションを追加:

```
## Removed

- "`specrunner request` サブコマンド群が動作する（flat パス対応）"
- "`specrunner job` サブコマンド群が動作する（flat パス対応）"
```

または、それぞれを MODIFIED で上書きする（header 完全一致が必要）。

---

## 問題 3（MUST FIX）: tasks.md の ADR path が rules.md 違反

### 事実

tasks.md Task 12:
```
**File**: `docs/adr/NNNN-merged-to-archive-consolidation.md`
```

rules.md の明示禁止事項：
- 「ADR の具体的な path / ファイル名は adr-gen 以外の step で記載しない」
- 「`docs/adr/` への言及・参照は禁止」

### 修正方法

Task 12 から `**File**:` 行を削除。adr-gen step に path 決定を委ねる。

---

## 問題 4（MEDIUM）: acceptance criteria と design.md の矛盾

acceptance criteria:
> cli-commands/spec.md 全行 grep で `requests/active/` / `requests/merged/` への path 言及が **完全消失**

design.md:
> L710-717, L739, L756-761 の `requests/active/` fallback 言及は **deprecation path として意図的に残存**

加えて L766 `job finish` requirement 本文にも `requests/active/` の自動選択への言及がある。

delta spec が意図的に残存させる範囲（fallback path）と、acceptance criteria が要求する「完全消失」が矛盾している。  
**design.md の "Out of Scope" 記述か、acceptance criteria を整合させること**。どちらを正とするかはユーザー判断。

spec-review として観察するに、今回の delta scope（問題 1・2 を修正後）で reach できる `requests/active/` 残存箇所：
- L710-716, L739, L756-761: fallback scenario（意図的残存）
- L766: `job finish` の旧 auto-detect 言及（Requirement 本体なので削除か書き換えが可能）

---

## 問題 5（MINOR）: tasks.md に `request-patterns.test.ts` coverage task が欠落

acceptance criteria 要件 9:
> `tests/unit/context/request-patterns.test.ts` (= archive 経路でカバレッジ拡大 test 追加)

tasks.md の Task 6-9 に `request-patterns.test.ts` の 151 件 coverage 拡大 test が含まれていない。受け入れ基準の達成に必要なため tasks.md に追加すること。

---

## 確認済み（問題なし）

- delta spec format（`## Requirements` セクション構造、Scenario 有無、MUST/SHALL keyword）: ✓
- header が一致する 5 Requirements（`--help`, `request new`, `request show`, `request サブコマンド群`, `job サブコマンド群`）の内容: ✓ 適切に baseline の old path を new path に置換している
- `delta-spec-validation-result.md`: approved ✓
- `specs/` と `delta-specs/` の二重配置: `specs/` が canonical（rules.md 準拠）、`delta-specs/` は参照されない見込みで実害なし
- security scope: slug validation（path traversal 防止）が全コマンドに明記されており OWASP 的な入力検証は問題なし
- design.md の src 変更方針（`MERGED_SUBDIR` 削除、`RequestState` 型削除、`request-migrate-flat.ts` 削除）: 論理的に一貫しており妥当
