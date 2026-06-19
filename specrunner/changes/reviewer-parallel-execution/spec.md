# Spec: カスタムレビュワーの並列実行 + per-reviewer status tracking + invalidation

## Requirements

### Requirement: per-reviewer status を state に記録すること

pipeline は、custom reviewer を含む job について、各 custom reviewer の実行状態を
`JobState.reviewerStatuses` に記録 SHALL する。各レコードは `name` / `status`（`pending` | `approved` |
`skipped`）を持ち、approved になった reviewer は `approvedAtCommit`（承認時点の HEAD SHA）を持つ MUST。
`reviewerStatuses` が不在の既存 state は、coordinator 入口で全 member を `pending` として初期化 SHALL する
（後方互換）。

#### Scenario: approved reviewer の status が approvedAtCommit 付きで記録される

**Given** custom reviewer A / B を含む job で、並列 review の結果 A が approved になった状態
**When** pipeline が並列ラウンドを完了して state を persist する
**Then** `state.reviewerStatuses` に A のレコードが存在し、`status: "approved"` と非 null の
`approvedAtCommit` を持つ

#### Scenario: reviewerStatuses 不在の state が pending で初期化される

**Given** `reviewerStatuses` フィールドを持たない（旧形式の）job state で custom reviewer が 2 件ある状態
**When** pipeline が coordinator に入る
**Then** 各 custom reviewer の status が `pending` として初期化され、全 member が当該ラウンドで review 対象になる

### Requirement: custom reviewer の review フェーズを並列実行すること

pipeline は、custom reviewer が 2 件以上ある構成で、pending な custom reviewer の review フェーズを
**同時実行** SHALL する。code-review（built-in）は並列化対象外であり、code-review が clean approved に
なった後に custom reviewer 群の並列実行が開始 SHALL する。

#### Scenario: 2 件以上の custom reviewer が並列に review される

**Given** code-review が approved に達し、pending な custom reviewer A / B / C が存在する状態
**When** pipeline が coordinator（`custom-reviewers`）に入る
**Then** A / B / C の review セッションが同時に起動され、各自の result file が生成され、全 reviewer の
result file が feature branch に commit される

#### Scenario: code-review は custom reviewer の前段で直列収束する

**Given** code-review が needs-fix を出した状態
**When** pipeline が遷移を解決する
**Then** 次の step は code-fixer であり、custom reviewer の並列実行は code-review が clean approved に
なるまで開始されない

### Requirement: needs-fix の findings を集約して code-fixer に 1 回で渡すこと

pipeline は、並列 review 完了後に `needs-fix` の custom reviewer が 1 件以上あるとき、それら全 reviewer の
最新 findings を集約（重複排除）して **1 回の code-fixer セッション**に渡 SHALL する。全 custom reviewer が
`approved` のときは code-fixer を skip SHALL し、regression-gate へ進 SHALL む。

#### Scenario: 複数 reviewer の findings が集約されて 1 回の fixer に渡る

**Given** 並列 review の結果、reviewer A と B が共に needs-fix（それぞれ fixable findings を持つ）の状態
**When** pipeline が coordinator の `needs-fix` 出力の遷移を解決する
**Then** 次の step は code-fixer であり、code-fixer は A と B の findings を集約した内容を入力として
1 セッションで実行される

#### Scenario: 全 reviewer approved で fixer を skip して regression-gate へ進む

**Given** 並列 review の結果、全 custom reviewer が approved の状態
**When** pipeline が coordinator の `approved` 出力の遷移を解決する
**Then** 次の step は regression-gate であり、code-fixer は実行されない

### Requirement: fixer 後に activationPaths ベースで再 review 対象を絞ること（invalidation）

