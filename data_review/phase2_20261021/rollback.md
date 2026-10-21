# 回滚说明

第二阶段正式替换前的原样文件保存在data_backup/phase2_20261021/，其manifest.json记录SHA-256、working提交及main引用。该备份包含原network-data.js（376条旧边）、app.js、styles.css、index.html、README.md、onboarding.js与两份原CSV。

需要回滚时，先保留当前新版文件，再仅恢复该备份中的五个本次修改文件：network-data.js、app.js、styles.css、index.html、README.md。两份CSV本次未改动，不需要覆盖。逐一与备份SHA-256比对后，刷新本地网页。不要使用切换main或重置整个工作区的方式回滚，以免影响无关文件。

本阶段未执行Git add/commit、push或发布。第一阶段审计资料和原样备份仍保持原内容。
