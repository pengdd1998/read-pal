# ReadPal Mobile — ADB 真机调试计划书

## 1. 概述

本文档描述如何通过 ADB (Android Debug Bridge) 连接 Android 真机，对 ReadPal Mobile 应用进行开发调试。

**架构：**
```
VPS (175.178.66.207)              本地电脑                    Android 手机
┌─────────────────┐    SSH     ┌──────────────┐    USB/ADB   ┌──────────┐
│ Expo Dev Server  │◄─tunnel──►│ Local Machine │◄────────────►│ Phone    │
│ :8081            │           │               │  adb reverse │ Dev Build│
│ FastAPI :8090    │           │               │  tcp:8081    │          │
└─────────────────┘           └──────────────┘              └──────────┘
```

## 2. 为什么不能用 Expo Go

ReadPal 使用以下原生模块，超出 Expo Go 支持范围：

| 模块 | 用途 | Expo Go 支持 |
|------|------|:---:|
| `expo-secure-store` | JWT 加密存储 | ✅ |
| `expo-sqlite` | 离线书籍缓存 | ✅ |
| `react-native-mmkv` | 高性能 KV 存储 | ❌ |
| `react-native-webview` | EPUB 渲染 | ❌ |
| `react-native-reanimated` | 动画 | ❌ |
| `@gorhom/bottom-sheet` | 底部弹出面板 | ❌ |
| `@epubjs-react-native/core` | EPUB 解析 | ❌ |
| `nativewind` | Tailwind 样式 | ❌ |

**结论：必须构建 Development Build。**

## 3. 前置条件

### 3.1 本地电脑

| 工具 | 版本要求 | 安装方式 |
|------|---------|---------|
| Node.js | ≥ 20 | `nvm install 20` |
| pnpm | ≥ 8 | `npm i -g pnpm` |
| ADB | ≥ 34.0.0 | 安装 Android SDK Platform-Tools |
| EAS CLI | latest | `npm i -g eas-cli` |
| Expo 账号 | — | `eas login` |

### 3.2 Android 手机

- Android 8.0+ (API 26+)
- 开启 USB 调试：`设置 → 关于手机 → 软件信息 → 连续点击"版本号"7次 → 开发者选项 → USB 调试`
- 开启 USB 安装：`开发者选项 → USB 安装`

### 3.3 VPS (已有)

- Node.js 22 + pnpm 8
- Expo Dev Server

## 4. 构建步骤

### Step 1: 获取项目代码

```bash
# 在本地电脑
git clone <repo-url> read-pal
cd read-pal
pnpm install
```

### Step 2: 登录 Expo

```bash
cd packages/mobile
npx eas login
# 输入 Expo 账号密码
```

### Step 3: 构建 Development APK

```bash
# 方式 A: EAS 云端构建（推荐，无需 Android Studio）
npx eas build --platform android --profile development

# 构建完成后会输出下载链接，如：
# https://expo.dev/accounts/[user]/projects/read-pal/builds/xxxx
```

```bash
# 方式 B: 本地构建（需要 Android Studio + JDK 17）
npx expo prebuild -p android
npx expo run:android
```

### Step 4: 安装 APK 到手机

```bash
# 从 EAS 下载 APK 后
adb install -r ./read-pal-development-build.apk

# 或直接从 URL 下载后安装
# adb install -r /path/to/downloaded.apk
```

验证安装：
```bash
adb devices
# 应显示：
# List of devices attached
# XXXXXX  device
```

## 5. 调试流程

### Step 5: 启动 VPS 开发服务器

```bash
# SSH 到 VPS
ssh ubuntu@175.178.66.207

cd /home/ubuntu/projects/read-pal/packages/mobile

# 启动 Metro bundler
npx expo start --port 8081
```

### Step 6: 建立连接隧道

```bash
# 在本地电脑开第二个终端

# 方式 A: SSH 本地端口转发
ssh -L 8081:localhost:8081 ubuntu@175.178.66.207

# 方式 B: 如果在同一局域网
# 无需隧道，直接用 VPS IP
```

