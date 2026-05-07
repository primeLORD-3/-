[README.md](https://github.com/user-attachments/files/27467802/README.md)
# Pet Bridge Desktop

Pet Bridge Desktop 是一个本地桌宠适配器。当前默认桌宠是希尔薇，支持 Codex `/hatch pet` 生成的精灵表、桌面置顶宠物窗、右键轮盘、可爱的气泡回复、左键双击对话框、LLM 回复、TTS 和可编辑提示词系统。

## 功能

- 桌面透明置顶宠物窗口
- 希尔薇默认宠物资源：`assets/pet.json` + `assets/spritesheet.webp`
- 控制台动态读取宠物动作；宠物有多少个 `states`，控制台就显示多少个动作按钮
- 可打开“按键映射”面板，为每个动作设置快捷键
- 左键拖动宠物，快速拖动时会限制异常坐标，避免 Electron 主进程崩溃
- 左键双击宠物打开小对话框，可直接和模型对话
- 右键打开桌宠轮盘，可切动作、缩放和打开控制台
- LLM 支持 OpenAI-compatible Chat Completions 或 Responses endpoint
- TTS 支持系统语音，或 OpenAI-compatible `/audio/speech`

## 运行依赖

必须安装：

- Windows 10/11
- Node.js 22.12.0 或更高版本
- npm 10 或更高版本

项目依赖：

- Electron `^42.0.0`

可选依赖：

- OpenAI-compatible LLM API，用于模型对话
- OpenAI-compatible TTS API，用于语音朗读
- 系统自带语音合成也可以直接使用，不配置 TTS API 也能朗读

## 安装与启动

第一次运行：

```powershell
npm install
npm start
```

也可以双击：

```text
启动桌面桌宠.bat
```

这个批处理会在缺少 Electron 运行时时自动执行 `npm install`，然后启动桌面桌宠。

网页版保留为调试和预览用途：

```powershell
npm run web
```

或者双击：

```text
打开网页版.bat
```

静态网页版不能把桌宠置顶到所有程序上方，真正桌面宠物请使用 Electron 桌面版。

## LLM 配置

打开控制台后，在“接口”区域填写：

- `LLM Base URL`：例如 `https://api.openai.com/v1`
- `LLM Model`：你的模型名
- `LLM API Key`：可填在界面，也可通过环境变量提供

可用环境变量：

```text
PET_BRIDGE_LLM_BASE_URL=https://api.openai.com/v1
PET_BRIDGE_LLM_MODEL=
PET_BRIDGE_LLM_API_KEY=
```

控制台还可以编辑：

- 系统人设 System Prompt
- Assistant Message
- TTS Prompt / Instructions
- 历史对话

桌宠双击打开的小对话框会复用控制台保存的 LLM 设置。

## TTS 配置

默认使用系统语音。切到 `TTS API` 后，会调用 OpenAI-compatible `/audio/speech`，并把控制台里的 TTS Prompt 作为 `instructions` 发送。

可用环境变量：

```text
PET_BRIDGE_TTS_BASE_URL=https://api.openai.com/v1
PET_BRIDGE_TTS_MODEL=gpt-4o-mini-tts
PET_BRIDGE_TTS_VOICE=alloy
PET_BRIDGE_TTS_API_KEY=
PET_BRIDGE_TTS_PROMPT=Speak in a clear, warm, close companion tone.
```

## 互动方式

- 左键单击：招呼
- 左键拖动：移动宠物，并根据方向切换左右移动动作
- 左键双击：打开宠物对话框，与模型对话
- 右键：打开桌宠轮盘
- 控制台动作按钮：手动切换当前动作
- 控制台按键映射：给每个动作绑定快捷键
- 固定动作：保持当前动作，不自动回待机

## 导入 `/hatch pet` 宠物

可以在控制台点“导入宠物”，选择包含以下文件的目录：

```text
pet.json
spritesheet.webp
```

如果 `pet.json` 里包含 `protocol/states`，控制台会读取其中的全部动作。没有 `protocol` 时，会按 Codex hatch-pet 默认协议读取。

Codex hatch-pet 默认协议：

- 精灵表：`1536 x 1872`
- 单帧：`192 x 208`
- 网格：`8 列 x 9 行`
- 行状态：`idle`、`running-right`、`running-left`、`waving`、`jumping`、`failed`、`waiting`、`running`、`review`

## 导入其他桌宠

其他精灵表桌宠可以额外放一个 `pet.adapter.json`。格式见 [PET_ADAPTER_SPEC.md](./PET_ADAPTER_SPEC.md)。

`pet.adapter.json` 的 `states` 会被控制台动态读取，因此可以配置更多动作。

## GitHub 发布建议

建议提交这些文件：

- `assets/`
- `*.js`
- `*.html`
- `*.css`
- `*.md`
- `package.json`
- `package-lock.json`
- `config.example.env`
- `*.bat`

不要提交：

- `node_modules/`
- `output/`
- `*.log`
- `.env`
- 临时 release 压缩包

发布后用户只需要克隆仓库并执行：

```powershell
npm install
npm start
```
