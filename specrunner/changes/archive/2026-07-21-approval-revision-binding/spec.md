# Spec: 承認の revision 束縛

自己完結の behavior 仕様。routing guard / commitOid 打刻 / custom reviewer 束縛が守るべき
Layer-1 挙動（型・FSM が自動では強制しない選択）を規定する。

## Requirements

### Requirement: verification passed の adr-gen / pr-create 短絡は conformance 承認 revision と一致する場合に限る

システムは、`verification passed` の transition で `to: adr-gen`（STANDARD）/ `to: pr-create`（FAST）へ短絡する
`when` guard を、**最新 conformance run が approved であり、かつ最新 conformance run の `commitOid` と最新
verification run の `commitOid` が共に非空で等しい場合に限り** true とする SHALL。いずれかを満たさないとき guard は
false を返し、フォールバック行 `verification passed → code-review` により reviewer chain へ再入する MUST。

#### Scenario: 再走で revision が動いた stale conformance 承認は短絡しない（criterion 1）

**Given** state に conformance approved（commitOid = C1）が記録され、その後 implementer 相当の run（commitOid = C2, C2 ≠ C1）と verification passed（commitOid = C2）が積まれている
**When** `verification passed` の transition 解決で guard が評価される
**Then** guard は false を返し、transition は adr-gen / pr-create へ**行かず** code-review へ入る

#### Scenario: revision が動いていなければ現行どおり短絡する（criterion 2）

**Given** 最新 conformance approved の commitOid と最新 verification passed の commitOid が等しい
**When** `verification passed` の transition 解決で guard が評価される
**Then** guard は true を返し、transition は adr-gen（STANDARD）/ pr-create（FAST）へ進む

#### Scenario: commitOid 欠落のレガシー承認は stale 扱い（criterion 3 / 6）

**Given** 最新 conformance approved run または最新 verification run のいずれかが `commitOid` を持たない
**When** `verification passed` の transition 解決で guard が評価される
**Then** guard は false を返し、transition は code-review へ入る（fail-closed）

#### Scenario: conformance 未実行の初回 verification は短絡しない

**Given** conformance run が state に存在しない
**When** `verification passed` の transition 解決で guard が評価される
**Then** guard は false を返し、transition は code-review へ入る

### Requirement: verification（CLI step）の StepRun に評価 revision の commitOid を打刻する

システムは、verification（CLI step）の実行で StepRun に `commitOid` を打刻する SHALL。値は verification が評価する
revision、すなわち **step.run() 実行前の worktree HEAD（entry HEAD）** とする MUST。`propagateVerificationResult`
が step.run() 内で verification-result を commit して HEAD を進めた**後**の HEAD を打刻してはならない MUST NOT。
`runtimeStrategy` が不在、または HEAD を取得できない場合は `commitOid` を未設定とする（fail-safe）SHALL。

#### Scenario: verification の commitOid は評価した revision（criterion 4）

**Given** verification step 開始時の worktree HEAD が C であり、step.run() 内で verification-result が commit され HEAD が C' へ進む
**When** verification が成功して StepRun が記録される
**Then** 記録された StepRun.commitOid は C（entry HEAD）であり、C'（result commit 後の HEAD）ではない

#### Scenario: runtimeStrategy 不在時は commitOid 未設定

**Given** deps に runtimeStrategy が無い
**When** verification が成功して StepRun が記録される
**Then** StepRun.commitOid は未設定（undefined）である

### Requirement: custom reviewer の resume skip は承認 revision と基準 revision の一致を要求する

システムは、`selectPendingMembers` に基準 commitOid を渡し、approved member を pending から除外（resume skip）する
条件を **「`approvedAtCommit` が非 null かつ基準 commitOid と一致する」場合に限る** SHALL。不一致または null の
approved member は pending へ戻す MUST。基準 commitOid が判定不能（null）な runtime では revision 照合を無効化し、
既存の status ベース除外挙動を保存する SHALL。

#### Scenario: 基準 commitOid 不一致の approved member は pending に戻る（criterion 5）

