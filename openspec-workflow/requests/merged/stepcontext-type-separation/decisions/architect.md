# Architect Decisions — stepcontext-type-separation

design.md の D1-D5 の設計判断を評価する :: delta spec の妥当性を構造的に検証するため

D1 (StepContext as supertype) を Liskov 置換原則の観点で評価する :: PipelineDeps extends StepContext により既存呼び出し元が壊れないことが型システムで保証される。正しい設計

D2 (StepDeps alias 変更) を影響範囲の観点で評価する :: alias 先変更で全 Step メソッドシグネチャが自動で狭まる。変更量が最小で、ミスの余地が少ない。Go 判定

D3 (ManagedAgentRunner から JobStateStore 除去) を責務分離の観点で評価する :: adapter は通信、executor は永続化という責務分離は正しい。_updatedState は adapter と executor の責務混在から生じた technical debt。除去は妥当

D4 (executor 1 本化) をコードパスの一貫性の観点で評価する :: managed/local で同一 state 管理フローを通ることで、振る舞いの一貫性が保証される。正しい方向

D5 (ClaudeCodeRunner deps 構築変更) を型安全性の観点で評価する :: undefined as any 4 箇所がゼロになる。型安全性の回復として適切

delta spec の Step interface 変更で resultFilePath / parseResult に deps パラメータが追加されている点を確認する :: 既存 spec (main) では resultFilePath(state) / parseResult(content) だが、実装は既に deps を受け取っている。delta spec はこの既存の spec-implementation divergence を正しく解消する MODIFIED として記述している

executor の store.update(state, { step: step.name }) が runCliStep にのみ存在し runAgentStep に無い点を確認する :: delta spec が要件として runAgentStep 冒頭への追加を明記しており、specrunner ps の step 表示バグ修正として正しい

observability 低下リスクを評価する :: ManagedAgentRunner の中間 history (session-created, register_branch-received 等) が消える。design.md の緩和策（executor に step-start/step-complete history entry 追加）は最低限。中間状態の詳細は後続改善で対応という判断は現実的

sessionId の propagation gap を指摘する :: executor の local path で pushStepResult に session: null を渡している。delta spec は result.sessionId を記録すると要求しているが、pushStepResult の session フィールド型との整合を実装者が確認する必要がある。spec としては正しい要求
