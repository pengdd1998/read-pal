# ReadPal Mobile — ADB 真机调试计划书

## 1. 概述

本文档描述如何通过 ADB (Android Debug Bridge) 连接 Android 真机，对 ReadPal Mobile 应用进行开发调试。

**架构：**
```
VPS (175.178.66.207)                    本地电脑                    Android 手机
┌─────────────────┐                  ┌──────────────┐    USB/ADB   ┌──────────┐
│ FastAPI :8090    │◄─── HTTP API ───│ Metro :8081   │◄────────────►│ Dev Build│
│ (后端，已运行)    │  (手机直连VPS)   │ (JS 编译+热更新)│  adb reverse │          │
└─────────────────┘                  └──────────────┘              └──────────┘
```

**职责分离：**
- **VPS**：只跑 FastAPI 后端（已在 Docker 中运行，不动）
- **本地电脑**：跑 Metro bundler（编译 JS + 热更新）+ 连接手机
- **手机**：Metro 热更新走 `adb reverse`，API 请求直连 VPS 公网 IP

**不需要 SSH 隧道。** 手机和 Web 端调用同一个后端 `http://175.178.66.207:8090`。

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

### 3.3 VPS (已有，无需改动)

- FastAPI 后端已通过 Docker 运行在 `:8090`
- 无需在 VPS 上运行 Metro 或任何新增服务

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
# 方式 A: GitHub Actions 构建（推荐，自动构建 + artifacts 下载）
# 1. 触发构建
gh workflow run mobile.yml

# 2. 等待构建完成，访问 actions 页面下载 APK
# https://github.com/read-pal-app/read-pal/actions

# 3. 从 artifacts 下载 read-pal-android-*.apk
```

```bash
# 方式 B: EAS 云端构建（需要 Expo 账号）
npx eas build --platform android --profile development

# 构建完成后会输出下载链接，如：
# https://expo.dev/accounts/[user]/projects/read-pal/builds/xxxx
```

```bash
# 方式 C: 本地构建（需要 Android Studio + JDK 17）
npx expo prebuild -p android
npx expo run:android
```

### Step 4: 安装 APK 到手机

```bash
# 从 EAS 下载 APK 后
adb install -r ./read-pal-development-build.apk
```

验证：
```bash
adb devices
# 应显示：
# List of devices attached
# XXXXXX  device
```

## 5. 调试流程

### Step 5: 本地启动 Metro

```bash
# 在本地电脑（不是 VPS）
cd read-pal/packages/mobile

# 启动 Metro bundler
npx expo start
```

终端会显示 QR 码和连接信息。

### Step 6: ADB 端口转发

```bash
# 另开一个终端，手机已通过 USB 连接

# 将手机 localhost:8081 转发到本地电脑 :8081（Metro）
adb reverse tcp:8081 tcp:8081

# 验证转发规则
adb reverse --list
```

### Step 7: 手机连接开发服务器

1. 打开手机上的 **ReadPal** Dev Build 应用
2. 应用启动后显示开发服务器连接界面
3. 输入：`http://localhost:8081`
4. 或扫描终端中 Expo 显示的二维码

### Step 8: 开始开发调试

修改本地 `packages/mobile/` 下的代码 → Metro 自动热更新到手机。

## 6. API 连接说明

手机应用通过 `src/lib/env.ts` 中的 `API_URL` 连接后端：

```typescript
// 当前配置（手机直连 VPS 公网 IP）
export const API_URL = 'http://175.178.66.207:8090';
```

**手机和 Web 端共用同一个后端。** 只要手机能访问 VPS 的公网 IP，API 请求直接可达，无需额外配置。

如果 VPS 不在公网（内网开发环境），改为：
```bash
# 电脑上建 SSH 隧道转发后端端口
ssh -L 8090:localhost:8090 ubuntu@<vps-ip>

# 手机上也需要转发
adb reverse tcp:8090 tcp:8090

# 然后 env.ts 改为：
API_URL = 'http://localhost:8090'
```

## 7. 调试工具

### 7.1 React DevTools

```bash
npm install -g react-devtools
react-devtools
# 手机摇一摇 → Dev Menu → 远程调试
```

### 7.2 Chrome 远程调试（WebView / EPUB）

```
手机：Dev Menu → 远程调试 JS
电脑：Chrome 打开 chrome://inspect
→ 可以调试 WebView 中的 EPUB 渲染
```

### 7.3 ADB Logcat

```bash
# 实时查看日志
adb logcat | grep -E "(ReactNative|Expo|ReadPal)"

# 只看错误
adb logcat *:E | grep -i react

# 清空日志重新开始
adb logcat -c && adb logcat
```

## 8. 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| `adb: command not found` | 未安装 ADB | 安装 Android SDK Platform-Tools |
| `adb devices` 显示 `unauthorized` | 手机未授权 | 手机上点击"允许 USB 调试" |
| APK 安装失败 `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | 签名不一致 | `adb uninstall com.readpal.app` 后重装 |
| Metro 连接超时 | adb reverse 未生效 | 检查 `adb reverse --list`，确认手机 USB 已连接 |
| 热更新不生效 | 缓存问题 | `npx expo start --clear` |
| 原生模块报错 | 用了 Expo Go | 确认安装的是 development build APK |
| EPUB 渲染空白 | WebView 桥接问题 | Chrome `chrome://inspect` 调试 WebView |
| API 请求失败 | 后端不可达 | 确认手机能访问 `http://175.178.66.207:8090` |
| MMKV 崩溃 | 原生模块未链接 | 使用 `npx expo prebuild --clean` 重新构建 |

## 9. 快速启动清单

```
□ 获取 APK: gh workflow run mobile.yml → 从 actions 页面下载 artifacts
□ 本地电脑: git clone + pnpm install
□ 本地电脑: adb devices (确认手机 USB 连接)
□ 本地电脑: adb install -r read-pal-android-*.apk
□ 本地电脑: adb reverse tcp:8081 tcp:8081 (Metro 端口转发)
□ 本地电脑: cd packages/mobile && npx expo start (启动 Metro)
□ 手机: 打开 ReadPal → 连接 localhost:8081
□ 手机: 摇一摇 → Dev Menu → 确认连接状态
□ VPS: 无需任何操作（后端已在运行）
```

## 10. 后续迭代

完成核心功能调试后：

1. **Phase 6**: 闪屏页、应用图标、启动优化
2. **Phase 7**: 推送通知 (expo-notifications)
3. **Phase 8**: 离线模式完善、后台同步
4. **Phase 9**: 性能优化 (Hermes、Bundle 分析)
5. **Phase 10**: EAS Submit 上架 Google Play
