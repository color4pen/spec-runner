# Spec: test-case-gen を design phase の最終工程へ移動

## Requirements

### Requirement: 通常 type は test-case-gen を spec-review の前に実行する

通常（テスト生成免除でない）type の pipeline は、design 成功後にまず test-case-gen を実行し、
その成功後に spec-review を実行 SHALL する。spec-review 承認後は test-case-gen を経由せず
下流（test-materialize）へ直接進む MUST。

#### Scenario: 通常 type は design から test-case-gen へ進む

**Given** request type が new-feature / spec-change / bug-fix / refactoring のいずれか
**When** design step が success を返す
**Then** 次の step は test-case-gen である（spec-review ではない）

#### Scenario: 通常 type は test-case-gen から spec-review へ進む

**Given** 通常 type の test-case-gen step が success を返す
**When** pipeline が次遷移を解決する
**Then** 次の step は spec-review である

#### Scenario: 通常 type は spec-review 承認後に test-materialize へ進む

**Given** 通常 type の spec-review が approved を返し、routable な観察 finding も免除条件も無い
**When** pipeline が次遷移を解決する
**Then** 次の step は test-materialize である（test-case-gen を経由しない）

### Requirement: 免除 type は test-case-gen を通らず design から spec-review へ直行する

テスト生成免除 type（#987, chore 等）の pipeline は、design 成功後に spec-review へ直行 SHALL し、
test-case-gen / test-materialize を通らない MUST。免除 type の spec-review 承認後の implementer 直行は不変とする。

#### Scenario: 免除 type は design から spec-review へ直行する

**Given** request type がテスト生成免除 type
**When** design step が success を返す
**Then** 次の step は spec-review である（test-case-gen ではない）

#### Scenario: 免除 type は test-case-gen を通らない

**Given** 免除 type の job
**When** spec phase 全体を通過する
**Then** test-case-gen step は一度も実行されない

### Requirement: needs-fix 後は test-case-gen を常時再生成してから再レビューする

spec-review が needs-fix を返し、spec/design/tasks への修正が必要な場合、spec-fixer による修正後に
test-case-gen を再実行してから spec-review へ戻る SHALL。再生成の要否を走行中の判断で分岐させない MUST。

#### Scenario: spec-fixer 修正後は test-case-gen を再生成する

**Given** spec-review needs-fix により spec-fixer が起動し（conformance 起因でない）、最新 spec-review verdict が needs-fix
**When** spec-fixer が approved で完了する
**Then** 次の step は test-case-gen である（spec-review へ直行しない）

#### Scenario: 再生成後に spec-review へ戻る

**Given** needs-fix ループ内で test-case-gen が success で完了する
**When** pipeline が次遷移を解決する
**Then** 次の step は spec-review である

### Requirement: TC のみの needs-fix は spec-fixer を経由せず test-case-gen を再生成する

spec-review が test-cases.md のみに fixable finding を出して needs-fix になった場合、pipeline は
spec-fixer を経由せず test-case-gen の再生成に直接進み、再生成後 spec-review へ戻る SHALL。
spec/design/tasks への finding が混在する場合は spec-fixer を経由する MUST。

#### Scenario: TC のみの needs-fix は test-case-gen へ直行する

**Given** 最新 spec-review の fixable finding がすべて test-cases.md 上にあり、spec-fixer が書ける
canon（spec/design/tasks）や非 canon の critical/high finding が無い
**When** spec-review が needs-fix を返す
**Then** 次の step は test-case-gen である（spec-fixer ではない）

#### Scenario: TC と spec の混在 needs-fix は spec-fixer を経由する

**Given** 最新 spec-review の fixable finding に spec.md（または design/tasks）への項目が少なくとも 1 件含まれる
**When** spec-review が needs-fix を返す
**Then** 次の step は spec-fixer である

### Requirement: 観察 pass の意味論を維持する

spec-review が approved を返し routable な観察 finding を持つ場合（観察 pass）、pipeline は spec-fixer で
それを消費した後、test-case-gen を再生成せず・spec-review を再実行せず下流（test-materialize）へ継続 SHALL する。
approve を stop gate、観察を非ブロッキング指摘のみとする現行意味論を維持する MUST。

#### Scenario: 観察 pass の spec-fixer は test-materialize へ継続する

**Given** spec-fixer が観察 pass（conformance 起因でなく、最新 spec-review verdict が approved）で起動し、免除 type でない
**When** spec-fixer が approved で完了する
**Then** 次の step は test-materialize である（test-case-gen でも spec-review でもない）

