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

- **verdict**: needs-fix

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | Behavioral regression | spec.md / design.md D5 / tasks.md T-06 | **"already MERGED" fast path が status 未確認のまま `cleanupAfterMerge` を呼び、folder 移動スキップによる不整合を引き起こす。** `runMergeThenArchive` の "PR already MERGED → `cleanupAfterMerge` のみ" 分岐は、`recordArchiveOnBranch` が実行済みであることを前提とした "冪等再実行" ルートとして設計されている。しかし `state.status` を確認しないまま早期 return するため、初回呼び出し時に PR が外部 merge 済み（`status === "awaiting-archive"`、記帳未実施）のケースでも `cleanupAfterMerge` に落ちる。この場合: `git checkout <base>` + pull 後、change folder は `changes/<slug>/`（記帳未済、移動なし）のまま。`resolveCanonicalStateDir` が active location を返すため `markJobArchived` は `changes/<slug>/state.json` に `archived` を書く。folder は `changes/archive/` に移動されず、`ps --all` は archived として検出するが folder が誤った場所に残る（旧コードは `runArchiveOrchestrator` を呼ぶことでこのケースでも folder を移動できていた）。spec.md の "既に merged なら cleanup のみ実行する" シナリオも `Given` に `status が archive-recorded` の条件が欠落しており、実装者がこの区別に気づけない。 | **D5 / T-06 を修正する**: "already MERGED" 検出後に `state.status` を確認し、`archive-recorded` の場合のみ `cleanupAfterMerge` に进む。`awaiting-archive`（記帳未実施）の場合はさらに分岐: (a) feature branch がまだ存在するなら `recordArchiveOnBranch` → `cleanupAfterMerge` の順で処理する、(b) feature branch が削除済みなら escalation を返しユーザーに手動対応ガイダンスを提示する。spec.md の当該シナリオの `Given` に `status が archive-recorded` の precondition を追記し、`awaiting-archive` + 外部 merge ケースは別シナリオ（escalation または recording-then-cleanup フロー）として明記すること。 |
| 2 | MEDIUM | Open question resolution | design.md [Q1] / tasks.md T-04 補足 | **[Q1] terminal `archived` の永続化先を spec-review で確定する（タスク補足に明示的に委任されている）。** 案A（merge 後 cwd の base checkout への local 編集）vs 案B（`.specrunner/local/<slug>/` terminal marker + `list()` 拡張）。 | **案A を採用する**（理由: 変更面が小さい、`list()` 波及なし、`ps --all` は既にローカルファイルシステムを直読みしているため動作モデルが一貫する、terminal `archived` は "このマシンが merge を確認した" というローカル観測であり git commit 不要）。tasks.md T-04 の「spec-review で確定する」注記を「案A 採用」に更新し、`cleanupAfterMerge` が案A 前提で記述されていることを確定として明記すること。留意事項: merge 後 `git pull --ff-only` が失敗した場合（ネットワーク断等）は `markJobArchived` の書き先が正しくない可能性があるため、`cleanupAfterMerge` の実装は pull 失敗時も continue して状態書き込みを試みるよう design.md に明記すること。 |
| 3 | LOW | Spec clarity | design.md D3 / tasks.md T-02 | **`reconcilePrState` の `awaiting-archive → archived` 遷移（D3 で残すエッジ）は folder 移動を伴わない点が明記されていない。** T-02 で `reconcilePrState` を `archive-recorded` にも対応させる拡張を追加しているが、`awaiting-archive → archived` 直接遷移（外部 merge 検出）で呼ばれた場合、change folder は `changes/<slug>/` に残ったまま `archived` 遷移するという既知の不整合（Q2 スコープ外）について設計文書に言及がなく、将来の実装者が混乱しうる。 | design.md D3 または D4 に「`reconcilePrState` の `awaiting-archive → archived` は status 整合のみを行い、change folder 移動は行わない。folder 移動のない `archived` 状態は Q2（スコープ外）として許容する」旨の 1 文を追加する。 |
| 4 | LOW | Spec clarity | design.md D1 / tasks.md T-05 | **no-worktree mode で `recordArchiveOnBranch` → `cleanupAfterMerge` (`--with-merge` 経路) の間に `git checkout <featureBranch>` → `git checkout <base>` と cwd のブランチが 2 回切り替わることが明記されていない。** 切り替えの順序・クリーン状態の前提（recordArchiveOnBranch がコミット済みで cwd が clean であること）が暗黙になっており、実装者が中間状態（uncommitted changes）を見逃すリスクがある。 | design.md D1 または D5 に「no-worktree mode では `recordArchiveOnBranch` が `git checkout <featureBranch>` で cwd を feature branch へ切り替え、コミット・push が完了した時点で cwd は clean 状態になる。その後 `cleanupAfterMerge` が `git checkout <base>` で base に戻る。この切り替えシーケンスを実装で保証し、uncommitted changes が残る場合はエラーとする」旨を明記すること。 |

## 詳細評価

### セキュリティ

- feature branch への push は既存の `createTransportAuth` パターンを踏襲しており、新たな認証面はない。
- slug / featureBranch は既存のジョブ状態ロードから取得するため、外部入力のインジェクション経路は追加されない。
- git コマンドは配列引数で呼び出しており、shell injection 不可。
- GitHub token 解決ロジック（best-effort）は既存と同一。OWASP Top 10 該当項目なし。

### 設計の整合性

- D1–D6 の設計判断は相互に一貫している。`recordArchiveOnBranch` / `cleanupAfterMerge` の分離（D2）、新 status `archive-recorded`（D3）、消費箇所の網羅列挙（D4）、`runMergeThenArchive` の再構成（D5）は要件を正しく反映している。
- ADR-20260603 を supersede する新 ADR の生成（D6）は adr-gen step に委任されており、本 spec-review の対象外。
- Migration Plan は適切（既存 `awaiting-archive` / `archived` 状態は無変更で互換、`archive-recorded` は新フロー後から発生）。
- finding #1 を修正すれば、要件1–6 はすべて spec に対応する Scenario が存在し、tasks の Acceptance Criteria にも反映されている。

### Q2 / Q3 スコープ外の扱い

- Q2（archive 未実施で外部 merge された PR の folder 後追い移動）はスコープ外として許容。finding #1 の修正で "fast path が Q2 ケースを黙って処理する" 問題は解消される。
- Q3（no-merge push 失敗の異常系）は escalation で十分。local commit が残るため再実行で回復できる。
