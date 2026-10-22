# 清华网络学堂课程 DDL

在清华网络学堂的学生课程首页，将最近一个未来、未提交作业的截止日期和倒计时显示在课程标题同一行，减少额外占用的卡片空间。

**[一键安装到油猴（Tampermonkey）](https://raw.githubusercontent.com/CoolLiang1/thu-homework-deadlines/main/thu-homework-deadlines.user.js)**

先安装并启用 [Tampermonkey](https://www.tampermonkey.net/)，点击上方链接后，在油猴页面确认安装即可。

## 功能

- 紧凑的日期标签，例如 `10月21日 · 剩6天`，根据剩余时间区分颜色。
- 保留课程顺序、原课程链接、作业计数与公告等状态栏。
- 显示最近 72 小时内的逾期数量；更早的逾期不占据提醒位置。
- 支持长标题缩略、完整摘要、手动刷新与键盘收起菜单。
- 使用网站正常的同源作业页面读取数据，无远程依赖或外部服务。

## 安装与更新

1. 在浏览器中安装并启用 [Tampermonkey](https://www.tampermonkey.net/)。
2. 点击[一键安装脚本](https://raw.githubusercontent.com/CoolLiang1/thu-homework-deadlines/main/thu-homework-deadlines.user.js)，在油猴安装页面点击“安装”。
3. 登录后刷新[清华网络学堂学生课程首页](https://learn.tsinghua.edu.cn/f/wlxt/index/course/student/)。

当前版本为 **0.4.1**，脚本名称为“清华网络学堂：课程内嵌作业 DDL”。若曾安装名称带“候选版”的旧脚本，安装后请停用或删除旧条目，避免重复运行。

脚本直接通过本仓库公开的 `.user.js` 地址分发，无需另行部署网站。安装版已配置 GitHub 下载和更新地址；后续发布时递增版本号，油猴即可按自身设置检查更新，也可在其管理面板手动检查更新。元数据字段说明见 [Tampermonkey 官方文档](https://www.tampermonkey.net/documentation.php?q=update_url)。

如果链接打开后只显示源码，请确认油猴已启用，并按扩展提示开启浏览器所需的用户脚本权限。详细显示规则和读取限制见[安装与使用说明](docs/安装与使用说明.md)。

## 开发与检查

需要 Node.js 20 或更新版本。打包命令需要 PowerShell 7（`pwsh`），布局测试默认使用本机 Google Chrome。

```powershell
npm.cmd ci --prefix tests --ignore-scripts --no-audit --no-fund
npm.cmd run check
npm.cmd test
npm.cmd run test:layout
npm.cmd run package
```

`test` 在三个时区运行日期和正常页面读取回归；`test:layout` 使用独立 Chrome 配置与 localhost 合成页面。Chrome 路径不同时，先设置环境变量 `THU_DDL_TEST_CHROME`。两类测试都不会访问用户真实课程或使用日常浏览器配置。

新测试结果、浏览器截图和隔离配置写入 `artifacts/`，交付 ZIP 与 SHA256 清单写入 `dist/`。这些文件不会提交到 Git。

## 目录

```text
thu-homework-deadlines.user.js  用户脚本
docs/                         使用说明、验证记录及历史合成测试结果
tests/                        回归测试、浏览器夹具与锁定依赖
scripts/package.ps1           交付包与校验清单生成脚本
tools/inspect-dom.js           手动输出非敏感 DOM 结构的辅助工具
artifacts/                    本地生成的测试结果（忽略）
dist/                         本地生成的交付包（忽略）
private-diagnostics/           原有截图、备份及诊断环境（仅本地、忽略）
```

## 验证范围

已完成的本地合成回归和浏览器检查见[验证记录](docs/验证记录.md)。这些结果不能替代真实登录页面的布局与数据验收；标题同行版本仍待真实页面确认。

脚本只在页面内存中处理数据，不提交或修改作业，不读取或保存 Cookie、令牌及密码。关闭脚本并刷新课程首页即可移除提醒。