#### Scenario: 観察 pass 後に spec-review は再実行されない

**Given** 観察 pass（approved + routable fixable）が発生した job
**When** spec phase が下流へ進む
**Then** spec-review は当該 round で 1 回のみ実行される（再レビューされない）

### Requirement: spec-review は test-cases.md を照合対象に含める

通常 type の spec-review は、入力に test-cases.md を含め SHALL、次の観点を照合する MUST:
(a) TC が spec の Scenario / Requirement を過不足なく検証しているか、(b) tasks と TC の間に実装計画の穴がないか、
(c) TC が実装の API・内部構造・assertion の形式に踏み込んでいないか（振る舞いレベルからの逸脱検査）。
免除 type では test-cases.md が存在しないため入力に含めない。

#### Scenario: 通常 type の spec-review 入力に test-cases.md が含まれる

**Given** request type がテスト生成を要する type
**When** spec-review step の reads() を評価する
**Then** 宣言された入力パスに `specrunner/changes/<slug>/test-cases.md` が含まれる

#### Scenario: 免除 type の spec-review 入力に test-cases.md が含まれない

**Given** request type がテスト生成免除 type
**When** spec-review step の reads() を評価する
**Then** 宣言された入力パスに test-cases.md は含まれない

#### Scenario: spec-review prompt に TC 照合観点が含まれる

**Given** spec-review の system prompt
**When** その内容を検査する
**Then** TC↔spec の網羅性・tasks↔TC の実装計画の穴・TC の抽象度逸脱（API/内部構造/assertion 形式への踏み込み）の照合指示が含まれる

### Requirement: test-case-gen は振る舞いレベルで記述し tasks.md を編集しない

test-case-gen の system prompt は、TC を「何を確認できればよいか」の振る舞いレベルに留め、特定の関数呼び出し手順・
内部状態の具体値・assertion の形式を GIVEN/WHEN/THEN に書かないよう指示 SHALL する。test-case-gen は tasks.md を
編集せず（writes 宣言は test-cases.md のみ）、tasks と TC の不整合は test-cases.md 内の申し送り注記として記録し
判定を spec-review に委ねる MUST。

#### Scenario: test-case-gen prompt に振る舞いレベル指示が含まれる

**Given** test-case-gen の system prompt
**When** その内容を検査する
**Then** 実装構造（API・内部状態の具体値・assertion の形式）へ踏み込まないという記述指示が含まれる

#### Scenario: test-case-gen の write 宣言は test-cases.md のみ

**Given** test-case-gen step の writes()
**When** 宣言された出力パスを評価する
**Then** `specrunner/changes/<slug>/test-cases.md` のみが含まれ、tasks.md は含まれない

### Requirement: 承認前の test-cases.md finding は test-case-gen 再生成で解消する

spec-review が承認前（design phase 内）に test-cases.md へ出す fixable finding は、operator escalation にせず
needs-fix と判定 SHALL し、test-case-gen の再生成に渡して解消させる MUST。承認後（実装工程以降）に
conformance / code-review / regression-gate が test-cases.md へ出す fixable finding は、従来どおり
operator 経路（escalation）で保護する MUST。

#### Scenario: spec-review の test-cases.md fixable finding は needs-fix になる

**Given** canon write scope に test-case-gen（test-cases.md 書込可）が登録され、spec-review が test-cases.md に
fixable finding を 1 件出す
**When** spec-review の verdict を導出する
**Then** verdict は needs-fix である（escalation ではない）

#### Scenario: 再生成時に TC finding が test-case-gen へ渡される

**Given** 最新 spec-review run が test-cases.md への fixable finding を持ち、test-case-gen が再生成のため起動する
**When** test-case-gen の初期メッセージを構築する
**Then** メッセージに当該 TC finding が解消対象として埋め込まれる

#### Scenario: 承認後の test-cases.md finding は operator 保護される

**Given** conformance（または code-review / regression-gate）が test-cases.md に fixable finding を出す
**When** その verdict を導出する
**Then** verdict は escalation である（test-case-gen へ routable にならない）

#### Scenario: request.md finding は承認前でも escalation のまま

**Given** spec-review が request.md（または attestation）に fixable finding を出す（test-cases.md finding の有無を問わず）
**When** spec-review の verdict を導出する
**Then** verdict は escalation である
