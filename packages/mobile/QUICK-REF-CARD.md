# ReadPal Mobile - ADB Testing Quick Reference Card

## 🚀 Quick Start Commands

```bash
# Complete setup (run this first)
cd packages/mobile
./scripts/setup-adb-test.sh          # Linux/Mac
# or
./scripts/setup-adb-test.ps1         # Windows (PowerShell)

# Start Metro bundler
npx expo start

# Monitor device logs (separate terminal)
adb logcat | grep -E "(ReactNative|Expo|ReadPal)"
```

---

## 📱 Device Management

### Connection
```bash
# Check connected devices
adb devices

# Restart ADB server
adb kill-server && adb start-server

# Connect device wirelessly (after USB connection)
adb tcpip 5555
adb connect <device-ip>:5555
```

### Installation
```bash
# Install APK
adb install -r read-pal-android-*.apk

# Uninstall app
adb uninstall com.readpal.app

# Clear app data (keeps app installed)
adb shell pm clear com.readpal.app
```

---

## 🔌 Port Forwarding

```bash
# Set up Metro forwarding
adb reverse tcp:8081 tcp:8081

# Remove forwarding
adb reverse --remove tcp:8081

# List all forwarding rules
adb reverse --list

# Clear all forwarding
adb reverse --remove-all
```

---

## 📊 Logging & Debugging

### Logcat Commands
```bash
# Real-time logs for ReadPal
adb logcat | grep -E "(ReactNative|Expo|ReadPal)"

# Error logs only
adb logcat *:E | grep -i react

# Clear log buffer
adb logcat -c

# Save logs to file
adb logcat > debug-logs.txt

# Show logs for specific tag
adb logcat -s ReactNative:V
```

### Chrome DevTools
```bash
# Enable remote debugging (shake device → Dev Menu → Debug)
# Then open Chrome:
chrome://inspect

# Debug WebView (EPUB reader)
chrome://inspect/devices
```

### React DevTools
```bash
# Install and run React DevTools
npm install -g react-devtools
react-devtools
```

---

## 🔍 Performance Monitoring

```bash
# Show CPU usage
adb shell top -n 1 | grep readpal

# Show memory usage
adb shell dumpsys meminfo com.readpal.app

# Show disk usage
adb shell df

# Check app size
adb shell pm path com.readpal.app

# Profile GPU rendering
adb shell setprop debug.layout true
adb shell setprop debug.profile_rendering true
```

---

## 📸 Screenshots & Screen Recording

```bash
# Take screenshot
adb shell screencap -p /sdcard/screen.png
adb pull /sdcard/screen.png

# Screen recording (max 3 minutes)
adb shell screenrecord /sdcard/demo.mp4
adb pull /sdcard/demo.mp4

# Screen recording with specific duration (60 seconds)
adb shell screenrecord --time-limit 60 /sdcard/demo.mp4
```

---

## 🌐 Network Testing

```bash
# Test API connectivity
curl http://175.178.66.207:8090/health

# Test from device
adb shell ping -c 4 175.178.66.207

# Check network configuration
adb shell ifconfig

# Test DNS resolution
adb shell nslookup 175.178.66.207

# Proxy local port to device (for local backend)
adb reverse tcp:8090 tcp:8090
```

---

## 🛠️ Development Commands

### Metro Bundler
```bash
# Start Metro (default)
npx expo start

# Start Metro with cache cleared
npx expo start --clear

# Start Metro for specific platform
npx expo start --android
npx expo start --ios

# Start in web mode
npx expo start --web

# Start tunnel mode (for remote devices)
npx expo start --tunnel
```

### Build Commands
```bash
# Build development APK (local)
eas build --platform android --profile development --local --output ./app.apk

# Build development APK (EAS cloud)
eas build --platform android --profile development

# Build preview APK
eas build --platform android --profile preview

# Prebuild native code
npx expo prebuild -p android

# Run on connected device
npx expo run:android
```

---

## 🧹 Common Cleanup Tasks

```bash
# Clear Metro cache
npx expo start --clear

# Clear watchman cache
watchman watch-del-all

# Clear node_modules and reinstall
rm -rf node_modules
pnpm install

# Reset ADB
adb kill-server && adb start-server

# Clear all app data and restart
adb shell pm clear com.readpal.app && adb shell am start -n com.readpal.app/.MainActivity
```

---

## ⚡ Quick Troubleshooting

| Problem | Quick Fix |
|---------|-----------|
| App won't connect to Metro | `adb reverse tcp:8081 tcp:8081` |
| Metro shows cached bundle | `npx expo start --clear` |
| App crashes on startup | `adb logcat *:E` and check logs |
| Can't see device | `adb kill-server && adb start-server` |
| APK installation fails | `adb uninstall com.readpal.app` then retry |
| Changes not reflecting | Shake device → Reload |
| API requests failing | Test: `curl http://175.178.66.207:8090/health` |
| Out of memory errors | `adb shell pm clear com.readpal.app` |

---

## 📋 Testing Checklist

```bash
# Quick verification commands
echo "=== ReadPal Mobile Quick Test ==="

# 1. Check device connection
echo "1. Device Status:"
adb devices

# 2. Check app installation
echo "2. App Status:"
adb shell pm list packages | grep readpal

# 3. Check port forwarding
echo "3. Port Forwarding:"
adb reverse --list

# 4. Check API connectivity
echo "4. API Connectivity:"
curl -s -o /dev/null -w "%{http_code}" http://175.178.66.207:8090/health

# 5. Recent logs
echo "5. Recent Logs:"
adb logcat -d -t 50 | grep -E "(ReactNative|Expo|ReadPal)" | tail -20
```

---

## 🔑 Key File Locations

```
packages/mobile/
├── app.json                    # Expo configuration
├── eas.json                    # EAS build profiles
├── package.json                # Dependencies
├── tsconfig.json               # TypeScript config
├── metro.config.js             # Metro bundler config
├── tailwind.config.ts          # Tailwind CSS config
├── src/
│   └── lib/
│       └── env.ts              # API URL configuration
├── scripts/
│   ├── setup-adb-test.sh       # Linux/Mac setup script
│   └── setup-adb-test.ps1      # Windows setup script
├── REAL-DEVICE-TEST-PLAN.md    # Detailed test plan
└── TEST-RESULTS-TEMPLATE.md    # Results template
```

---

## 📞 Emergency Commands

```bash
# If everything goes wrong, run this complete reset:
adb kill-server
adb start-server
adb uninstall com.readpal.app
adb reverse --remove-all
watchman watch-del-all
rm -rf node_modules
pnpm install
```

---

## 🎯 Device Shake Actions (Dev Menu)

Shake your device while the app is running to access:
- **Reload** - Reload the JavaScript bundle
- **Debug** - Open Chrome DevTools
- **Toggle Element Inspector** - Inspect UI elements
- **Show Performance Monitor** - View FPS and RAM
- **Fast Refresh** - Enable/disable fast refresh

---

**Tip**: Add these aliases to your `.bashrc` or `.zshrc` for quick access:

```bash
alias rp-start='cd ~/read-pal/packages/mobile && npx expo start'
alias rp-logs='adb logcat | grep -E "(ReactNative|Expo|ReadPal)"'
alias rp-reverse='adb reverse tcp:8081 tcp:8081'
alias rp-clear='npx expo start --clear'
```

---

**Last Updated**: 2026-05-10
**Version**: 1.0.0
