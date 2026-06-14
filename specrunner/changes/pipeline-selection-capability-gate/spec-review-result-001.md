# Spec Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:    specification is complete, consistent, and ready for implementation
  - needs-fix:   specification has issues that must be resolved before implementation
  - escalation:  unresolvable conflicts, missing context, or requires human judgment
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | File | Description | How to Fix
- Valid Severity values (uppercase): CRITICAL | HIGH | MEDIUM | LOW
  - CRITICAL: production outage, data loss, security breach
  - HIGH:     functional failure, clear bug, no workaround — blocks approval
  - MEDIUM:   quality degradation, maintainability issue, future risk
  - LOW:      informational, style, minor improvement
- If no findings, write a table row with "None" or omit the table body.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | Completeness | spec.md | `UnsupportedRuntimeCapabilityError` のモジュール配置が spec.md では未記述。request-review で同様の指摘があったが、design.md (D4) と tasks.md (T-02) が `src/core/pipeline/runtime-capability-gate.ts` と明示しており整合している。 | 実装者は design.md D4 を参照。変更不要。 |
| 2 | LOW | Test strategy | tasks.md (T-05) | `PIPELINE_REGISTRY` への直接 mutation は Vitest のワーカースレッド分離でファイル間リークしないが、その前提が明示されていない。beforeEach/afterEach による対称化の指示は正しい。 | 変更不要。T-05 の記述は正確。実装時にユニーク fixture id と afterEach 削除を守れば問題なし。 |

## Review Notes

### コード参照の全件検証

request.md・design.md が「検証済み」と主張するコード参照をすべて実測した。

| 参照 | 主張 | 実測 |
|------|------|------|
| `pipeline-run.ts:92` | `pipelineId: STANDARD_PIPELINE_ID` ハードコード | ✅ 確認 (line 92) |
| `registry.ts:107` | `PIPELINE_REGISTRY` に 2 エントリ | ✅ `standard` / `design-only` のみ |
| `registry.ts:116` | `getPipelineDescriptor` が未知 id で既知 id 一覧付き throw | ✅ 確認 |
| `pipeline-run.ts:71-79` | `validateReviewerDefinitions` が `bootstrapJob` 前 | ✅ line 79 / bootstrapJob は line 83 |
| `types.ts:49` | `PermissionScope` 型が `checkpoint + forbidden[]` | ✅ 確認 |
| `runtime-strategy.ts` | `canDeriveChangedFiles?()` が optional | ✅ 確認。`RealRuntimeStrategy` 型で concrete impl に required 化 |
| `ParsedRequest` / `ParsedRequestRaw` | `pipeline` フィールド現状無し | ✅ grep 0 件 |
| `PIPELINE_REGISTRY` scope 宣言 profile | 0 件 | ✅ `STANDARD_DESCRIPTOR` / `DESIGN_ONLY_DESCRIPTOR` ともに `permissionScope` 無し |
| `runDesignPipeline` production 呼び出し元 | test-only | ✅ `src/cli/` に呼び出しなし |

### 設計正当性

**D1（parser 層が registry を import しない）**: `ParsedRequestRaw.pipeline` を raw 抽出のみとし、妥当性検証は `getPipelineDescriptor` に委ねる判断は DSM 上正しい。`src/parser` → `src/core/pipeline` の逆向き依存を作らない。

**D2（gate 純関数・`permissionScope` 有無から導出）**: `descriptor.permissionScope !== undefined && runtime.canDeriveChangedFiles?.() === false` の厳密比較は正確。`undefined === false` が `false` になる JavaScript の仕様により、predicate absent の fake は透過する（#692 seam 契約と一致）。profile 名でなく `permissionScope` 有無から導出することで、将来の scope 宣言 profile は descriptor 登録だけで gate を継承する。

**D3（gate 位置）**: 現コードの挿入点（`validateReviewerDefinitions` 後・`bootstrapJob` 前）は正確。`bootstrapJob` は in-memory only（`WorkspaceOptions.bootstrapState` で永続化は `setupWorkspace` に遅延）なので、gate 後の throw で state file / worktree が生まれない契約が成立する。

**D4（`UnsupportedRuntimeCapabilityError`）**: 能力ベースの文言（「changed-files を導出できる runtime が必要」）は managed が将来能力を得ても陳腐化しない。`ReviewerValidationError` と同じ「prepare() 内 throw → CLI message 表示」経路に自然に乗る。

**D5（inert gate ＋ fixture 検証）**: `PIPELINE_REGISTRY` 初期化子への追加なし → production で gate は発火し得ず、既存挙動完全一致が保証される。gate 純関数は fixture descriptor 直渡しで独立検証できる（D2 の純関数抽出の利点）。

**D6（Meta 経由 design-only）**: `DESIGN_ONLY_DESCRIPTOR.permissionScope === undefined` なので gate は inert。`PIPELINE_IDS.DESIGN_ONLY === "design-only"` と `getPipelineDescriptor("design-only")` の到達性は registry で確認済み。`runDesignPipeline` は production dead path であり、2 経路の衝突は production で発生しない。

### テスト戦略評価

T-04（gate 純関数単体）→ T-05（call-site 結合、bootstrapJob spy で state 未作成証明）→ T-06（registry 不変・FindingResolution 不変）の 3 層構成は適切。特に T-05 の「`bootstrapJob` spy が未呼び出し」による behavioral 証明は、「state を作らない」要件を副作用観察で正確に固定する。

### セキュリティ評価

- pipeline id は request.md Meta（作者管理ファイル）から読み取られ、`PIPELINE_REGISTRY` オブジェクトのルックアップキーとして使用される。SQL / シェル / HTML への注入経路なし。
- 未知 id は `getPipelineDescriptor` が例外で弾き、`bootstrapJob` に到達しない。
- capability gate は「分かっている不適合を前段で弾く」fail-closed 機構であり、セキュリティバウンダリとは性質が異なるが、誤用による望まない pipeline 起動を阻止する。
- OWASP Top 10 該当項目なし（CLI ツール、ユーザー入力は markdown ファイルのみ）。

### 総評

3 ドキュメント（design.md・spec.md・tasks.md）はすべて request.md の要件と整合し、相互に一貫している。コード参照は全件実測で正確。受け入れ基準は測定可能かつ網羅的。LOW 2 件はいずれも実装者が自明に解決できる粒度でありブロッカーとならない。実装に進んで問題ない。
