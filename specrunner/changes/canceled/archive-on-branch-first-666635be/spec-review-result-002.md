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
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| None | — | — | — | — | — |

## spec-review-result-001 からの修正確認

spec-review-result-001.md が報告した 4 件の指摘を全件確認した。

| # | 旧 Severity | 件名 | 対応状況 |
|---|-------------|------|----------|
| 1 | HIGH | "already MERGED" 時 status 未確認で cleanup に落ちる不整合 | ✅ 解決済み |
| 2 | MEDIUM | [Q1] terminal `archived` 永続化先が未決定 | ✅ 解決済み |
| 3 | LOW | `reconcilePrState` の `awaiting-archive → archived` が folder 移動を伴わない旨が未明記 | ✅ 解決済み |
| 4 | LOW | no-worktree mode の 2 段ブランチ切り替えが未明記 | ✅ 解決済み |

### 旧 Finding #1（HIGH）— 解決確認

**D5**（design.md 125–131 行）が `getPullRequest` 後に `state.status` を明示的に確認するよう再定義されている:
- `MERGED` + `archive-recorded` → cleanup のみ（冪等再実行）
- `MERGED` + `awaiting-archive` → feature branch 存在確認 → `recordArchiveOnBranch` → cleanup、または branch 不在なら escalation

**spec.md**（"既に merged なら cleanup のみ" シナリオ）の Given に `status が archive-recorded`（記帳済み）が明記され、新たに「記帳未実施のまま外部 merge 済みの PR で `--with-merge` を実行する」シナリオが追加されている。

**T-06** の Acceptance Criteria が両ケース（`archive-recorded` / `awaiting-archive` × MERGED）を独立した判定で固定している。

### 旧 Finding #2（MEDIUM）— 解決確認

**design.md [Q1]** が "解決済み" としてマーク済み、案A（merge 後 cwd の base checkout への local 編集）採用が明記されている。

**D2 cleanupAfterMerge**（design.md 67 行）に「`git pull --ff-only` 失敗は非致命的エラーとして扱い、処理を continue して状態書き込みを試みる。警告ログを出力し再実行で回復可能な旨をユーザーに伝える」が追記されている。

**tasks.md 補足**に「案A（merge 後 cwd の base checkout への local 編集）で確定。案B は採用しない。T-04 の cleanupAfterMerge は案A を前提とする」が明記されている。

### 旧 Finding #3（LOW）— 解決確認

**D3**（design.md 88–90 行）に「ただし、この遷移は status 整合のみを行い change folder の移動を伴わない。`reconcilePrState` が `awaiting-archive → archived` を適用した場合、change folder は `changes/<slug>/` に残ったまま（既知の不整合）。folder 後追い移動は base 直編集を要するためスコープ外（[Q2]）」が明記されている。

### 旧 Finding #4（LOW）— 解決確認

**D1**（design.md 55 行）に「no-worktree mode のブランチ切り替えシーケンス」節が追加され、uncommitted changes 検出 → escalation、commit + push 完了時点で cwd が feature branch の clean state、`--with-merge` では続く cleanupAfterMerge が `git checkout <base>` を行うという 2 段切り替えシーケンスが明記されている。**D5**（design.md 137 行）にも同旨が重複記載されている。

## 詳細評価

### セキュリティ

- feature branch への push は既存の `createTransportAuth` / `wrapSpawn` パターンを踏襲し、新たな認証面は追加されない。
- slug / featureBranch / baseBranch はジョブ状態から取得するため、外部入力のインジェクション経路は追加されない。
- git コマンドは配列引数経由で実行され shell injection 経路なし。
- GitHub token 解決は既存の best-effort 解決を維持。
- OWASP Top 10 該当項目なし。

### 設計の整合性

- D1–D6 の設計判断は相互に一貫している。`recordArchiveOnBranch` / `cleanupAfterMerge` の分離（D2）、新 status `archive-recorded`（D3）、消費箇所の網羅列挙（D4）、`runMergeThenArchive` の再構成（D5）は要件 1–6 を正しく反映している。
- status lifecycle の不変「`archived` には merge が事実になった後にのみ到達する」は、(a) `archive-recorded` という中間状態と (b) `archived` 遷移を merge 確定経路に限定する制御フローの二重で保証されている。
- `assertJobFinishable` は `canTransition(status, "archived")` のまま変更なし。`awaiting-archive` / `archive-recorded` 双方が `archived` へ遷移可能なため finishable 判定が成立する（D3）。
- Migration Plan は既存 `awaiting-archive` / `archived` を無変換で互換し、新フロー後にのみ `archive-recorded` が発生する設計になっており、ダウングレード戦略（rollback 時 remap の検討）も記載されている。
- ADR-20260603 supersede の判断は D6 に明文化され、後退の受容根拠（branch 規律を上位要件に置く）が記録されている。adr-gen step への委任も明示されており、spec-review の対象外として適切。
- 要件 1–6 はすべて spec.md の Scenario として対応している。tasks.md の Acceptance Criteria との対応も完備している。

### 残留 Open Questions の確認

- Q1 は design.md で解決済み。
- Q2（外部 merge × folder 後追い移動）はスコープ外として設計上の許容範囲に収まっており、D3 に明記されている。
- Q3（push 先 feature branch が削除済みの異常系）は escalation で十分として設計上合意されており、D5(b) と spec.md の対応シナリオに反映されている。
