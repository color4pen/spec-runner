# Design: permissionScope 宣言 pipeline で forbidden 空のとき run 準備で warning を出す

## Context

`permissionScope` を宣言する pipeline profile（現状は fast のみ）は、conformance checkpoint で「変更が禁止サーフェスに触れたか」を機械導出して scope breach を escalation する。禁止サーフェス（forbidden）は registry の静的定数ではなく、実行時に repo config（`pipeline.fast.forbiddenSurfaces`）から解決される。config 未設定の repo では解決後の forbidden が空になり、breach 検出は一切発火しない。

これは意図的な設計である（`registry.ts` のコメント「Empty forbidden = no protected surfaces declared for this repo = no breach detection」）。しかし利用者からは「fast profile には scope 制限がある」と見えるため、実際には保護が無効なのに保護されていると誤認するギャップが生じる。scoped pipeline を実際に走らせる瞬間（run 準備段階）に、検出が実質無効であることを明示する warning を 1 回出すことで、この誤認を解消する。

### 現状の構造（変更の土台）

- **宣言**: `FAST_DESCRIPTOR.permissionScope = { checkpoint: "conformance", forbidden: [] }`（`registry.ts`）。forbidden は静的に空で、実行時に config から注入される。
- **pure 変換**: `applyScopeConfig(base, config)`（`resolve-scope.ts`）。`base.permissionScope === undefined`（standard / design-only）→ base を参照同一で返す。presence あり → `{ ...base, permissionScope: { checkpoint, forbidden: <config 解決値> } }` を返す。副作用のない pure 変換であり、この契約は維持する。
- **config 解決**: `resolvePipelineForbiddenSurfaces(config, pipelineId)`（`schema.ts`）が唯一の resolver。`pipelineId === "fast"` → `config.pipeline?.fast?.forbiddenSurfaces ?? []`（キー欠落と空配列を区別しない）、それ以外 → `[]`。
- **presence 判定の前例**: `assertRuntimeSupportsScope(descriptor, runtime)`（`runtime-capability-gate.ts`）は `descriptor.permissionScope !== undefined` の presence のみで判定し、profile 名分岐を持たない。本変更の判定もこの一般形に倣う。
- **run 準備の配線**: `CommandRunner.execute()`（`runner.ts`）が Template Method で run/resume 共通の実行フローを持ち、Step 5 で `buildPipelineForJob(jobState, deps, events)`（`run.ts`）を 1 回呼んで pipeline を組み立てる。`buildPipelineForJob` は内部で `applyScopeConfig(base, deps.config)` を呼び、scope 解決済み descriptor を得る。
- **呼び出し回数**: 現状 `CommandRunner.execute()` では `buildPipelineForJob` は run につき 1 回のみ呼ばれる（request-review finding #2）。request 要件 5 の「複数回呼ばれうる」は将来の refactor に対する防衛的記述であり、本 design は「warning を run 準備の 1 回に構造的に固定し、`buildPipelineForJob` の呼び出し回数に依存させない」ことでこれを満たす。
- **warning 出力の慣例**: `logWarn(message)`（`logger/stdout.js`）が stderr に `Warning: <message>` を出す。quiet で抑止、default 以上で出力。

## Goals / Non-Goals

**Goals**:

- `permissionScope` を宣言する descriptor に対し、config 解決後の forbidden が空である場合、run 準備段階で warning を 1 回出力する。
- 判定を「permissionScope の宣言 + 解決後 forbidden 空」の一般述語にする（profile 名分岐なし）。将来 scope を宣言する別 profile も同じ判定に自然に乗る。
- warning のみで実行は止めない（forbidden 未設定は正当な構成）。
- `applyScopeConfig` の pure 変換契約（副作用なし・permissionScope なし → 参照同一）を不変に保つ。
- 1 run 内で warning が重複しない。

**Non-Goals**（request スコープ外を継承）:

- doctor への同種チェックの追加。
- 「明示的な空配列 = 意図的 opt-out」を区別する config 語彙の新設。warning の抑止は surface を 1 件以上設定することで行う。
- breach 検出ロジック・checkpoint・descriptor 本体の変更。
- inbox / unattended 経路での通知形式の変更（stdout/stderr の warning のみ）。
- `resolvePipelineForbiddenSurfaces` の fast 以外への配線拡張。

## Decisions

### D1: 判定は「解決後 descriptor の permissionScope presence + forbidden 空」の一般述語

