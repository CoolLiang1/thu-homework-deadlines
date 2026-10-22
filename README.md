# 清华网络学堂课程 DDL

在清华网络学堂的学生课程首页，将最近一个未来、未提交作业的截止日期和倒计时显示在课程标题同一行，减少额外占用的卡片空间。

## 功能

- 紧凑的日期标签，例如 `10月21日 · 剩6天`，根据剩余时间区分颜色。
- 保留课程顺序、原课程链接、作业计数与公告等状态栏。
- 显示最近 72 小时内的逾期数量；更早的逾期不占据提醒位置。
- 支持长标题缩略、完整摘要、手动刷新与键盘收起菜单。
- 使用网站正常的同源作业页面读取数据，无远程依赖或外部服务。

## 安装

1. 在浏览器中安装 Tampermonkey。
2. 打开 [`thu-homework-deadlines.user.js`](thu-homework-deadlines.user.js)，复制全部内容到 Tampermonkey 的新脚本或原脚本中，保存并关闭重复脚本。
3. 登录后刷新[清华网络学堂学生课程首页](https://learn.tsinghua.edu.cn/f/wlxt/index/course/student/)。

当前版本为 **0.4.0 标题同行修订**。详细显示规则和读取限制见[安装与使用说明](docs/安装与使用说明.md)。

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
