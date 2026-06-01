# Design: arch-closure-src-wide

## Context

`architecture/model.md` §3 は全 7 層（composition-root / domain / ports / adapters / persistence / shared-kernel / leaf）の許可 edge を DSM matrix として完備定義している。しかし現状の arch test（`core-invariants.test.ts`）は **invariant 別 grep** で、スキャン対象が以下のように偏る:

- B-1 / B-2 / B-6 / B-8: `src/core` のみ
- B-3: 列挙した shared-kernel dir + store
- B-4: `src/util` のみ
- B-7: `src/core` + `src/cli`

結果、以下が全くスキャンされていない:

1. **`src/adapter/`**: §3 で「adapters → domain ✗ / comp-root ✗ / persist ✗」と定義されているが、歯がない。実際に adapter→domain 方向の import が複数存在する（claude-code, codex, managed-agent が `core/event/`, `core/types.ts`, `core/step/`, `core/tools/`, `core/lifecycle/`, `core/agent/` を直接 import）。
2. **`src/kernel/`**: `event-bus-interface-demote` (#491) で新設された物理ディレクトリ。各ファイルが「import ゼロ」原則を宣言しているが、歯がない。

model.md §6（113 行）はこれを明示的に「目標の歯」として記載している。本 change はその実装。

## Goals / Non-Goals

**Goals**:
- §3 DSM matrix を src 全体の closure 検査に compile する
- `adapter/` と `src/kernel/` を含む全層の import edge を §3 whitelist と突合する
- 現状の divergence を grep authoritative に全件 scan し allowlist で凍結（today green）
- allowlist に無い新規 edge で red になる regression guard を確立する

**Non-Goals**:
- 既存 B-1〜B-9 invariant 別 test の書き換え・統合（無改変で維持）
- `architecture/model.md` の編集（authority doc は人間 gate）
- divergence の修正（歯を立てて凍結するまで。解消は後続 burn-down）
- 振る舞い変更

## Decisions

### D1: §3 DSM matrix を TypeScript データとしてエンコード

**選択**: §3 の 7×7+1 matrix を `Record<LayerName, Set<LayerName>>` 形式の adjacency list として `core-invariants.test.ts` 内に定義。各層の「許可 target 集合」を明示し、集合に無い edge は自動的に forbidden。

**Rationale**:
- §3 の表を 1:1 で転写できる。human が matrix を見ながらコード上の定義を照合可能。
- 新規層追加時は matrix に行/列を追加するだけ。
- `Set.has()` で O(1) lookup。

**Alternatives considered**:
- forbidden edge リスト（「禁止」を列挙）: 層数が増えると組み合わせ爆発。allowed を列挙する方が §3 と一致し管理が容易。

### D2: 層分類器（layer classifier）をパス prefix ベースで実装

**選択**: ファイルパスを §2 の mapping テーブルに基づいて層名に分類する関数を定義。分類ルール:

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

`src/kernel/` は model.md §2 に未分類の新層だが、各ファイルが「import ゼロ」原則を宣言しているため leaf 相当として扱う。model.md §2 への正式分類は本 change のスコープ外。

**Rationale**:
- パス prefix は model.md §2 の mapping 表と直接対応する。
- より長い prefix が先にマッチする（`core/runtime/` > `core/port/` > `core/`）longest-match 方式で曖昧さを排除。

### D3: import edge の解析 — 全 src/ を一括スキャンし分類

**選択**: `grep -rEn 'from ["'"'"']' src/` で全 import を一括取得し、各 match を:
1. source ファイルパス → 層に分類
2. import 先 → 相対パスなら解決して層に分類 / `@anthropic-ai/*`, `@openai/*` なら ext-SDK / それ以外（`node:*`, `zod` 等）はスキップ

**Rationale**:
- 一括スキャンにより「未知の import を見逃す」リスクを排除。per-layer grep では新ディレクトリ追加時にスキャン漏れが起きうる。
- ext-SDK の検出を import path パターンで行うことで、`@anthropic-ai/*` が adapters 以外に現れたらどの層でも forbidden edge として検出される。

**Alternatives considered**:
- per-layer grep（既存 B-1〜B-9 方式）: 既存 test との一貫性はあるが、「スキャン漏れ」が本 change の背景にある問題そのもの。全層スキャンが本 change の存在意義。

### D4: 新規 `describe` ブロックとして `core-invariants.test.ts` に追加

**選択**: 既存 `core-invariants.test.ts` 末尾に新しい `describe("DSM closure — §3 全層 whitelist enforcement")` を追加。既存 B-1〜B-9 ブロックは一切変更しない。

**Rationale**:
- request の「追加のみ scope」制約を厳守。
- 並行 change が既存 B-# テストを編集しても 3-way merge 衝突しない。
- 既存 helper 関数（`grepE`, `parseGrepOutput`, `filterViolations` 等）を再利用。

### D5: allowlist 拡張 — 既存 `arch-allowlist.ts` に `"DSM"` invariant エントリを追加

**選択**: 新しい closure test で検出される divergence は既存の `arch-allowlist.ts` に `invariant: "DSM"` として追加。tracking は `DSM-<source-layer>-<target-layer>-<short-id>` 形式。

**Rationale**:
- 単一の allowlist ファイルで全 divergence を管理（分散しない）。
- `"DSM"` invariant tag で既存 B-# エントリと明確に区別。
- 既存の ratchet governance（CODEOWNERS gate、削除のみ許容）がそのまま適用される。

### D6: ports → domain (△) の扱い

**選択**: §3 の「△¹ — VO のみ」は closure test では「ports → domain = forbidden」として扱い、現状の type import を allowlist で grandfather する。

**Rationale**:
- 「VO のみ」の判定を grep で機械的に行うのは困難（`type` keyword の有無だけでは VO かどうか判断できない）。
- strict に forbidden とし allowlist で凍結する方が ratchet として確実。将来 VO を shared-kernel に降格すれば allowlist エントリを削除できる。

### D7: 3rd party パッケージ（zod, node:* 等）は scope 外

**選択**: §3 DSM は src/ 内の層間依存のみを対象とし、`node:*` builtins や `zod` 等の一般 npm パッケージは分類・検査しない。ext-SDK は `@anthropic-ai/*` と `@openai/*` のみ。

**Rationale**:
- §3 の「ext-SDK」列は AI SDK を指す文脈で使われている。一般パッケージの依存制約は別の機構（e.g., package.json の peer/optional）で管理すべき。
- scope を広げすぎると false positive が増え、allowlist が膨張する。

## Risks / Trade-offs

- [Risk] 一括スキャンは test 実行時間が増加する → Mitigation: grep は高速。src/ 全体でも数百 ms 以内に完了する見込み。既存 B-1〜B-9 も grep ベースで問題なし。
- [Risk] 相対パスの解決が不正確（`../` の深さ計算ミス等） → Mitigation: source file のディレクトリ + import path を `path.resolve` で解決し、`src/` prefix で trim。単体テスト可能な helper として実装。
- [Risk] allowlist エントリ数が多くなる（adapter→domain の既知 divergence が 10+ 件） → Mitigation: 各エントリに tracking ID と comment を付け、後続 burn-down で体系的に削除可能にする。
- [Risk] `src/kernel/` を leaf 扱いだが、model.md §2 に正式分類がない → Mitigation: test 内のコメントで「model.md §2 への正式分類は別途」と明記。各 kernel ファイルの docstring が import ゼロを宣言しており、実態と一致。

## Open Questions

- なし。