**Given** approved member の approvedAtCommit = C1（実値）で、基準 commitOid = C2（C2 ≠ C1）
**When** `selectPendingMembers` が呼ばれる
**Then** その member は pending に含まれる（skip されない）

#### Scenario: 基準 commitOid 一致の approved member は skip される（criterion 5 / req 7）

**Given** approved member の approvedAtCommit = C1 で、基準 commitOid = C1
**When** `selectPendingMembers` が呼ばれる
**Then** その member は pending に含まれない（resume skip 維持）

#### Scenario: approvedAtCommit 欠落の approved member は pending に戻る（criterion 3 / 6）

**Given** approved member の approvedAtCommit が null（レガシー record）で、基準 commitOid が非 null
**When** `selectPendingMembers` が呼ばれる
**Then** その member は pending に含まれる（fail-closed）

### Requirement: approved custom review 時に approvedAtCommit へ実値を設定する

システムは、custom reviewer round が member を approve するとき、その member の `approvedAtCommit` に round が評価した
source revision（fan-out 時点の HEAD）を実値として設定する SHALL。この値は round 自身の findings commit を含まない
MUST（既存 contract `2026-07-15-round-invalidation-source-scoped` D1 を保持）。

#### Scenario: approve で approvedAtCommit が実値を持つ（criterion 5）

**Given** custom reviewer round で member が approved verdict を返し、round 完了時の HEAD が sha である
**When** `applyRoundResults` が status を更新する
**Then** その member の status は approved、approvedAtCommit は sha（実値）である

### Requirement: source path 未接触の保留 approved member は基準 revision へ再アンカーされる

システムは、custom reviewer coordinator が、`listChangedFiles` が success（positive evidence）であり、かつ path-scoped
invalidation（`computeInvalidations`）が member を invalidate しなかった場合に限り、その保留 approved member の
`approvedAtCommit` を基準 commitOid へ再アンカーする SHALL。evidence が得られない（unavailable / managed）場合は
再アンカーしない MUST（fail-closed 側へ倒す）。これにより source-scoped invalidation（無関係な source 変更で保留
member を再走させない最適化）を保存する。

#### Scenario: 無関係な source 変更でも path 未接触 member は skip 維持（req 7 / source-scoped 保存）

**Given** approved member の activation path を fixer が触れておらず、`listChangedFiles` が success で基準 commitOid = C2
**When** coordinator が invalidation を評価する
**Then** その member は approved を保ち、approvedAtCommit が C2 へ再アンカーされ、次 round で skip される

#### Scenario: evidence 不能時は再アンカーせず fail-closed

**Given** `listChangedFiles` が unavailable（managed / 一時失敗）で approved member の approvedAtCommit = C1
**When** coordinator が invalidation を評価する
**Then** approvedAtCommit は C1 のまま（再アンカーされない）で、基準 commitOid 照合により pending へ倒れうる

### Requirement: conformance 承認後に code mutator が走った経路は reviewer chain へ再入する

システムは、conformance approved の後に code mutator（build-fixer 等）が commit で revision を動かした場合、
final verification passed で guard が false となり reviewer chain（code-review 以降）へ再入する SHALL。code mutator が
conformance の**前**に走り conformance が最終 revision を承認済みの経路では、現行どおり adr-gen / pr-create へ短絡する
MUST。再入経路は再承認後に `codeChangedSinceLastVerification` が false となり conformance → adr-gen へ収束し、
ループしない MUST。

#### Scenario: build-fixer が conformance 承認後に走ると code-review へ再入する（D4）

**Given** `conformance(approved, commitOid = C_conf) → verification(fail) → build-fixer(commit → C_bf) → verification(pass, entry HEAD = C_bf)` で C_bf ≠ C_conf
**When** final verification passed の transition が解決される
**Then** guard は false となり code-review へ再入し、その後 conformance が C_bf で再承認され adr-gen へ収束する（ループしない）

#### Scenario: code-fixer が conformance 承認前に走った経路は短絡を維持する

**Given** `code-fixer(commit) → conformance(approved, commitOid = C) → verification(pass, entry HEAD = C)`
**When** verification passed の transition が解決される
**Then** guard は true となり adr-gen へ進む（現行維持）
