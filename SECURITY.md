# 安全反馈

报告中不要附带 API Key、账号口令、个人路径、私人音视频或其他用户的数据。先使用本地模拟服务和虚构素材离线复现；如 Key 曾公开泄漏，请在对应服务处撤销并重新生成。

安全漏洞请通过[GitHub 私密漏洞报告](https://github.com/liying-main/liying_ai/security/advisories/new)提交。请勿在公开 Issue 中提交可直接利用的漏洞细节或任何秘密。普通故障请使用 Bug 模板。

本机配置目前使用明文 `station-config.json`。请仅向可信服务配置并发送 Key，不要将该文件包含在日志或开源发布包中。
