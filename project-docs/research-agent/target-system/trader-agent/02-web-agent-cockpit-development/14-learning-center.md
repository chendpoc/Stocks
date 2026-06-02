# 14 Learning Center

## 目标与非目标

目标：实现 `/learning`，只展示有信息量的 Agent 学习结果：新 theory/rule candidate、低置信待确认项、Agent 自我反思和后置验证结果。

非目标：

- 不强迫每日生成 summary。
- 不创建或发布规则。
- 不写入学习对象。
- 不做完整回测中心。

## 内容类型

```text
new_playbook_theory_candidate
new_playbook_rule_candidate
low_confidence_item
agent_reflection
post_validation_result
no_new_learning
```

## 页面/组件拆分

| Component | Responsibility |
|---|---|
| `LearningPage` | route composition |
| `LearningFilterBar` | type, confidence, symbol, date filters |
| `LearningItemList` | meaningful learning list |
| `LearningDetailPanel` | evidence, proposed theory/rule, uncertainty |
| `NoNewLearningState` | explicit no-new-content state |
| `PostValidationCard` | compare scenario expectation vs market result |

## 数据输入输出

Inputs:

- `LearningItemViewModel[]`
- `PlaybookTheory` candidates
- `PlaybookRule` candidates
- `ToolSourceViewModel[]`
- optional validation results

Outputs:

- filter learning items
- open linked theory
- open linked signal
- open chat with learning context
- manual refresh

## API 与更新策略

Current state:

- no stable backend learning endpoint yet
- use mock fallback

Phase 1 required:

- `GET /api/learning`
- `GET /api/learning/{item_id}`

Update model:

- fetch on page entry
- manual refresh
- inbox can link to meaningful items only

## Display Rules

- If there is no new information, show `NoNewLearningState`.
- Do not produce filler summaries.
- Low-confidence candidates must explain missing evidence.
- Post-validation must compare original ScenarioPlan expectation with actual market behavior.

## 验收标准

- Page can show no-new-learning state.
- New theory candidate shows evidence and confidence.
- New rule candidate shows parent theory.
- Low-confidence item shows missing evidence.
- Post-validation result is clearly marked when available.
- No rule creation, publish or approval action appears.

## 测试场景

- Component test no-new-learning state.
- Component test new theory candidate.
- Component test low-confidence missing-evidence display.
- Component test post-validation comparison.