pipeline は、code-fixer 完了後に coordinator へ戻った時、`approved` 状態の各 custom reviewer について
承認時点（`approvedAtCommit`）から現 HEAD までの変更ファイルを取得し、その変更ファイルが reviewer の
`activationPaths` にマッチする（または `activationPaths` が未定義である）場合に、当該 reviewer を
`pending` に戻 SHALL す。pending に戻った reviewer のみが再 review SHALL される。activationPaths 外のみ
変更された reviewer は `approved` のまま再 review SHALL NOT される。

#### Scenario: activationPaths 内の変更で reviewer が再 review される

**Given** reviewer A（`paths: ["src/auth/**"]`）が approved、その後 code-fixer が `src/auth/login.ts` を
変更した状態
**When** pipeline が code-fixer から coordinator へ戻る
**Then** A の status が `pending`（invalidatedByCommit 付き）に戻り、A が再 review される

#### Scenario: activationPaths 外の変更では reviewer が再 review されない

**Given** reviewer A（`paths: ["src/auth/**"]`）が approved、その後 code-fixer が `src/ui/button.ts` のみを
変更した状態
**When** pipeline が code-fixer から coordinator へ戻る
**Then** A の status は `approved` のままで、A は再 review されない

#### Scenario: paths 未定義 reviewer は fixer 後に常に再 review される

**Given** reviewer C（`paths` / `requestTypes` 未定義 = always-activate）が approved、その後 code-fixer が
任意のファイルを変更した状態
**When** pipeline が code-fixer から coordinator へ戻る
**Then** C の status が `pending` に戻り、C が再 review される

### Requirement: 全 custom reviewer approved 後に regression-gate を実行すること

pipeline は、全 custom reviewer が `approved`（invalidation で pending に戻る reviewer が無い状態）に
なった後に regression-gate step を実行 SHALL する。regression-gate の累積 findings 台帳は reviewer chain
（`["code-review", ...custom reviewer names]`）の全 run から構築 SHALL され、coordinator の synthetic run は
台帳に含 SHALL NOT む。

#### Scenario: 全 approved 後に regression-gate が走る

**Given** 全 custom reviewer が approved で invalidation も発火しない状態
**When** pipeline が coordinator の `approved` 出力の遷移を解決する
**Then** 次の step は regression-gate であり、その後 conformance へ進む

### Requirement: resume 時に approved かつ未 invalidate の reviewer を skip すること

pipeline は、resume 後に coordinator へ入った時、`status === "approved"` かつ未 invalidate の custom
reviewer を再 review SHALL NOT する。pending（needs-fix 中 / invalidate 済み）の reviewer のみを再実行
SHALL する。

#### Scenario: resume 後に approved reviewer が skip される

**Given** reviewer A が approved、reviewer B が pending の状態で job が awaiting-resume になり、resume された
**When** pipeline が coordinator に入る
**Then** A は再 review されず、B のみが再 review される

### Requirement: custom reviewer ゼロで既存挙動と同一であること

pipeline は、custom reviewer が宣言されていない job について、PipelineDescriptor（steps / transitions /
loopNames / loopFixerPairs）を custom reviewer 機能の導入前と byte-identical に保 SHALL ち、coordinator /
`reviewerStatuses` を一切導入 SHALL NOT しない。

#### Scenario: reviewer ゼロで標準遷移が不変

**Given** custom reviewer 定義が存在しない job
**When** `composeReviewerDescriptor` が base descriptor を合成する
**Then** 返される descriptor は base と参照同一であり、coordinator ノード・並列遷移は含まれない

### Requirement: custom reviewer 1 件で直列と等価に収束すること

pipeline は、custom reviewer が 1 件の構成でも status tracking / invalidation を機能 SHALL させ、
review → fix → invalidation → 再 review → approved → regression-gate の収束を成立 SHALL させる。

#### Scenario: 1 件の reviewer が status tracking 付きで収束する

**Given** custom reviewer A が 1 件のみ宣言された job
**When** pipeline が coordinator を実行する
**Then** A の status が `reviewerStatuses` に記録され、needs-fix → code-fixer → invalidation 判定 →
approved → regression-gate と収束する
