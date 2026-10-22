# 升级 · 四人扑克

本地单机网页版“升级”：玩家使用蓝方座位，与三名可独立设置难度的 AI 连续对局。

## 快速开始

```powershell
cd E:\code\codex\update
npm install
npm run dev
```

打开 [http://127.0.0.1:5173/](http://127.0.0.1:5173/)。

```powershell
npm test
npm run build
npm run preview
```

## 已实现

- 54 张固定牌组、每人 12 张、6 张底牌
- 暗令花色、公开叫主者、5 秒叫主决策
- 抢报、普通无人叫主、起义与抛硬币动画
- 主家协商、六张弃牌和 25 分限制
- 单张、跟花色、载牌、垫牌与同花色甩牌
- 当前出牌者和实时牌权高亮
- 每墩 5 秒展示，托管时自动跳过等待
- 末墩只亮牌，末墩分牌不计入旁家得分
- 0 分特殊结算、40 分抢报、45/65 分升级边界
- 详细结算、末墩牌面、逐墩吃分和结算原因
- 出牌建议、打底建议、AI 托管
- 三个 AI 独立选择简单、一般、高级
- 高级 AI 隐藏手牌抽样与 32 次小规模蒙特卡洛模拟
- 玩家名称、AI 难度保存在浏览器本地
- 三阶段循环背景音乐，支持音量和静音，文件末秒已裁切
- 发牌与出牌短音效，共用当前声音音量和静音状态

## 目录

```text
update/
  src/
    app/App.tsx                页面状态与布局
    components/cards/          牌面组件
    components/game/           座位、叫主牌和吃分区
    components/dialogs/        规则、亮牌和结算弹窗
    game/                      规则引擎与 AI
    styles/global.css          页面样式
    main.tsx                   应用入口
  tests/game/                  Vitest 规则与完整对局测试
  public/card-art/             游戏实际加载的牌面素材
  public/audio/                裁剪后的背景音乐
  assets/card-art/source/      原始 AI 生成图片
  assets/audio/source/         原始 WAV 音频
  docs/                        规则、模拟报告、提示词
  tools/                       Python 模拟器与音频处理脚本
```

详细职责和调用关系见 [工程结构](./docs/工程结构.md)。

`assets/audio/source` 和 `assets/card-art/source` 是本地原始素材，不纳入 Git；游戏运行所需素材已提交到 `public`。

## 文档

- [升级规则](./docs/升级规则.md)
- [原始规则](./docs/规则原始版.md)
- [规则模拟报告](./docs/规则模拟报告.md)
- [牌面生成提示词](./docs/牌面生成提示词.md)

## 说明

第一版为单机原型，暂未包含联网、账号、战绩持久化和音效。