warning を出すか否かは、config 解決後の descriptor に対する pure 述語で決める:

```
permissionScope !== undefined  AND  permissionScope.forbidden.length === 0
```

- permissionScope 不在（standard / design-only）→ 述語 false → warning なし。
- forbidden ≥ 1 → 述語 false → warning なし。
- permissionScope あり + forbidden 空 → 述語 true → warning。

判定対象は必ず `applyScopeConfig` 適用後の descriptor である（静的 `FAST_DESCRIPTOR` は常に forbidden 空なので、config 解決前を見てはならない）。

- **Rationale**: `assertRuntimeSupportsScope` と同じ presence ベースの一般形。#746 の「scope は descriptor の permissionScope から導出し、profile 名に結び付けない」という既存設計と整合する。`fast` という名前への分岐を新設しない。
- **Alternatives considered**:
  - `pipelineId === "fast"` で分岐 → 却下: profile 名依存は既存設計思想（presence 導出）に反し、将来 profile 追加時に判定漏れを招く。
  - config（`resolvePipelineForbiddenSurfaces`）側で判定 → 却下: config layer は「どの pipeline が scope を宣言しているか」を知らない。判定は descriptor の presence を持つ core/pipeline layer に置く。

### D2: warning のみで実行は止めない

述語が true でも pipeline は通常どおり実行する。warning は stderr（`logWarn`）に 1 行出すだけで、exit code や状態遷移に影響しない。

- **Rationale**: forbidden 未設定は正当な構成（repo 固有の保護面は repo が決める）。fail-closed にすると新規 repo の fast 導入を阻害する。目的は誤認の解消であって強制ではない。
- **Alternatives considered**: fail-closed（forbidden 空で着手前 reject）→ 却下（上記）。capability gate（presence で導出不能 runtime を reject）は別レイヤの保証として残る。

### D3: 実装位置は `CommandRunner.execute()` の run 準備点（Step 5 直前）。emission は run につき 1 回

warning の emission を、`buildPipelineForJob` を呼ぶ直前の run 準備点（`runner.ts` の Step 5）に 1 箇所だけ置く。この点は run/resume 共通の Template Method 上にあり、1 プロセス（1 run）につき 1 回だけ通過する。

- warning は `buildPipelineForJob` の**内部**には置かない。内部に置くと、将来 `buildPipelineForJob` が 1 run 中に複数回呼ばれた場合に重複する。emission を run 準備点に置くことで、`buildPipelineForJob` の呼び出し回数に関わらず 1 回に固定される（要件 5 を構造的に満たす）。module-level の可変フラグ等の抑止 state は導入しない。
- run（`PipelineRunCommand`）と resume（`ResumeCommand`）は共に `CommandRunner.execute()` を通るため、両経路で run につき 1 回 warning が出る。これは「scoped pipeline を実際に使う瞬間に誤認を解く」という目的に沿う（resume も scoped pipeline を走らせる run である）。
- emission は setupWorkspace / buildDeps 成功後の Step 5 に置く。setup 失敗で早期 return する run では pipeline を走らせないため warning も出さない（scope の誤認が問題になるのは実際に走らせるときのみ）。

- **Rationale**: run 準備点は 1 run につき 1 回の自然な境界。emission をそこに固定すれば抑止 state 不要で重複しない。`applyScopeConfig` / `buildPipelineForJob` の pure/build 責務を汚さない。
- **Alternatives considered**:
  - `PipelineRunCommand.prepare()` に置く → 却下寄り: job start（run）しかカバーせず resume を漏らす。共通点である `execute()` に置く方が一様。
  - `applyScopeConfig` 内で warning → 却下: pure 変換契約を破る（要件 5 の明示制約）。かつ 1 run 中に複数回呼ばれると重複する。
  - `buildPipelineForJob` 内で warning + module-level dedup フラグ → 却下: 可変 module state はテスト間リーク・プロセス跨ぎの複雑さを生む。emission 位置を 1 回通過点に置けば state 不要。

### D4: pure な判定・文言と、副作用ある emission を分離する（新 module `scope-warning.ts`）

新規 pure module `src/core/pipeline/scope-warning.ts` を追加し、判定と文言を I/O から分離する。

