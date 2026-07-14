# Spec: fact-check attestation source binding

<!-- Layer-1 behaviors: 型/構造が自動保証しない振る舞いのみを記す。 -->

## Requirements

### Requirement: attestation は source revision に束縛される

fact-check attestation は request.md hash に加えて、request-review 実行時点の
**source revision**（`specrunner/changes/` を除外した最新 source commit の sha）を
記録 MUST。design はこの source revision を現在値と照合 SHALL し、request-review 以降に
source が変化していれば attestation を stale と判定 MUST する。source 信号は決定論的な
CLI 側 git 読み取りで取得 SHALL し、AI ターンを要してはならない。

記録側（request-review）と評価側（design）は同一の git コマンドで source revision を
取得 MUST し、pipeline が step ごとに行う metadata commit（change folder のみを変更する
commit）をまたいでも値が安定 SHALL する。

#### Scenario: source 未変化なら valid を維持する

**Given** attestation の requestHash が current request.md と一致し、codeAssertionsVerified が true である
**And** attestation の source revision が current source revision と一致する
**When** design が attestation を評価する
**Then** 評価は `valid` となり、記録済み verifiedAssertions を返す

#### Scenario: request.md 不変でも source 変化で stale にする

**Given** attestation の requestHash が current request.md と一致する
**And** attestation の source revision が current source revision と **異なる**
**When** design が attestation を評価する
**Then** 評価は `stale` となり、verifiedAssertions は空を返す

### Requirement: source 信号は fail-safe に stale へ倒す

source 信号の欠落・取得不能・不一致はすべて `stale`（verify-all）として扱 MUST う。
attestation を緩める（誤って valid にする）方向には決して作用してはならない。既存の
「requestHash 不一致 / codeAssertionsVerified false → stale」および「null / 解析不能 →
absent」の挙動は保存 MUST する。

#### Scenario: source 信号を持たない旧 attestation は stale になる

**Given** attestation が source revision フィールドを持たない（source 束縛導入前に生成された）
**When** design が attestation を評価する
**Then** 評価は `stale` となる（後方互換・fail-safe）

#### Scenario: current source revision が取得不能なら stale になる

**Given** current source revision を git から取得できない（値が null）
**When** design が attestation を評価する
**Then** requestHash が一致していても評価は `stale` となる

#### Scenario: 既存の stale 条件が保存される

**Given** attestation の requestHash が current request.md と一致しない、
または codeAssertionsVerified が false である
**When** design が attestation を評価する
**Then** source revision の一致に関わらず評価は `stale` となる
