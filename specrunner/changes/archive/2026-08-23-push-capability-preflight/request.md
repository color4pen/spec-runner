# push 能力の宣言に基づき push 不能な変更を実 diff で検出し、agent の自己修正を経て escalation する

## Meta

- **type**: new-feature
- **slug**: push-capability-preflight
- **base-branch**: main
- **adr**: false

## 背景

Actions の GITHUB_TOKEN は `.github/workflows/**` を変更する push を作成できない(GitHub 仕様。permissions ブロックに workflows スコープは存在せず、付与不可)。現状の pipeline はこの制約を知らないため、workflow ファイルの変更を含む request でも通常どおり走り、implementer の push で初めて remote rejected を知る。数十分走ってから完走不能と判明するのは最悪の知り方であり、環境の push 能力と request の要求は実行中に突き合わせて止めるべきである(#1059 実測・対応方向 B)。

**方針改訂**(2026-08-23 コメント参照): 当初案は request-review の predicted touchedFiles が該当した時点で design 前に escalation する形だったが、predicted touchedFiles は LLM 予測であり保証ではない。実際には workflow を変更せず要求を満たせる可能性があり、implementer が意図せず該当 path を触っただけなら人間へ即 escalation するより agent 自身に制約内で修正させる方が自然。権威を持つ判定は push 前の実 diff に置き、predicted touchedFiles は capability constraint の先行通知に使うのみとする。

## 方針(改訂後の流れ)

```text
execution capability
  .github/workflows/** = unpushable
        ↓
request-review / implementer に制約として先行通知
        ↓
implementer が通常どおり実装
        ↓
[検査層 1] implementer session 存命中に実 diff を検査
        ↓
unpushable path なし → 通過
        ↓ あり
同じ implementer へ 1 回 follow-up
「この実行環境では該当 path を publish できない。変更を除去するか、
 workflow 変更なしで要求を満たせる形に修正する」
        ↓
実 diff を再検査
├─ 解消 → 通過
└─ 残る → escalation
        ↓ 通過後
[検査層 2] commit / push 直前の決定的 backstop
├─ 該当 path なし → commit / push
└─ あり → push を試みず escalation(検査漏れ・別経路変更の最終防衛)
```

検査は 2 層に分かれる。follow-up を投げられるのは implementer session 存命中のみなので、修正機会を与える検査(層 1)は adapter の repair loop 内、決定的 backstop(層 2)は commit / push 直前に置く。層 2 は escalation only で、agent への修正機会は持たない。

request 自体が workflow 変更を必須とする場合、follow-up しても該当 path を除去できないため層 1 で escalation する。agent に一度解決機会を与えても、物理的に publish 不可能な request は決定的に止まる。

## 現状コードの前提

- 実測(#1059 / job c2c7ba44): GITHUB_TOKEN での workflow ファイル push は `refusing to allow a GitHub App to create or update workflow ... without workflows permission` で拒否される
- request-review step は変更予定ファイル一覧(state.touchedFiles)を生成する(LLM 予測であり保証ではない)
- `AgentRunPolicy.outputVerification`(`src/core/port/agent-runner.ts`)に detect() → violations → buildPrompt → 同一 session turn → 再検査の repair loop seam が既にあり、検査層 1 はここに乗せられる
- step 成果物の commit / push は `src/core/step/commit-push.ts`(commitAndPush / pushOnly)。検査層 2 はこの直前
- ephemeral runner は `.github/workflows/specrunner-dispatch.yml` から起動され、push 認証は GITHUB_TOKEN。git fetch/push はコマンド単位の transport auth で行われるため、使用 token の種別は CLI 側で判別可能

## 実装範囲

1. 環境が「push 不能な path pattern」を宣言・検出できる仕組みを導入する(Actions / GITHUB_TOKEN 環境では `.github/workflows/**`)。検出は CLI 側で完結させ、`.github/workflows/` の変更を必須としないこと(本 request 自体を remote 実行可能に保つため)
2. capability constraint を request-review / implementer の context へ先行通知する。predicted touchedFiles が宣言 pattern に該当しても pipeline は停止しない(通知のみ)
3. 検査層 1: implementer session 存命中に実 diff の変更 path を宣言 pattern と照合し、該当があれば同一 implementer へ 1 回 follow-up(該当変更の除去、または workflow 変更なしで要求を満たす形への修正)→ 再検査 → 解消しなければ escalation する
4. 検査層 2: commit / push 直前に実 diff を再照合し、該当 path があれば push を試みず、path と環境制約を明示した理由で escalation する(決定的 backstop)
5. 宣言・検出に該当しない環境(local 実行)の挙動は不変

## 非目標

- workflows 権限を持つ PAT / GitHub App の導入(agent の CI trust root 書き込みを許す権限拡張はしない)
- predicted touchedFiles 該当を理由とする pipeline 停止・escalation(通知のみに使う)
- 新しい pipeline step / lifecycle action の追加
- push 拒否後の halt 記録の保全(別 request: halt-checkpoint-restack)
- path pattern 以外の能力宣言(push サイズ制限等)

## 受け入れ条件

- [ ] 宣言 pattern 該当の実 diff を持つ implementer に follow-up が 1 回投げられ、解消後は commit / push に進むことをテストで固定する
- [ ] follow-up 後も該当 path が残るとき escalation することをテストで固定する
- [ ] 検査層 2 で該当 path があるとき push を呼ばず escalation し、拒否理由に該当 path と環境制約が明示されることをテストで固定する
- [ ] capability constraint が request-review / implementer の context に先行通知され、predicted touchedFiles 該当で pipeline が停止しないことをテストで固定する
- [ ] 該当しない diff / 宣言なし環境では挙動不変であること(既存テスト無変更で green)
- [ ] `typecheck && test` が green

## 関連

- #1059(対応方向 B)
- #1054(発生事案)
- 方針改訂の経緯: https://github.com/color4pen/spec-runner/issues/1061#issuecomment-5384876079