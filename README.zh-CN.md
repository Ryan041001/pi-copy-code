# pi-copy-code

一个用于 [Pi](https://pi.dev) 的小型扩展：从已完成的助手回复中提取 Markdown 代码块，并复制到系统剪贴板。只复制代码，不会执行代码。

[English](README.md)

## 安装

需要 Pi 和 **Node.js 22.19 或更高版本**（与已测试 Pi 版本的最低要求一致）。

```sh
pi install git:github.com/Ryan041001/pi-copy-code
```

重启 Pi 或输入 `/reload`。如只想临时试用、不写入 package 设置，可运行 `pi -e git:github.com/Ryan041001/pi-copy-code`。

Pi 会自动加载 package 中声明的扩展；不需要手动修改 `settings.json`，也不会占用快捷键。

## 使用

- `/copycode`：查找最近一条已完成的助手回复中的代码。只有一个代码块时直接复制；有多个时打开选择器。
- `/copycode 2`：直接复制该回复的第二个代码块。
- `/copycode history`：从当前会话分支最近的最多 100 个代码块中选择。

在选择器中用方向键选择，按 **Enter** 复制，按 **Esc** 取消。历史列表按回复从新到旧排列，同一条回复中的代码块保持原顺序。较新的回复如果没有代码，不会遮住最近一条含代码的回复。选择器和成功提示会显示来源时间。

## 兼容性

- 已在 Pi **1.0.2** 和 Node.js **24** 上测试；扩展使用 Pi 提供的公开扩展、Markdown/TUI 和剪贴板 API。
- 需要 Pi **1.0.2 或更新版本**及 Node.js **22.19 或更新版本**。
- 支持 Pi 交互式 TUI。RPC、JSON 和 print 模式会被明确拒绝，因为复制操作需要交互式界面。
- 剪贴板由 Pi 处理，因此平台与终端支持遵循 Pi 自身的剪贴板实现（macOS、Windows、Linux、WSL，以及受支持的远程终端剪贴板方式）。在 Linux 或远程会话中，可能需要安装相应剪贴板工具或启用终端集成。

## 数据处理与安全

- 只读取当前会话分支中已完成的助手文本；忽略用户消息、工具输出/参数、隐藏思考和未完成回复。
- 保留代码空白，包括缩进、制表符、空行和行尾空格。Markdown 解析会把 CRLF 规范化为 LF，并移除围栏/引用/列表结构；不会额外添加末尾换行。
- 选择器预览会过滤终端控制字符；复制的源代码不会被改写。
- 不执行复制的代码、不访问网络、不注册快捷键。粘贴或运行前请检查代码。
- Pi 扩展以 Pi 进程权限运行。如果不信任来源，请先检查代码再安装。

## 开发与测试

```sh
npm install --no-save --package-lock=false
npm test
npm run check:package
```

测试使用 Node 自带的测试运行器和注入的假剪贴板，并通过已安装的 Pi 扩展加载器验证扩展；不会修改真实剪贴板。如果 Pi package 不在项目可解析路径或标准全局 Node 安装路径下，可用 `PI_PACKAGE_DIR` 指定其目录。

在本目录运行 `pi -e .` 可临时加载本地 package。扩展已加载后，修改代码需输入 `/reload` 或重启 Pi。

## 卸载

```sh
pi remove git:github.com/Ryan041001/pi-copy-code
```

## 许可证

MIT，详见 [LICENSE](LICENSE)。
