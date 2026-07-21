# sequential step の commit を write-set 境界で機械強制する

## Meta

- **type**: spec-change
- **slug**: step-write-scope-enforcement
- **base-branch**: main
- **adr**: true

## 背景

各 step の書込境界（どの step がどのパスを編集してよいか）は、rules.md の責任範囲表と各 system prompt の Contract 節で**宣言**されているが、機械的には強制されていない。sequential step の commit は `git add -A` で worktree 全体を stage するため、agent が境界外（例: 正典 request.md、他 step の成果物、無関係な source code）へ書いた変更も**そのまま commit される**。

実害の前例: spec-review 実行後の commit で request.md が弱体化版に書き戻され、以後の全 gate が弱められた正典を検証した。prompt には書込禁止が明記されていたが、破られた場合に止める機械が存在しない。

並列 reviewer round には coordinator-owned scoped staging（宣言された出力のみ stage）が既に存在する。sequential 経路にも同等の境界強制を導入する。

## 現状コードの前提

- `src/core/step/commit-push.ts:48` および `:115` — sequential step の staging は `["add", "-A"]`（worktree 全体）
- `src/core/step/commit-push.ts:183` — 並列 round 用の scoped variant `["add", "-A", "--", ...stagePaths]` が既に存在する
- `src/core/step/spec-review.ts:80-87` — spec-review の reads() は spec.md / design.md / tasks.md のみで request.md を含まない（review が request を正典として読む事実が lineage に残らない）
- `src/prompts/rules.ts` — 責任範囲表（step × touch 可能 / 禁止）が宣言として存在する
- `src/core/step/types.ts` — 各 step は reads() / writes() を宣言する（IoRef[]）
- 広域 write step が存在する: implementer / build-fixer / code-fixer は任意の source code パスを編集するため、writes() で全出力を事前列挙できない

## 要件

1. **per-step write-scope の単一ソース定義**: 各 step の許可書込領域を機械可読な単一ソース（`src/` 配下の leaf module）で定義する。形式は「許可 path プレフィックス集合」または「禁止 path 集合 + 許可プレフィックス」とし、既存の責任範囲表（rules.ts）の内容と矛盾しないこと。
2. **列挙可能 step は scoped staging**: writes() で出力を完全列挙できる step（design / 各 judge / 各 fixer のうち成果物が確定的なもの）は、宣言パスのみを stage する（既存の scoped variant を流用）。境界外の変更が worktree にあっても commit に混入しない。
3. **広域 write step は差分検査 + fail-closed**: implementer / build-fixer / code-fixer 等の列挙不能 step は、stage 前に変更差分を write-scope と照合し、**禁止領域（request.md を最低限含む。正典・他 step 成果物）への変更を検出したら commit せず halt する**（fail-open にしない）。halt 報告には違反 path を列挙する。
4. **spec-review の reads() に request.md を追加**する（review の正典入力を lineage に残す）。
5. **境界違反の遡及検査はしない**: 本変更は新規 commit の境界強制のみ。過去 commit の監査は対象外。

## スコープ外

- 並列 round 経路の変更（既に scoped。挙動を変えない）
- prompt の Contract 節文言の変更（宣言は既存のまま。将来の同源化は別 request）
- agent 実行時の tool-level write 遮断（SDK permission 層。本変更は commit 境界での強制）
- 承認の revision 束縛・reopen（後続 request）

## 受け入れ基準

- [ ] judge step（spec-review 相当）の実行結果に request.md への変更が含まれる状態で commit 処理を行うと、request.md の変更が commit に**含まれない**ことをテストで固定する（scoped staging 経路）
- [ ] 広域 write step（implementer 相当）が request.md を変更した状態で commit 処理を行うと、commit されず halt になり、halt 報告に違反 path が含まれることをテストで固定する
- [ ] 正常経路（境界内のみの変更）では commit 内容・挙動が現行と同一であることをテストで固定する（既存 pipeline テストは無改変で green）
- [ ] write-scope 定義が単一ソースであり、rules.ts の責任範囲表と矛盾しないことをテストで固定する
- [ ] spec-review の reads() に request.md が含まれることをテストで固定する
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用: commit 境界での強制（staging scope + 差分検査）**。agent がどう書こうと、境界外の変更は「commit されない」か「halt する」かのいずれかになり、宣言と機械が一致する。既存の scoped variant の流用で実装面積が小さい。
- **採用: 広域 step は fail-closed の差分検査**。列挙不能な write を scoped staging で無理に列挙すると実装物の commit 漏れ（silent drop）が起きる。禁止領域検出 → halt の方が、変更の黙殺よりも安全で監査可能。
- **却下: 全 step 一律 scoped staging** — implementer の出力は事前列挙不能。silent drop の危険が halt より大きい。
- **却下: SDK permission（tool-level 遮断）での実装** — provider 依存で managed runtime と挙動が割れる。commit 境界は runtime 非依存の共通経路であり、ここが最小の強制点。tool-level 遮断は将来の追加防壁として妨げない。
- **却下: 違反変更の自動 revert** — 証跡を消すことになる。halt して人間に見せる。
