# ADR-20260601b: §3 DSM closure 検査を src 全体に拡張し、edge whitelist 突合で adapter/kernel 層を歯にする

**Date**: 2026-06-01
**Status**: accepted

## Context

`2026-06-01-arch-invariant-enforcement-vitest-ratchet` ADR は enforcement を `src/core/` に確立したが、Known Debt として以下を明示していた:

- **src-wide 拡張未完**: `src/adapter/`・`src/kernel/` 等は全くスキャンされていない。
- **dependency-cruiser 再検討**: src 全体への拡張時に "grep ベースのスケール限界が顕在化する可能性" があり、再評価を予告。
- **R1/R3/R4 の allowlist 化**: `src/adapter/`・`src/parser/` 等の既知 divergence は src-wide 拡張 change で対応。

`architecture/model.md` §3 の DSM matrix は 7 層（composition-root / domain / ports / adapters / persistence / shared-kernel / leaf）の許可 edge を完備定義しているが、既存 B-1〜B-9 test の「invariant 別 grep」ではこの matrix を src 全体に compile できていなかった。特に:

- `src/adapter/` は §3 で「adapters → domain ✗ / comp-root ✗ / persist ✗」と定義されているにもかかわらず、CI 上の歯がゼロだった（実際に adapter→domain 方向の import が 12 件存在）。
- `src/kernel/`（`event-bus-interface-demote` #491 で新設）は各ファイルが「import ゼロ」原則を宣言しているが、検証機構がなかった。

本 change（arch-closure-src-wide）はこれら Known Debt を解消する。

## Decision

### D1: DSM matrix を TypeScript adjacency list としてエンコード（dependency-cruiser は再度不採用）

§3 の 7×7+1 matrix を `Record<LayerName, Set<LayerName>>` 形式（DSM_WHITELIST）として `core-invariants.test.ts` 内に定義し、集合外の edge を自動的に forbidden とする closure 検査を実装する。

**dependency-cruiser を再度採用しない理由**:

- 前 ADR で懸念した "grep ベースのスケール限界" は src 全体（~1,700 件の import edge）に対して実測でも問題なかった（grep 数百 ms 以内、bun test 全体 3,289 件が green）。
- devDependency 追加・Bun 互換性不確実・設定ファイル分離というコストが依然として不均衡。
- TypeScript adjacency list は §3 の表を人間が照合しやすく、層追加時は matrix に行/列を追加するだけ。

**採用理由**:

- §3 の許可 edge 集合を完全に転写でき、new edge を集合外に追加した瞬間に red になる closure 保証を実現できる。
- `Set.has()` の O(1) lookup。スケール問題がないことを実測で確認済み。
- 既存 `grepE`, `parseGrepOutput`, `filterViolations` ヘルパーを再利用でき、新機構の導入コストが低い。

### D2: 層分類器を longest-match prefix ルールで実装

ファイルパスを §2 mapping 表に基づいて層名に分類する `classifyLayer` 関数を定義。より長い prefix が優先（`core/runtime/` > `core/port/` > `core/`）し、曖昧さを排除する。

| パス prefix | 層 |
|---|---|
| `src/cli/` | composition-root |
| `src/core/runtime/` | composition-root |
| `src/core/port/` | ports |
| `src/core/` (上記以外) | domain |
| `src/adapter/`, `src/auth/` | adapters |
| `src/store/` | persistence |
| `src/config/`, `src/state/`, `src/git/`, `src/parser/`, `src/prompts/`, `src/logger/`, `src/errors.ts`, `src/templates/` | shared-kernel |
| `src/util/` | leaf |
| `src/kernel/` | leaf（import ゼロ） |

### D3: 全 src/ を一括スキャンして import edge を DSM_WHITELIST と突合

`grep -rEn 'from ["\']' src/` で全 import を一括取得し、各 match を source/target 両方の層に分類して forbidden edge を検出する。per-layer grep（既存 B-1〜B-9 方式）ではなく全体スキャンとすることで「スキャン漏れ」を構造的に排除する。

ext-SDK は `@anthropic-ai/*` と `@openai/*` のみ対象。`node:*` builtins・`zod` 等の一般 npm パッケージは §3 の対象外とし、false positive を防ぐ。

### D4: `src/kernel/` を leaf 相当（import ゼロ）として扱う

`src/kernel/` は `architecture/model.md` §2 に未分類の新物理ディレクトリだが、各ファイルが import ゼロ原則を宣言している。本 change では leaf 相当として `classifyLayer` に追加し、任意の import を violation とする（allowlist 不使用）。model.md §2 への正式分類は authority doc の人間 gate 作業であり本 change のスコープ外。

### D5: ports → domain (△) を forbidden として allowlist で凍結

§3 の「△¹ — VO のみ」は closure test では「ports → domain = forbidden」として扱い、現状の type import 4 件を allowlist で grandfather する。

