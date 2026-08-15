# build-fixer の廃止: verification 失敗は implementer の継続 session で直す

## Meta

- **type**: spec-change
- **slug**: absorb-build-fixer
- **base-branch**: main
- **adr**: true

## 背景

verification(build / typecheck / lint / test)の失敗は、ほとんどの場合、直前の実装作業のデバッグの続きである。しかし現行 pipeline はこれを独立の build-fixer step に渡す。build-fixer は実装時の文脈(なぜその構造にしたか、どこまで書いたか)を持たない fresh session で、かつ「機械的修正のみ・設計判断禁止・失敗出力に書かれた範囲のみ」という制約下で作業する。

この分離は 2 つの損失を生む: (a) 実装者なら一手で直せる失敗を、文脈を再構築しながら制約付きで直すことになる、(b) 失敗の原因が設計判断に触れる場合、build-fixer は制約上それを直せず、歪んだ最小修正か escalation になる。

対応: build-fixer step を廃止し、verification 失敗は **implementer step への再入**とする。再入は implementer の直前 session の継続(resume)として行い、失敗内容を渡す。実装者が自分の書いたコードと判断を覚えたまま直す。

## 現状コードの前提

- `src/core/pipeline/types.ts:290-293` — `VERIFICATION failed → BUILD_FIXER`、`BUILD_FIXER success → VERIFICATION`(chore 経路 `:347-350` も同型)
- `src/core/pipeline/types.ts:195-199` — `VERIFICATION_RETRIES_EXHAUSTED`(ループ上限)。この歯は維持する
- `src/core/step/build-fixer.ts` — 独立 step 定義。system prompt(`src/prompts/build-fixer-system.ts`)に機械的修正への制約
- agent 呼び出しは `ctx.session.resumeSessionId` による session 継続をサポート済み(`src/adapter/claude-code/agent-runner.ts` の resume option)
- `job resume --from build-fixer` が CLI の有効な選択肢に含まれる(`src/cli/` の --from 候補列挙)
- 過去 job の state / journal には build-fixer の実行歴が残っている(後方互換が必要)

## 要件

1. **遷移の置換** — `VERIFICATION failed → IMPLEMENTER`(再入)とし、`BUILD_FIXER` への遷移を廃止する。ループ上限(VERIFICATION_RETRIES_EXHAUSTED)の意味論は維持する(再入回数の歯を外さない)。
2. **再入は継続 session** — verification 失敗による implementer 再入は、直前の implementer session の継続(resume)として実行し、失敗した command とその出力を message で渡す。継続元 session が無い場合(resume 復帰等)は fresh session に fallback する(エラーにしない)。
3. **制約を持ち込まない** — 再入時の指示は「検証の失敗を解消する」ことのみ。機械的修正限定・設計判断禁止・範囲限定の制約は課さない。implementer の通常の権限と責務(canon と整合するよう実装・テストを直す)で作業する。
4. **build-fixer step の削除と互換** — step 定義・prompt・遷移・`--from build-fixer` 候補を削除する。build-fixer の実行歴を含む既存 job の state 読み込み・journal fold・resume が壊れないこと(過去の step 名は履歴として保持されたまま無視される)。

## スコープ外

- code-fixer の統合(context 使用量の実測後に別途判断)
- verification の判定内容・command 実行の変更
- regression-gate / conformance の挙動変更
- managed runtime での session 継続方式

## 受け入れ基準

- [ ] verification 失敗時に implementer へ遷移することをテストで固定する(通常・chore 両経路)
- [ ] 再入 implementer が直前 session の継続として起動され、失敗内容が message に含まれることをテストで固定する
- [ ] 継続元 session が無い場合に fresh session で fallback することをテストで固定する
- [ ] verification ループ上限(RETRIES_EXHAUSTED)が再入方式でも機能することをテストで固定する
- [ ] build-fixer 実行歴を含む既存 state の読み込みと resume が壊れないことをテストで固定する
- [ ] 遷移表・build-fixer 関連の既存テストの更新対象を design で全列挙し根拠を明示する。列挙外は無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **fresh fixer より継続 session** — 失敗の大半は直前の実装の続きであり、文脈の再構築はコスト(トークン・時間)と誤修正リスクの両方を増やす。継続なら「自分が直前に書いたコードと判断」を保持したまま直せる。
- **制約撤去は権威解体の一環** — 「機械的修正のみ」は fixer が設計を壊さないための防御だったが、直すのが実装者本人なら設計判断は本人の責務の内であり、防御が問題解決能力の制限にしかならない。守るべき境界(canon を勝手に変えない・scope 外を触らない)は既存の write-scope 機構が担う。
- **ループ上限は維持** — 再入の無限ループ防止は自由の制限ではなく回復不能検知であり、escalation への出口として残す。
