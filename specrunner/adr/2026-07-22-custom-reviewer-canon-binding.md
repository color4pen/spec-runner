# ADR-20260722: custom reviewer 承認を canonical 入力 hash に束縛し、全 skip を非 green にする

## ステータス

採択

## コンテキスト

`2026-07-21-approval-revision-binding` は承認済み custom reviewer の skip 判定に revision 束縛
（`approvedAtCommit == baselineCommit`）を導入し、stale 承認による reviewer 群 bypass を封鎖した。
ただし残存する 2 つの盲点は同 ADR のスコープ外として据え置かれた。

**盲点 1 — 正典変更が invalidation に見えない**

round の変更判定（`excludeChangeFolderPaths`）は `specrunner/changes/**` を一括で source-touched
リストから除外する。この除外は「reviewer 自身の findings commit で誤 invalidate しない」ための
正当な措置だが、正典文書（request.md / spec.md / design.md / tasks.md / test-cases.md）まで
巻き込んでいた。正典を変更しても除外により変更が source-touched に現れず、`parallel-review-round`
は `approvedAtCommit` を現在の baseline へ re-anchor して skip を維持する。「文書を修正したのに
reviewer が再走しない」事故経路が残存していた。

revision 束縛は「コードが動いたか」を検出するが、正典を監視しない reviewer（src 監視型）の
承認は正典変更後も生き残る。除外リストの調整だけでは activation paths が正典を含まない
reviewer に穴が残るため、独立した hash 束縛が必要と判断した。

**盲点 2 — 全 skip が approved に合流する**

`aggregateVerdict` は member verdicts が全て "skipped" の場合（および空配列）に approved を返す。
reviewer が構成されているのに 1 件も実検査が行われなかった round が green として合流し、
「検証実績ゼロは非 green」原則（typed 完了契約）と食い違っていた。

既存の下地:

- revision 束縛は `2026-07-21` で導入済み。`selectPendingMembers` は `baselineCommit` 非 null 時に
  `approvedAtCommit == baselineCommit` を skip 条件として要求する。
- `RuntimeStrategy.digestArtifacts(refs, cwd, branch)` は各ファイルの sha256 を返す
  （local: 実 hash / managed: hash null）。lineage 記録で使用中。
- `ReviewerStatus`（`src/kernel/reviewer-snapshot.ts`）は追加フィールドに対して後方互換。
  `operations.ts` の検証は name / status のみを検査する。
- managed runtime は `captureHeadSha` を持たないため `baselineCommit == null` → revision 照合無効の
  既存 fail-safe がある（`#886`）。

## 決定

### D1 — revision 束縛に canonHash を重ねた二重束縛

承認済み member の skip 条件を「revision（approvedAtCommit == baselineCommit）」かつ
「canon（record.canonHash == currentCanonHash）」の AND とする。

- **Rationale**: canonHash は activation 条件と独立に正典変更を検出する。除外リストの
  絞り込み（D5）だけでは src 監視型 reviewer の穴が残るため、hash 束縛が必要。
- **却下: 除外リストの絞り込みのみ** — 正典を監視しない reviewer に穴が残る。却下。
- **却下: skip 判定を廃止して毎回全再走** — 束縛が有効な限り skip は安全でありコスト過大。却下。

### D2 — canonHash は round 境界で一度計算し、判定は純粋関数

`ParallelReviewRound.run` の round 開始時に `digestArtifacts` を 1 回呼び `currentCanonHash` を
算出する。`selectPendingMembers` / `applyRoundResults` には引数として渡し、判定関数内では I/O を
行わない。

- **Rationale**: revision 束縛（PR #885）と同一構図。guard 内 I/O を避け、判定を state + 引数の
  純粋関数に保つことでテスト容易性と決定性を確保する。
- **却下: 判定関数内で hash を計算** — guard 内 I/O で純粋性を破壊する。却下。

### D3 — canonHash の算出と serialization

対象は `canonicalDocPaths(slug)` = `specrunner/changes/<slug>/` 直下の request.md / spec.md /
design.md / tasks.md / test-cases.md（5 種、固定集合）。

- `digestArtifacts` の結果から hash が非 null のもの（存在するファイル）のみを採用する。
- 採用 refs を path で昇順ソートし、`path:hash` を `|` 区切りで連結した文字列を canonHash とする。
  等値比較のみに用いるため再 hash は不要。
- 採用 refs が 0 件（全欠損 / managed 全 null）→ canonHash = null（検証不能）。
- 純粋関数 `computeCanonHash(refs: ArtifactRef[]): string | null` として `reviewer-status.ts` に置く。

`ReviewerStatus` に `canonHash?: string | null` を追加する（JSDoc: 承認時点の正典文書集合の内容
hash。null / 欠落 = legacy または検証不能 → skip 判定で fail-closed）。state.json の
reviewerStatuses projection として round-trip し、`operations.ts` の検証コードは変更不要（意図的に
触らない）。

