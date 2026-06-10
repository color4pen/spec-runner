# Spec: judge 系 step の verdict を構造化 findings から CLI が導出する

## Requirements

### Requirement: Judge verdict は構造化 findings から決定的に導出される

spec-review / code-review step の verdict は、agent が `report_result` tool で申告する
構造化 `findings` 配列のみから CLI が決定的に導出する SHALL。agent が申告する `approved`
boolean および `fixableCount` は verdict 導出に使用してはならない MUST NOT（互換のため
フィールドは残してよい）。

導出の優先順位は以下の通り SHALL（上から評価し最初に成立したものを採用する）:

1. `ok: false`（agent の自発的失敗申告）→ `escalation`
2. `resolution: "decision-needed"` の finding が 1 件以上 → `escalation`
3. `severity: "critical"` または `"high"` の finding が 1 件以上 → `needs-fix`
4. それ以外（空配列を含む）→ `approved`

#### Scenario: critical を含むのに approved を申告しても needs-fix になる

**Given** spec-review agent が `report_result` を `{ ok: true, approved: true, findings: [{ severity: "critical", ... }] }` で呼ぶ
**When** executor が verdict を導出する
**Then** verdict は `needs-fix` であり、`approved` boolean は無視される

#### Scenario: 空の findings は approved になる

**Given** code-review agent が `{ ok: true, findings: [] }` を申告する
**When** executor が verdict を導出する
**Then** verdict は `approved` である

#### Scenario: decision-needed を含む報告は escalation になる

**Given** code-review agent が `{ ok: true, findings: [{ severity: "medium", resolution: "decision-needed", ... }] }` を申告する
**When** executor が verdict を導出する
**Then** verdict は `escalation` であり、pipeline は escalate 経路（awaiting-resume）に入る

### Requirement: 自発的失敗と no-tool-call は escalation に倒れる

judge 系 step（spec-review / code-review）において、agent が `ok: false` を申告した場合、
および agent が `report_result` tool を呼ばずに turn を終えた場合（toolResult が null）の
verdict は `escalation` でなければならない MUST。

#### Scenario: ok:false 報告は escalation

**Given** spec-review agent が `{ ok: false, reason: "..." }` を申告する
**When** executor が verdict を導出する
**Then** findings の内容に関わらず verdict は `escalation`

#### Scenario: tool 未呼び出しは escalation

**Given** code-review agent が `report_result` を呼ばずに session を終える
**When** executor が verdict を導出する
**Then** verdict は `escalation`（旧挙動の `needs-fix` ではない）

### Requirement: verdict に影響する finding の参照は実在検証される

verdict に影響する findings（`severity` が critical / high、または `resolution` が
decision-needed のもの）について、CLI は session 終了後に finding の `file`（および
存在すれば `line`）が実在するかを検証する SHALL。実在しない参照を 1 件以上含む場合、
その step の verdict は `escalation` に倒す MUST。`severity` が low / medium の finding は
verdict に影響しないため検証対象外とする。

実在検証の runtime 差異（local = worktree filesystem、managed = GitHub 上のブランチ）は
RuntimeStrategy の seam に閉じ込める SHALL。

#### Scenario: 実在しない file を指す blocking finding は escalation

**Given** code-review agent が `{ ok: true, findings: [{ severity: "high", file: "src/does-not-exist.ts", ... }] }` を申告する
**When** executor が verdict 導出後に finding 参照を検証する
**Then** verdict は `escalation`（`needs-fix` にならない）

#### Scenario: low/medium の不実在参照は verdict を変えない

**Given** agent が `{ ok: true, findings: [{ severity: "low", file: "src/gone.ts", ... }] }` のみを申告する
**When** executor が verdict を導出する
**Then** low は検証対象外のため verdict は `approved` のまま

### Requirement: request-review verdict は findings から 2 値で導出される

request-review step の verdict は findings から 2 値で導出する SHALL。blocking な finding
（`severity` critical / high、または `resolution` decision-needed）が 1 件以上あれば
`needs-discussion`、なければ `approve` とする。`reject` は導出しない MUST NOT。`ok: false`
の場合は `needs-discussion` とする。実在しない参照を含む blocking finding がある場合は
escalate 経路に倒す SHALL。

#### Scenario: blocking finding ありで needs-discussion

**Given** request-review agent が `{ ok: true, findings: [{ severity: "high", ... }] }` を申告する
**When** executor が verdict を導出する
**Then** verdict は `needs-discussion` であり pipeline は escalate 経路に入る

#### Scenario: blocking finding なしで approve

**Given** request-review agent が `{ ok: true, findings: [{ severity: "medium", resolution: "fixable", ... }] }` を申告する
**When** executor が verdict を導出する
**Then** verdict は `approve` であり design step に進む

### Requirement: fixer は構造化 findings を prompt 経由で受け取る

spec-fixer / code-fixer の初回および継続メッセージは、直前の judge run（spec-review /
code-review）の state に記録された構造化 findings を prompt 本文に埋め込んで渡す SHALL。
fixer は findings ファイルの読み込みに依存してはならない MUST NOT。直前の judge run が
findings を持たない場合（旧 toolResult を持つ job の resume）は、従来の findingsPath 方式に
フォールバックする SHALL。build-fixer は対象外であり findingsPath 方式を維持する。

#### Scenario: fixer は state の findings を prompt から受け取る

**Given** 直前の code-review run の toolResult に findings が記録されている
**When** code-fixer の buildMessage が呼ばれる
**Then** prompt 本文に findings の severity / file / title / rationale が埋め込まれ、findingsPath ファイルの読み込み指示に依存しない

#### Scenario: findings を持たない旧 job の resume はフォールバックする

**Given** 直前の judge run の toolResult に findings が存在しない（旧形式）
**When** fixer の buildMessage が呼ばれる
**Then** 従来の findingsPath 方式の prompt が生成される
