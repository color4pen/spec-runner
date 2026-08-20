# Spec: spec-review loop の単一 fixer 化

## Requirements

### Requirement: spec-review の fixable canon finding は spec-fixer に route される

spec-review が返す fixable な canon finding は、対象ファイル（spec.md / design.md / tasks.md /
test-cases.md）によらず、すべて **spec-fixer** に route される SHALL。effective fixer は spec-fixer 一本で
あり、test-cases.md 宛の finding を test-case-gen に route する経路は存在しない。spec-fixer が write 不能な
canon（request.md / attestation）宛の fixable finding のみ escalation を維持する。

#### Scenario: test-cases.md 宛の fixable finding が spec-fixer に route され escalation にならない

**Given** spec-review が test-cases.md 上の medium fixable finding を 1 件返す
**When** pipeline が spec-review の verdict と routing を導出する
**Then** verdict は escalation にならず、canon-finding escalation の対象（unroutable）から test-cases.md は外れ、finding は spec-fixer の修正対象になる

#### Scenario: request.md 宛の fixable finding は依然 escalation する

**Given** spec-review が request.md 上の fixable finding を 1 件返す
**When** pipeline が spec-review の verdict を導出する
**Then** request.md は spec-fixer の write scope 外のため verdict は escalation になる

### Requirement: spec-fixer は test-cases.md を targeted に修正し再生成しない

spec-fixer は test-cases.md を write scope に含み、finding が指す箇所のみを最小限に修正する MUST。
既存の test-cases.md 内容（他の TC・operator が採用済みの編集）を尊重し、wholesale な再生成は行わない。

#### Scenario: spec-fixer の write scope に test-cases.md が含まれる

**Given** 現在の job の canon write scope を構築する
**When** `writableByFixer` の spec-fixer エントリを参照する
**Then** その集合は spec.md / design.md / tasks.md に加えて test-cases.md を含み、`SpecFixerStep.writes()` も test-cases.md を宣言する

### Requirement: test-case-gen は design 後に一度だけ走る producer である

test-case-gen は design 完了後に一度だけ実行され test-cases.md を生成する SHALL。spec-review の
needs-fix ループ内では二度と起動されない。spec-review → spec-fixer → spec-review の一巡に test-case-gen は
現れない。exempt type（#987）は従来どおり test-case-gen を bypass する。

#### Scenario: needs-fix 一巡に test-case-gen が現れない

**Given** spec-review が spec.md または test-cases.md 上の needs-fix finding を返す
**When** pipeline が spec-review → spec-fixer → spec-review の needs-fix 一巡を実行する
**Then** その一巡の step 実行列に test-case-gen は含まれず、spec-fixer 完了後の遷移先は spec-review（re-review）になる

#### Scenario: 初回経路は design → test-case-gen → spec-review のまま

**Given** exempt でない type の job が design を完了する
**When** pipeline が次の step を選ぶ
**Then** test-case-gen が一度実行され、その後 spec-review に進む

### Requirement: operator が採用した test-cases.md 編集は needs-fix 一巡で保存される

operator が `--apply-canon` で確定した test-cases.md の編集は、当該 finding と無関係であっても、
spec-review → spec-fixer → spec-review の一巡を経て保存される MUST。ループ内に test-cases.md を
wholesale 再生成する step が存在しないことがこの保存を構造的に保証する。

#### Scenario: finding と無関係の operator 編集が一巡後も残る

**Given** test-cases.md に operator が採用した「finding と無関係の編集」が含まれ、spec-review が別箇所の finding を返す
**When** spec-review → spec-fixer → spec-review を一巡させる
**Then** spec-fixer は finding 箇所のみを修正し、operator の無関係な編集は test-cases.md に保存されたまま残る

### Requirement: spec-review ⇄ spec-fixer の収束予算は透過化なしで数えられる

spec-review と spec-fixer の間の収束予算（episode 検出）は、中間 step の透過化機構
（`loopIntermediateSteps`）を用いずに正しく計上される SHALL。spec-fixer から spec-review への復帰は
同一 episode として扱われ、needs-fix が継続する場合は予算枯渇で `SPEC_REVIEW_RETRIES_EXHAUSTED` に到達する。

#### Scenario: needs-fix 継続で予算が枯渇する

**Given** spec-review が上限回数を超えて needs-fix を返し続ける
**When** pipeline が spec-review ⇄ spec-fixer を繰り返す
**Then** episode 透過化なしで予算が正しく減算され、上限到達時に `SPEC_REVIEW_RETRIES_EXHAUSTED` の escalation で halt する
