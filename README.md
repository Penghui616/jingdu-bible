# 静读 · 圣经

适合手机的简体中文圣经网页，支持添加到 iPhone 主屏幕、离线阅读、经文搜索、多节选中和读经笔记。

用 Safari 打开网站，选择「分享 → 添加到主屏幕」。首次联网加载后，在关于窗口确认「离线经文已就绪」。助手设置中填写自己的千问 API Key；问答和朗读直接连接千问，需要联网，并按自己的 API 账户计费。

API Key 只保存在当前设备的浏览器存储中，不随网站发布，也不会包含在笔记备份中。它不是系统钥匙串，可信设备上使用，可在设置中清除。笔记仅保存在当前设备，请通过导出备份；更换网址后可导入。

本仓库只有公开静态文件，不包含后端、账号密钥或个人笔记。GitHub Pages 发布源为 main 分支根目录。

## 经文来源

经文来自 [thiagobodruk/bible](https://github.com/thiagobodruk/bible) 贡献者，固定版本 `13225a15fa5e3e3043495b0c82df56c3fdfeb7f4` 的 `json/zh_cuv.json`。上游仓库声明 [CC BY-NC 2.0 BR](https://creativecommons.org/licenses/by-nc/2.0/br/)。清理逐字空格，并以 OpenCC t2s 转换为简体，保留章节目次；不是另行校勘的简体出版版本。完整来源与变更见 [data/source.json](data/source.json)。
