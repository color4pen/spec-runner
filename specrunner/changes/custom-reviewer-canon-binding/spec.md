# Spec: custom reviewer 承認の canonical 入力 hash 束縛と全 skip の非 green 化

このドキュメントは custom reviewer round（parallel coordinator）における承認再利用の
判定契約を定義する。sequential 経路（conformance / code-review）は対象外。

## Requirements

### Requirement: 承認済み custom reviewer の skip は canonical 入力 hash に束縛される

custom reviewer round は、承認済み member を skip（再走省略）する判定に、既存の
revision 束縛（approvedAtCommit == baselineCommit）に加えて、承認時点の正典文書集合の
内容 hash（canonHash）が現在の canonHash と一致することを SHALL 要求する。いずれかが
不一致・欠落・検証不能の場合、その member を pending に戻す（fail-closed）。

正典文書集合とは `specrunner/changes/<slug>/` 直下の request.md / spec.md / design.md /
tasks.md / test-cases.md のうち存在するものを指す。canonHash は round 開始時に一度だけ
計算し、判定関数には引数として渡す。判定関数は state と引数のみで純粋に評価する。

#### Scenario: 正典文書を変更すると承認済み reviewer が pending に戻る

**Given** ある custom reviewer が canonHash H1 と approvedAtCommit C1 で承認済みとして記録されている
**And** 現在の HEAD が C1（revision は一致）である
**When** 正典文書（例: design.md）が変更され、round 開始時に計算した現在の canonHash が H2（≠ H1）になる
**Then** 該当 reviewer は pending に戻り、fan-out で再実行される（skip されない）

#### Scenario: 正典・activation 対象がいずれも不変なら承認 skip が維持される

**Given** ある custom reviewer が canonHash H1 と approvedAtCommit C1 で承認済みとして記録されている
**When** 正典文書も activation 対象 source path も変更されず、現在の canonHash が H1、baselineCommit が C1 のまま
**Then** 該当 reviewer は skip され（再実行されず）、round は承認済み member を再走しない

#### Scenario: canonHash を持たない legacy 承認 record は pending に戻る

**Given** ある custom reviewer が approvedAtCommit C1 で承認済みだが canonHash フィールドを持たない（旧構造の record）
**And** 現在の HEAD が C1（revision は一致）で、現在の canonHash が計算可能である
**When** round が skip 判定を行う
**Then** 該当 reviewer は pending に戻る（fail-closed）。record 自体の内容は書き換えられない

### Requirement: round の変更判定は正典文書を pipeline 出力と区別する

round の invalidation 用 touched リストから除外する対象は、change folder 内の pipeline 出力
（`*-result-*.md` / `review-feedback-*.md` / state.json / events.jsonl / usage.json /
attestation / rules.md 等、正典文書以外のすべて）に SHALL 限定する。正典文書（request.md /
spec.md / design.md / tasks.md / test-cases.md）の変更は touched リストに現れなければならない。
change folder 外の source path は従来どおり保持する。

#### Scenario: reviewer 自身の findings commit は誤 invalidation を誘発しない

**Given** 承認済み reviewer が activation paths を持つ
**When** round 間で変更されたファイルが当該 reviewer の findings（`<name>-result-NNN.md`）等の
pipeline 出力のみである
**Then** 除外後の source-touched は空になり、当該 reviewer は source-path 由来の invalidation を受けない

#### Scenario: 正典文書の変更は touched リストに現れる

**Given** activation paths が change folder（例: `specrunner/changes/**` や `**`）を含む承認済み reviewer
**When** round 間で正典文書（例: design.md）が変更される
**Then** 除外後の source-touched に当該正典文書が含まれ、activation 判定により当該 reviewer は
invalidation を受ける（pending に戻る）

### Requirement: reviewer が構成された round の全 skip は非 green とする

1 件以上の member を持つ round で、実行された全 member の verdict が "skipped" の場合、
合流 verdict は approved ではなく escalation と SHALL する（検証実績ゼロ = 判定不能）。member を
1 件も持たない場合（member 0 件 / 空配列）は従来どおり approved とする（機能未使用）。

全 skip による escalation の場合、round は member の status を "skipped" として確定させず
pending のまま残す。これにより resume 時に同じ判定が再現され、escalation が迂回されない。

#### Scenario: reviewer 構成ありで全 member skipped → escalation

**Given** round に 1 件以上の member が構成され、全 member が実行時に "skipped" verdict を返す
**When** 合流 verdict を算出する
**Then** 合流 verdict は escalation となり、round error が付与される

#### Scenario: member 0 件 → approved

**Given** 合流対象の member verdict 配列が空である
**When** 合流 verdict を算出する
**Then** 合流 verdict は approved のままとなる

#### Scenario: 一部承認・一部 skip → approved

**Given** round の member verdict に少なくとも 1 件の "approved" が含まれ、escalation / needs-fix を含まない
**When** 合流 verdict を算出する
**Then** 合流 verdict は approved となる（全 skip ではないため非 green 化しない）

#### Scenario: 全 skip escalation では member が pending のまま残る

**Given** 全 member が skipped で round が escalation となる
**When** round が status を確定させる
**Then** 該当 member の status は "skipped" に確定されず pending のまま persist され、
resume 時に再び fan-out 対象となる

### Requirement: 新規承認は現在の revision と canonHash に束縛される

member が round で承認された場合、その status には approvedAtCommit として承認時点の
source revision を、canonHash として round 開始時に計算した現在の canonHash を SHALL 記録する。

#### Scenario: 正典変更後の再走で新承認が新 revision / 新 canonHash に束縛される

**Given** canonHash H1 / approvedAtCommit C1 で承認済みの reviewer が存在する
**When** 正典文書が変更されて HEAD が C2・canonHash が H2 になり、reviewer が再走して再び approved になる
**Then** 更新後の status は approvedAtCommit = C2、canonHash = H2 を記録し、
次 round で正典・revision が不変なら skip が成立する