- **却下: 合成に再度 sha256 を掛ける** — 判定層に crypto 依存が増えるだけで等値比較に利得なし。却下。
- **却下: 別 top-level 構造** — reviewer status と分離する利点がなく round-trip が複雑化。却下。

### D4 — selectPendingMembers の判定順序と undefined / null の区別

`selectPendingMembers(statuses, members, baselineCommit?, currentCanonHash?)` の approved member の
判定順序:

1. `status === "skipped"` → skip（既存）。
2. `status !== "approved"` → pending（既存）。
3. `baselineCommit == null` → **skip**（managed fail-safe short-circuit、canon に到達しない）。
4. `approvedAtCommit != baselineCommit` → pending（revision 不一致）。
5. `currentCanonHash === undefined` → skip（canon 束縛が engaged していない後方互換。real runtime では到達しない）。
6. `currentCanonHash === null` → pending（canon 束縛 engaged だが検証不能 → fail-closed）。
7. `!isBoundToCanonHash(record)` → pending（legacy / unavailable record → fail-closed）。
8. `record.canonHash !== currentCanonHash` → pending（正典変更）。
9. 一致 → skip。

managed（baselineCommit == null）は 3 で短絡し canon に到達しないため、既存の managed fail-safe
挙動は不変。`undefined`（束縛未 engaged）と `null`（engaged だが不能）を区別することで、
canon binding を呼ばない既存 unit test / legacy caller の挙動を壊さない。

- **却下: undefined も一律 fail-closed** — canon binding なしの test fake が全て再走に倒れて
  大量に破壊される。production では到達しない分岐のためのテスト破壊は不当。却下。

### D5 — 除外を pipeline 出力に限定する（正典文書は保持）

`excludeChangeFolderPaths` を `excludePipelineManagedChangePaths` に改称し、セマンティクスを
「change folder 内のうち正典文書**以外**を除外」に変更する。判定は allowlist 方式:

- `isCanonicalDocPath(path)`（`src/util/paths.ts` に新設）: `specrunner/changes/<slug>/` 直下の
  basename が {request.md, spec.md, design.md, tasks.md, test-cases.md} のいずれかを canon と判定。
  archive / canceled 配下（深さ 3 以上）は canon 扱いしない。
- change folder 外 → 保持 / change folder 内かつ canon → 保持 / それ以外 → 除外。

旧関数 `excludeChangeFolderPaths` は `@deprecated` 付きで保持（既存テストの参照のため）。

- **却下: denylist で pipeline 出力パターンを列挙** — 出力種別追加時に漏れると findings が
  source-touched に混入し誤 invalidation を招く。allowlist の方が堅牢。却下。

### D6 — 全 skip → escalation（member 0 は approved）と resume での再現

`aggregateVerdict` を次に変更する:

- 空配列 → approved（member 0 = 機能未使用、既存）。
- escalation を含む → escalation（既存優先）。
- needs-fix を含む → needs-fix（既存優先）。
- 非空かつ全 "skipped" → **escalation**（checked=0 → 判定不能）。
- それ以外（1 件以上 approved を含む混在）→ approved（既存）。

全 skip の場合、`applyRoundResults` を抑止して member を pending のまま残す（既存の
`inspectionEscalated` と同じ fail-closed パターン）。これにより resume で fan-out が再走し、
同じ escalation が再現される（skip 確定による resume 迂回を塞ぐ）。

`ROUND_ALL_MEMBERS_SKIPPED` roundError を設定し、end-of-pipeline で `awaiting-resume` へ遷移する。
`state.error` は `pushStepResult`（`...state` スプレッド）により後続ステップ成功後も維持される。

**blast radius（重要）**: activation 不一致で全 member が skip する構成（典型: 単一 reviewer で
activation 不一致）では、従来 green 合流だった round が escalation に変わる。これは意図した
挙動変更であり、影響する既存テスト（`reviewer-status.test.ts` / `reviewer-activation-e2e.test.ts`）
の期待を更新する。

- **却下: 全 skip を warning 表示に留める** — 表示では合流判定が変わらず typed 完了契約と
  整合しない。却下。
- **却下: 全 skip で applyRoundResults を適用（skipped 確定）** — resume で escalation が迂回される
  穴が生じる。却下。

## 検討した代替案

### A1: 除外リストの絞り込みのみで対応

`excludeChangeFolderPaths` を pipeline 出力のみに絞り込み、正典文書の変更を source-touched に
現す。hash 束縛（D1）は追加しない案。

- **Pros**: 変更規模が小さい。
- **Cons**: activation paths が正典を含まない reviewer（src 監視型）の承認は正典変更後も生き残る。
  revision 一致・activation 不一致の reviewer は除外リスト絞り込みでは検出不能。