- `scopeConfigEmptyWarning(descriptor: PipelineDescriptor): string | null` — D1 の述語を評価し、true なら warning 文言（string）、false なら `null` を返す pure 関数。ログは出さない。
- `scopeConfigWarningForJob(jobState: JobState, config: SpecRunnerConfig): string | null` — job から base descriptor を解決（`getPipelineDescriptor(getPipelineId(jobState))`）→ `applyScopeConfig(base, config)` → `scopeConfigEmptyWarning(scoped)` に委譲する pure 関数。ログは出さない。

`CommandRunner.execute()` はこの pure 関数を呼び、返り値が非 null のときだけ `logWarn` する。ログ出力（副作用）は command layer に閉じ、判定は core/pipeline layer の pure 関数に閉じる。

- **Rationale**: `applyScopeConfig`（`resolve-scope.ts`）を一切触らずに pure 契約を維持できる。pure 判定は logWarn を mock せずに直接単体テストでき、emission（1 run 1 回）は command layer で別に固定できる。`runtime-capability-gate.ts`（pure 判定）と `pipeline-run.ts`（呼び出し・throw）の分離と同型。
- **Alternatives considered**:
  - `resolve-scope.ts` に判定関数を追加 → 却下寄り: registry / pipeline-id への import が増え、pure 変換 module の責務が混ざる。独立 module の方が凝集度が高い。

### D5: import 経路と config source

- `runner.ts` は `scopeConfigWarningForJob` を `../pipeline/scope-warning.js` から**直接** import する（`../pipeline/index.js` 経由にしない）。command layer が pipeline submodule を直接 import するのは既存パターン（`pipeline-run.ts` が `runtime-capability-gate.js` / `registry.js` を直接 import）と一致する。index.js 経由にしない理由は D6 参照。
- `scopeConfigWarningForJob` に渡す config は、`CommandRunner.execute()` が `prepare()` から受け取る `config`（preflight で load 済みの authoritative config）を用いる。`buildDeps(config, ...)` が `deps.config` を同じ config から導出するため、pipeline が使う scope 解決と一致する。

## Risks / Trade-offs

- **[Risk] 既存 `runner.test.ts` が `vi.mock("../pipeline/index.js")` で pipeline index を丸ごと mock している**（`createStandardPipeline` / `buildPipelineForJob` のみ提供）。もし `execute()` が warning 関数を index.js 経由で import すると、mock に存在せず `undefined` 呼び出しで既存テストが全滅する → **Mitigation**: D5 のとおり `scope-warning.js` から直接 import する。同 module は runner.test.ts で mock されないため既存テストに無影響（standard jobState では述語 false で warning は出ない）。
- **[Risk] `execute()` で scope 解決を再度行う（`buildPipelineForJob` 内でも解決している）二重解決** → **Mitigation**: `getPipelineDescriptor`（Map lookup）+ `applyScopeConfig`（config 読み + spread）はいずれも副作用なし・O(1) の pure 処理で、run 準備で 1 回追加実行しても実害はない。二重解決を避けるための signature 改変（`buildPipelineForJob` に解決済み descriptor を渡す等）は波及が大きく、対価に見合わない。
- **[Risk] resume でも warning が出ることでノイズになる** → **Mitigation**: resume は明示的な再実行であり、scoped pipeline を再度走らせる run なので誤認解消の対象。1 run 1 回に留まるため過剰ではない。
- **[Risk] warning 文言のテスト脆弱性** → **Mitigation**: テストは文言全体一致ではなく安定 substring（pipeline id、`forbiddenSurfaces` を含む config キー、「scope-breach 検出が無効」を表す語）で assert する。文言は spec に固定する。
- **[Trade-off] `resolvePipelineForbiddenSurfaces` は現状 `fast` のみ配線**。将来 `fast` 以外で `permissionScope` を宣言する profile を registry に追加すると、その profile の forbidden は resolver 上常に空となり warning が常時発火する。これは「resolver 配線が未実装」という別 request の課題であり、本変更の判定（一般形）はそのままで正しい（誤認解消の目的に合致）。本 request のスコープ外。

## Open Questions

- warning 文言を英語 / 日本語どちらに揃えるか。`logWarn` の既存メッセージは英語、scope 系の `UnsupportedRuntimeCapabilityError` は日本語で、慣例が割れている。本 design は spec で英語文言を canonical として固定し、テストは substring で assert する方針を採る（実装時に確定）。
- `docs/configuration.md` の Pipeline セクションに「forbidden 空 = warning」の一文を追記するかは follow-up。本 request の受け入れ基準には含まれないためスコープ外とする。