「VO のみ」の判定を grep で機械的に行うことは困難（`type` keyword の有無だけでは VO かどうか判断できない）。strict に forbidden とし allowlist で凍結する方が ratchet として確実。将来 VO を shared-kernel に降格すれば allowlist エントリを削除できる。

### D6: 新 `describe` ブロックとして追加し、既存 B-1〜B-9 を無改変で維持

既存 `core-invariants.test.ts` 末尾に `describe("DSM closure — §3 全層 whitelist enforcement")` を追加。既存 B-1〜B-9 ブロックを一切変更しない。並行 change が既存 B-# テストを編集しても 3-way merge 衝突を起こさない。

### D7: 現状 divergence を arch-allowlist.ts に `"DSM"` invariant として追加

新 closure 検査で検出される 21 件の divergence（adapter→domain 12 件・domain→comp-root 5 件・ports→domain 4 件）を既存 `arch-allowlist.ts` に `invariant: "DSM"`・`tracking: "DSM-<source>-<target>-<id>"` 形式で追加。既存の ratchet governance（CODEOWNERS gate・削除のみ許容）がそのまま適用される。

## Alternatives Considered

### Alternative 1: dependency-cruiser による静的解析（D1 の対抗案）

- **Pros**: 宣言的。`model.md` §3 の closure 表を `forbidden`/`allowed`/`required` に直接 compile できる。
- **Cons**: devDependency 追加が必要。Bun 互換性不確実。設定ファイル分離。no-new-dep 原則に抵触。
- **Why not**: 前 ADR で "src-wide 拡張時に再検討" としていたが、実測で grep スケール問題が顕在化しなかったため再度不採用。TypeScript adjacency list が §3 との照合容易性・型安全性・ゼロ依存の点で依然優位。

### Alternative 2: ports → domain (△) を allowed として検査対象外

- **Pros**: §3 の △ 注記に忠実。allowlist エントリが 4 件減る。
- **Cons**: "VO のみ" の判定を機械的に行えない。allowed とする範囲を曖昧にするとルールが形骸化する。
- **Why not**: strict forbidden + allowlist 凍結の方が ratchet として確実。VO を shared-kernel に降格するという改善ゴールが明確になる。

### Alternative 3: `src/kernel/` を model.md §2 に正式分類してから歯を立てる

- **Pros**: authority doc との整合性が先に確保される。
- **Cons**: authority doc は人間 gate 作業であり、スケジュールが不確定。その間 `src/kernel/` の import ゼロ原則が検証されない。
- **Why not**: test 内のコメントで「model.md §2 への正式分類は別途」と明記した上で leaf 扱いを先行実装し、実態（各ファイルの docstring が import ゼロ宣言）と enforcement を一致させる。

## Consequences

### Positive

- `src/adapter/`・`src/kernel/` を含む src 全層の import edge が CI で検証される。新規 forbidden edge は即日 red になる（closure 保証）。
- 前 ADR の Known Debt（src-wide 拡張未完・R1/R3/R4 allowlist 化）が解消される。
- 現状 21 件の divergence が authoritative scan で全件列挙・凍結され、後続 burn-down でエントリ削除という明確なゴールを持てる。
- DSM_WHITELIST が §3 matrix の唯一の機械形となり、model.md との sync 確認が人間の目視で行える。

### Negative

- allowlist エントリが 21 件増加する。特に adapter→domain 12 件は後続 burn-down で対応が必要。
- `classifyLayer` が null を返す未知ディレクトリを silent skip する（新 `src/` ディレクトリ追加時にスキャン漏れが生じる）。改善は任意（`console.warn` 等）。

### Known Debt

- **adapter→domain divergence 12 件**: `claude-code`, `codex`, `managed-agent` adapter が `core/event/`・`core/types.ts`・`core/step/`・`core/tools/`・`core/lifecycle/`・`core/agent/` を直接 import。後続 burn-down change で ports 経由に置き換える。
- **scan liveness 未アサート**: `forbiddenEdges.length >= dsmEntries.length` の事前条件アサートを追加すると `classifyLayer` regression 時の無音 green を防げる（review Finding 1、優先度 MEDIUM）。
- **`classifyLayer` unit test 未整備**: TC-001〜TC-023 の isolated assertion なし（integration test で暗黙的に実行）。保守性向上のための任意改善。

## References

- Request: `specrunner/changes/arch-closure-src-wide/request.md`
- Design: `specrunner/changes/arch-closure-src-wide/design.md`
- Delta spec: `specrunner/changes/arch-closure-src-wide/specs/module-boundary/spec.md`
- Review: `specrunner/changes/arch-closure-src-wide/review-feedback-001.md`
- 前 ADR: `specrunner/adr/2026-06-01-arch-invariant-enforcement-vitest-ratchet.md`
- `architecture/model.md` — §2 層 mapping・§3 DSM matrix・§6 enforcement 選択肢
- Implementation: `tests/unit/architecture/core-invariants.test.ts`・`tests/unit/architecture/arch-allowlist.ts`