- **Why not**: 「reviewer 自身の定義に依存しない」正典変更の検出には独立した hash 束縛が必要（D1 採用）。

### A2: skip 判定を廃止して毎回全再走

承認済みでも毎回 fan-out し、skip を一切行わない案。

- **Pros**: 論理が最もシンプル。skip の正しさを証明する必要がない。
- **Cons**: LLM 実行コストが増大。revision 束縛（`2026-07-21`）の設計思想に反する。
- **Why not**: 束縛が有効な限り skip は安全であり、コスト過大。束縛をテストで固定する方針を維持（D1 却下）。

### A3: 全 skip を warning 表示に留める

aggregateVerdict を変えず、全 skip の round に対して UI で警告を出す案。

- **Pros**: 既存の合流ロジックを変えない。blast radius がない。
- **Cons**: 表示では合流判定が変わらず、typed 完了契約の「checked=0 → escalation」と食い違いが
  残る。「reviewer が構成されているのに何も検査されていない」round が green で合流し続ける。
- **Why not**: 非 green 化は typed 完了契約との整合要求であり、表示では不十分（D6 却下）。

### A4: legacy record の canonHash を自動補完して backward compat を維持する

既存の承認 record に canonHash がない場合、現在の canonHash を補完して有効扱いにする案。

- **Pros**: 既存の承認が全て再走に倒れない。ユーザー影響が小さい。
- **Cons**: 「legacy record が評価した時点の正典の状態」は不明であり、補完は事実に反する。
  fail-closed の一貫性を破壊し、正典変更の検出が不能になる。
- **Why not**: 証跡の不変性を保ちつつ、有効性判定のみを変える方針（D4 採用）。補完は根拠なき承認の
  捏造に相当する。

## 帰結

**新しいパイプライン不変条件（機械化済み）**:

custom reviewer の承認が skip に再利用されるには、(1) revision（approvedAtCommit == baselineCommit）
かつ (2) canonical 入力 hash（record.canonHash == currentCanonHash）の両方が一致しなければならない。
revision のみを検出する `2026-07-21` の単一束縛を二重束縛に強化し、正典変更による無効化を保証する。

**fail-closed の統一**:

- legacy record（canonHash 欠落）→ pending（再走）
- canon 検証不能（currentCanonHash == null）→ pending（再走）
- 正典変更（canonHash 不一致）→ pending（再走）
- managed short-circuit（baselineCommit == null）→ skip（既存 fail-safe の保存）

**allowlist による change folder 除外**:

正典 5 種以外は将来 pipeline 出力が増えても自動的に除外され続ける。正典文書は source-touched に
現れるため、activation paths を問わず正典変更は revision 差として観測可能になる。

**全 skip の非 green 化**:

reviewer が構成された round が「検証実績ゼロ」で green に合流する経路を閉じた。
activation 不一致による全 skip は resume で同じ判定が再現され、escalation が迂回されない。

**既存テストへの影響**:

- `reviewer-status.test.ts`: `aggregateVerdict(["skipped", "skipped"])` → `"escalation"` に更新。
- `reviewer-activation-e2e.test.ts`: 単一 reviewer が activation 不一致で全 skip する TC-ACT-01 /
  TC-ACT-02 / TC-ACT-04 の合流 verdict → `"awaiting-resume"` に更新。

## 影響を受けるモジュール

- `src/util/paths.ts` — `isCanonicalDocPath` / `canonicalDocPaths` を新設
- `src/core/pipeline/round-git-scope.ts` — `excludePipelineManagedChangePaths` 新設、旧関数 @deprecated
- `src/kernel/reviewer-snapshot.ts` — `ReviewerStatus.canonHash` 追加、`isBoundToCanonHash` 新設
- `src/core/pipeline/reviewer-status.ts` — `computeCanonHash`、`selectPendingMembers` / `applyRoundResults` の canon 引数化、`aggregateVerdict` 全 skip → escalation
- `src/core/pipeline/parallel-review-round.ts` — round 開始時 canonHash 算出、除外関数置換、全 skip escalation ロジック
- `src/core/pipeline/reviewer-chain.ts` — `ROUND_ALL_MEMBERS_SKIPPED` 専用 escalation 遷移
- `src/core/pipeline/pipeline.ts` — end-of-pipeline での `ROUND_ALL_MEMBERS_SKIPPED` 検出 → `awaiting-resume`

## 参考

- Change: `specrunner/changes/custom-reviewer-canon-binding/`
- 先行 ADR: `2026-07-21-approval-revision-binding`（revision 束縛の基盤）
- 関連: `2026-07-15-round-invalidation-source-scoped`（source-scoped invalidation の基盤）
- 先行実装: `src/core/archive/achieved-assurance.ts`（archive-time の content hash 束縛の同型パターン）
