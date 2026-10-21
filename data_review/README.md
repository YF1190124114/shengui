# 第一阶段审计材料

状态：待用户确认；未生成或替换正式网络。

请依次阅读：

1. 01_data_audit_report.md：数据、结构、代码依赖与旧网络质量。
2. 02_relation_rebuild_rules.md：下一阶段门槛、证据分层和回滚流程。
3. 03_proposed_fields.md：拟改范围；proposed_field_changes.csv保留逐字段原值与候选。
4. 04_example_relations.md：10条示例；relations_evidence.csv为独立逐边证据表。

raw_record_index.csv固定140条原始记录对应；livelihood_82_review.csv覆盖82条民生节点结构筛查。audit_metrics.json与node_degrees_baseline.csv为旧数据指标，legacy_relations_review.csv为376条无证据旧边清单，legacy_relation_spotcheck_20.csv为20条旧边抽查。references.csv记录已读、未读与不可外推范围；low_confidence_examples.csv标出2条不应发布的低可信度示例。ambiguous_roster_references.csv列出17个重名目标引用。

所有CSV为UTF-8 BOM。raw_page_group必须以文本导入，防止024094丢失前导零。这里的CSV是审计交换表，不是正式网页输入。所有建议与示例均未批准。详见verification.json的文件完整性核对结果。