### Step 7: ADB 端口转发

```bash
# 在本地电脑（手机已通过 USB 连接）

# 将手机 8081 端口转发到本地 8081
adb reverse tcp:8081 tcp:8081

# 验证转发规则
adb reverse --list

# 测试连接（手机上访问 localhost:8081 会转发到 VPS）
```

### Step 8: 手机上连接开发服务器

1. 打开手机上的 **ReadPal** Dev Build 应用
2. 应用启动后会显示开发服务器连接界面
3. 输入：`http://localhost:8081`
4. 或扫描终端中 Expo 显示的二维码

### Step 9: 开始开发调试

修改 `packages/mobile/` 下的代码 → Metro 自动热更新到手机。

## 6. 调试工具

### 6.1 React DevTools

```bash
# 在本地电脑安装
npm install -g react-devtools

# 启动（手机摇一摇 → 打开 Dev Menu → 远程调试）
react-devtools
```

### 6.2 Chrome 远程调试（WebView / EPUB）

```bash
# 手机开启：Dev Menu → 远程调试 JS
# 本地电脑 Chrome 打开：chrome://inspect
# 可以调试 WebView 中的 EPUB 渲染
```

### 6.3 ADB Logcat

```bash
# 实时查看日志
adb logcat | grep -E "(ReactNative|Expo|ReadPal)"

# 只看错误
adb logcat *:E | grep -i react

# 清空日志重新开始
adb logcat -c && adb logcat
```

### 6.4 网络调试

```bash
# 查看手机端网络请求
adb logcat | grep "OkHttp"

# Metro bundler 日志在 VPS 终端实时显示
```

## 7. API 连接配置

手机应用需要连接 VPS 上的 FastAPI 后端：

```
# packages/mobile/src/lib/env.ts
# 当前配置：
API_URL = 'http://175.178.66.207:8090'

# 手机必须能访问此地址
# 如果在同一网络 → 直接可用
# 如果不在同一网络 → 需要额外端口转发：
adb reverse tcp:8090 tcp:8090
# 然后改为：
API_URL = 'http://localhost:8090'
```

## 8. 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| `adb: command not found` | 未安装 ADB | 安装 Android SDK Platform-Tools |
| `adb devices` 显示 `unauthorized` | 手机未授权 | 手机上点击"允许 USB 调试" |
| APK 安装失败 `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | 签名不一致 | `adb uninstall com.readpal.app` 后重装 |
| Metro 连接超时 | 端口转发未生效 | 检查 `adb reverse --list` 和 SSH 隧道 |
| 热更新不生效 | 缓存问题 | `npx expo start --clear` |
| 原生模块报错 | 未使用 Dev Build | 确认安装的是 development build，不是 Expo Go |
| EPUB 渲染空白 | WebView 桥接问题 | Chrome `chrome://inspect` 调试 WebView |
| API 请求失败 | 后端不可达 | 确认 API_URL 和网络连通性 |

## 9. 快速启动清单

```
□ 本地电脑: adb devices (确认手机连接)
□ 本地电脑: ssh -L 8081:localhost:8081 ubuntu@175.178.66.207 (隧道)
□ 本地电脑: adb reverse tcp:8081 tcp:8081 (端口转发)
□ VPS: cd packages/mobile && npx expo start (启动 Metro)
□ 手机: 打开 ReadPal → 输入 localhost:8081 → 连接
□ 手机: 摇一摇 → Dev Menu → 确认连接状态
```

## 10. 后续迭代

完成核心功能调试后，后续迭代方向：

1. **Phase 6**: 闪屏页、应用图标、启动优化
2. **Phase 7**: 推送通知 (expo-notifications)
3. **Phase 8**: 离线模式完善、后台同步
4. **Phase 9**: 性能优化 (Hermes、Bundle 分析)
5. **Phase 10**: EAS Submit 上架 Google Play
