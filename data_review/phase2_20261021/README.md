# 第二阶段本地修订交付

1. 01_data_diff_report.md：差异、证据边界和待人工确认事项。
2. functions_review_140.csv：140条职能核查，包含原值、现值、来源、局限与待核状态。field_review_700.csv为五个字段逐项状态，field_changes.csv记录实际变化。
3. relations_evidence.csv：逐条新关系证据；excluded_relation_candidates.csv为排除候选，references.csv/JSON为文献目录。
4. 04_network_statistics.md/JSON：类型、部门、度数、孤立与跨部门统计。low_confidence_relations.csv为正式网络低可信度边清单（本版为空）。
5. manual_relation_review_checklist.csv及05_manual_review_readme.md：全部实际新边与排除候选的人工签核清单。
6. 06_local_test_report.md与verification.json：静态、图片及本地浏览器验证结果（测试完成后生成）。

所有CSV采用UTF-8 BOM；ID与原页码组按文本导入。原始CSV保持不动，原始数据与AI解释、设计关系分层保存。新版网页读取根目录network-data.js，不需要联网请求数据或证据；来源链接由用户主动打开。Git未提交或推送。

可在仓库根目录运行 `python3 data_review/phase2_20261021/verify_data.py` 复算静态约束。浏览器测试方式和限制见06报告。
