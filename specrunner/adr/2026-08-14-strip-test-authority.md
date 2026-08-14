# ADR: テスト証拠と工程順序の分離(第1弾) — red 強制・テスト変更禁止・偽 baseline 判定の撤回

- **Date**: 2026-08-14
- **Status**: Accepted
- **Slug**: strip-test-authority

## Context

pipeline は「テストが実装より先に書かれた」という**工程順序**を、テストの真実性の証明として扱っていた。この昇格は 3 つの機構に分散して埋め込まれていた:

1. **test-materialize** (`src/prompts/test-materialize-system.ts`): 新規テストに「base で red を観測するまで完了不可。green なら書き直して再実行」を命令する。
2. **implementer** (`src/core/step/implementer.ts`): `testsMaterialized`(test-materialize の実行歴の有無)が true のとき「production code only、テスト変更禁止」モードに入る。
3. **bite-evidence** (`src/core/step/bite-evidence/gate.ts` / `oids.ts`): base = 最新 test-materialize commit を「実装なし」と暗黙前提に、base-red → candidate-green を判定する。

この前提は初回の一直線走行でのみ真であり、implementer 通過後の resume(spec-fixer / test-case-gen / test-materialize からの再走)で破れる。実際の再走の Git 形状は `implementer-1 → test-materialize-2(= base、実装混入済み)→ implementer-2(= candidate)` となり、Git 上は正常な base → candidate に見える。

破れた状態で 3 機構が逆向きに作用する:

1. test-materialize が実装済み worktree で新規テストを green 観測 →「見張っていないテスト」と誤認して正しいテストを fail するよう書き直す(prompt の明文命令)。
2. implementer が歪んだテストを「変更禁止・pass させろ」と命じられ正しい実装を壊す。
3. bite-evidence が実装混入済み base で green→green を検出し、噛んでいるテストを hollow と誤判定して `failed → escalate` で停止する(issue #989 実例: aozu change op-element、再走 2 巡目で 7 ファイル中 4–5 が偽陰性)。escalation の出口は cancel → 再起票のみであり、resume / fixer / operator 裁定といった回復経路を塞ぐ。

1→2 は成果物の破壊、3 は dead end を生産する。テスト保証の強化機構が回復経路を塞ぐ構造になっていた。

本 change は連作「テスト証拠と工程順序の分離」の**第 1 弾**として、工程順序に由来する権威を撤回する(引き算)。テスト実行の観測記録(証拠)は残し、red の強制(権威)を消す。恒久的な baseline 再設計(Evidence Base: job 開始時の実装 tree + 最終テスト tree の合成)は後続 request に委譲する。

## Decision

工程順序から派生した 3 つの権威を撤回し、「証拠(実行と観測の記録)」と「権威(red 強制・テスト不可侵・断定的判定)」を分離する:

1. **test-materialize から red 強制の命令を削除する**。実行義務と観測記録(コマンド・対象ファイル・fail/pass 件数・期待分類)は維持。expected-red が green だった場合の指示は「書き直し」から「観測事実と考えられる理由を Evidence に記録し、判断を下流 review に委ねる」に変更する。初回 message の「confirm they fail (red)」も中立化する。
2. **implementer の `testsMaterialized` による「production code only / テスト変更禁止」指示を廃止する**。materialize 済みテスト存在時の指示を「test-cases.md と spec を canon(正)としてテストと実装の両方を整合させる。テストを変更した場合は変更点と理由を完了報告に明示する」に置換する。テストの正しさの根拠は canon との整合であり、「先に書かれたこと」ではない。
3. **bite-evidence に暫定の前提破れ検知を追加する**。base(最新 test-materialize run)より前に開始された implementer run で commitOid を持つものが state に存在する場合、red→green 判定を行わず「baseline 構築不能(base に実装混入)」を理由に明示した deferral(verdict: "strategy-deferred")を返し、verification へ遷移する。偽判定 → escalate を出さない。初回一巡の判定挙動は無変更。
4. archive floor (`deriveAchievedAssurance`) にも同じ前提破れ検知を適用し、汚染 baseline への偽の biteEvidence="required" 付与を防ぐ。

## Design Decisions

### D1: 引き算で直す — 条件分岐の追加ではなく命令の削除

test-materialize prompt から red 強制の命令文(`green は欠陥` / `書き直してから再実行` / `不一致は完了不可`)を**削除**する。「再走時のみ red 強制を無効化する」条件分岐は加えない。

- **採用理由**: green の意味(実装済みで通った / 見張っていない)は工程順序が破れた状態では原理的に判別できない。判別できない命令を条件付きで残すのは、壊れた前提の上に分岐を重ねる対症療法。証拠と権威を分離し、権威側だけを撤回する。
- **却下案**: 再走検知による prompt 切り替え → green の意味を判別できないまま命令が残る。条件分岐は問題を先送りするだけ。

### D2: implementer の指示を「canon 整合」に置換 — テスト不可侵の撤回

`buildImplementerInitialMessage` の `testsMaterialized` **true 分岐だけ**を書き換える。default(TDD)分岐と分岐構造は無変更。lockfile 同期指示・tasks.md checkbox 更新・end_turn 手順は true 分岐に残す。新しい成果物ファイルは増やさない。

- **採用理由**: テストの正しさの根拠は canon(test-cases.md)との整合であり、「先に書かれたこと」ではない。整合性の判定は下流 review の責務。
- **却下案**: テスト変更宣言の機械検証を足す → 「テストを触ったら咎める」新しい権威になる。request 明示で却下。

### D3: bite-evidence の前提破れ検知は純関数 + 既存 strategy-deferred の再利用

`src/core/step/bite-evidence/oids.ts` に純関数 `detectBaseImplementationContamination(state): string | null` を追加。既存 `resolveBaseCandidateOids` の署名は変えない(archive floor が共用)。

検知キー: base(最新 test-materialize) の run より**前に開始**された implementer run で commitOid を持つものが存在するか、を state の timestamp(`startedAt`)で判定する。pipeline は step を順次 commit するため、このキーは Git 祖先混入と対応する。「candidate が base の祖先か」では検知できない(実形状は正常な base → candidate)。

verdict は既存 "strategy-deferred" を再利用し、新 verdict / 新 transition は追加しない。`{ bite-evidence, strategy-deferred → verification }` が既存遷移テーブルに存在するため合流先が得られる。deferral が silent にならないよう `reason` に「baseline 構築不能 / base に実装混入」を明示する。

- **採用理由**: escalate で塞ぐと cancel → 再起票しか出口のない dead end を再生産する。gate は観測者として「証明できない」事実を記録して通し、判断材料を下流へ渡す。純関数化で unit test 可能、runtime 非依存(managed でも state だけで判定可)。
- **却下案**:
  - `resolveBaseCandidateOids` に汚染フラグを追加 → archive floor 側の呼び出しに波及するため別関数に分離した。
  - git ancestry 用の新 port method(`isAncestor`)追加 → runtime / fake 双方の実装と I/O が必要で重い。state の run 順序が pipeline の線形 commit と対応するため純関数で十分。
  - 新 verdict `deferred-contaminated` + 新 transition → 合流先は verification で strategy-deferred と同一のため冗長。

### D4: 前提破れは「偽判定」でも「封鎖」でもなく「判定不能の明示」

gate の責務は観測者として「証明できない」事実を記録して通すことであり、escalate で封鎖することではない。黙って素通りもしない(理由を必ず記録に残す)。

### D5: 「materialize commit = base」の意味付けはまだ消さない

置換先(Evidence Base: job 開始時の実装 tree + 最終テスト tree の合成)無しに消すと gate が拠り所を失う。本 change は前提破れ時の誤作動だけを止め、意味付けの削除は baseline 再設計 request で置換と同時に行う(暫定)。

### D6: archive floor にも同じ前提破れ検知を適用

D3 の deferral 化により汚染再走が archive まで到達可能になる。archive floor は gate と独立に `resolveBaseCandidateOids` で base を解決するため、汚染 base への偽の biteEvidence="required" 付与を防ぐ precondition として `detectBaseImplementationContamination` を共用する。

### D7: テスト変更の記録は prompt 指示に留め、機械の歯を作らない

変更宣言の機械検証を足すと「テストを触ったら咎める」新しい権威になる。整合性の判定は既存の review 工程(code-review / conformance)の責務のまま。

## Alternatives Considered

### Alternative 1: 再走検知による prompt 切り替え

re-run を検知した場合のみ test-materialize の red 強制を無効化する条件分岐を追加し、初回走行時は現行の red 強制を維持する案。

- **Pros**: 初回走行の動作(red 観測 → 完了)を変更せずに済む。re-run 経路のみに変更を閉じられる。
- **Cons**: expected-red が green だった場合の意味(実装済みで通過 / 見張っていない)は、工程順序が破れた状態では原理的に機械的に判別できない。命令文を条件付きで残しても、green の意味を確定できないまま agent が判断を迫られる構造は変わらない。
- **Why not**: 壊れた前提の上に分岐を重ねる対症療法であり、根本にある「green の意味の不判別性」を解消しない。証拠(観測記録)と権威(red 強制)を分離して権威側を撤回する方が最小の変更で問題を根絶できる。

### Alternative 2: テスト変更宣言の機械検証(歯の追加)

implementer がテストを変更した場合に宣言ファイルへの記載を義務化し、その宣言の有無を機械的に検証する歯(変更宣言の強制チェック)を追加する案。

- **Pros**: テスト変更が記録されることを機械的に保証できる。変更の見落としを減らせる。
- **Cons**: 「テストを変更したら咎める(変更禁止の残像)」という新しい権威を作る。変更自体を正当化するかどうかは canon との整合性であり、宣言の有無は整合性の証明にならない。新しい成果物ファイルが増え、工程が複雑化する。
- **Why not**: 整合性の判定は既存の review 工程(code-review / conformance)の責務。「テストを変更してはならない」という権威の撤回が本変更の目的であり、別形態の権威を追加するのは目的に反する(request 明示の却下事項)。

### Alternative 3: bite-evidence の escalation を維持する(現行 dead end のまま)

汚染再走での green→green 誤判定を放置し、escalation で停止する現行挙動を維持する案。

- **Pros**: bite-evidence のコードを変更しない。hollow テストへの感度が下がらない。
- **Cons**: cancel → 再起票しか出口のない dead end を再生産し続ける。resume / fixer / operator 裁定などの回復経路を永続的に塞ぐ。本来噛んでいるテストを hollow と誤判定して escalation で停止するため、issue #989 が示す通り再走のたびに手作業リセットが必要になる。
- **Why not**: gate の責務は観測者として「証明できない」事実を記録して通すことであり、誤判定を確定的判定として escalate することではない。dead end を量産する挙動を意図的に維持する理由がない。

### Alternative 4: `resolveBaseCandidateOids` に汚染フラグを追加する

既存の `resolveBaseCandidateOids` の戻り値に汚染フラグを持たせ、呼び出し側で分岐する案。

- **Pros**: 単一関数の拡張で実装量が少なく済む。
- **Cons**: `resolveBaseCandidateOids` は `src/core/archive/achieved-assurance.ts` も呼び出している。署名変更は archive floor 側の呼び出しにも波及し、型不整合が生じる。archive floor は呼び出しシグネチャを変えられない制約がある(design 明記)。
- **Why not**: archive floor 側への波及を避けるため、汚染検知は別関数 `detectBaseImplementationContamination` に分離した。`resolveBaseCandidateOids` の署名は不変のまま両呼び出し元が共用できる。

### Alternative 5: git ancestry `isAncestor` port の追加

「base の Git 祖先に implementer commit が含まれるか」を git コマンド(`git merge-base --is-ancestor`)で判定する port method を追加する案。

- **Pros**: Git の正確な祖先関係を使うため、状態管理の順序依存が無くなる。
- **Cons**: `isAncestor` の port interface を追加し、managed runtime と local runtime の双方で実装し、fake 実装も用意する必要がある。I/O を伴うため unit test の構成が複雑になる。
- **Why not**: pipeline が step を順次 commit するため、「base より前に startedAt を持つ implementer run の commit」は必ず base の Git 祖先になる。state の run 順序が Git の commit 順序と対応することが保証されているため、純関数で十分。runtime 追加のコストに見合う精度の向上がない。

### Alternative 6: 新 verdict `deferred-contaminated` と新 transition の追加

汚染検知専用の verdict `"deferred-contaminated"` を定義し、`{ bite-evidence, deferred-contaminated → verification }` の遷移行を追加する案。

- **Pros**: 汚染による deferral と通常の strategy-deferred を verdict レベルで区別できる。ログで容易に区別できる。
- **Cons**: 新しい verdict 値と遷移行の追加が必要。`types.ts` の変更が必要になり、合流先が既存 strategy-deferred と同一(verification)であるため実質的な差分は reason 文字列だけになる。
- **Why not**: request が「strategy-deferred と同じ合流先」を明示要求している。reason フィールドで汚染理由を明示することで verdict の種別増加なしに区別できるため、新 verdict / 新 transition の追加は冗長。

## Consequences

- **test-materialize の red 強制が消える**: expected-red が green だったテストを書き直さなくなる。green の観測事実と理由が Evidence に記録されて下流に渡る。hollow テストの検出は bite-evidence(前提保持時)と code-review / conformance が担う。
- **implementer がテストを変更できる**: canon(test-cases.md)との整合を根拠に、テストと実装の両方を修正できる。変更点と理由は完了報告に記録する。整合性の判定は下流 review の責務。
- **bite-evidence の再走 hollow 誤判定が止まる**: 汚染再走では failed → escalate に落ちず、strategy-deferred → verification へ遷移する。初回一巡の genuine hollow は従来どおり failed のまま。
- **archive floor が汚染 baseline を拒否する**: 汚染再走が archive まで到達しても、biteEvidence / testDerivation を absent のまま残す(fail-closed)。
- **暫定の上限**: timestamp(`startedAt`)の同値衝突では検知を見逃す(実 pipeline では分単位で離れるため実害は極小)。恒久解は Evidence Base 再設計 request で timestamp 依存を tree 合成へ置換する(`# ponytail: startedAt 全順序に依存、Evidence Base 導入時に tree 合成へ置換`)。
- **後続 request の起点**: 本 ADR は連作の第 1 弾。Evidence Base(baseline 再設計) / candidate の effective HEAD 化 / test-materialize step の統合は後続 request に委譲する。

## References

- Request: `specrunner/changes/strip-test-authority/request.md`
- Design: `specrunner/changes/strip-test-authority/design.md`
- Spec: `specrunner/changes/strip-test-authority/spec.md`
- Implementation: `src/prompts/test-materialize-system.ts` / `src/core/step/implementer.ts` / `src/core/step/bite-evidence/oids.ts` / `src/core/step/bite-evidence/gate.ts` / `src/core/archive/achieved-assurance.ts`
- Issue: #989 (aozu change op-element — 再走 2 巡目で bite-evidence が 7 ファイル中 4–5 偽陰性)
