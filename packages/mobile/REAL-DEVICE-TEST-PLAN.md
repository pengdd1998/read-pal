# ReadPal Mobile - Real Device Testing Plan

## 📋 Overview

This document provides a comprehensive plan for testing ReadPal Mobile on real Android devices using ADB debugging. It includes step-by-step procedures, checklists, and troubleshooting guides.

**Architecture Flow:**
```
VPS (175.178.66.207:8090) ←─ API Requests ← Android Phone
                                                   │
                                                   │ ADB Reverse
                                                   ↓
                                          Local PC (Metro :8081)
```

## 🎯 Testing Objectives

- [ ] Verify all core features work on real Android devices
- [ ] Test EPUB reading performance and rendering
- [ ] Validate API connectivity with VPS backend
- [ ] Check offline functionality and caching
- [ ] Test authentication flows
- [ ] Verify UI responsiveness and native modules

## 📱 Test Device Requirements

### Minimum Specifications
- **Android Version**: 8.0+ (API 26+)
- **RAM**: 3GB+ recommended
- **Storage**: 500MB+ free space
- **Screen**: 720p+ resolution

### Supported Devices (Priority)
1. **Primary**: Modern mid-range devices (Samsung A-series, Xiaomi Redmi)
2. **Secondary**: Flagship devices (Samsung S-series, Google Pixel)
3. **Edge Cases**: Low-end devices with 2GB RAM

## 🔧 Pre-Test Checklist

### Environment Setup
- [ ] Node.js 20+ installed locally
- [ ] pnpm 8+ installed (`npm i -g pnpm`)
- [ ] ADB 34.0.0+ installed
- [ ] EAS CLI installed (`npm i -g eas-cli`)
- [ ] Expo account logged in (`eas login`)
- [ ] Git access to repository
- [ ] VPS backend running on :8090

### Device Preparation
- [ ] Developer mode enabled
- [ ] USB debugging enabled
- [ ] USB installation allowed
- [ ] Device unlocked and USB authorized
- [ ] Device connected via USB (not wireless)
- [ ] At least 50% battery charge

### Network Testing
- [ ] Device can access VPS IP: `curl http://175.178.66.207:8090/health`
- [ ] Local machine can reach device: `adb devices`
- [ ] No firewall blocking port 8090

## 📦 Step-by-Step Testing Procedure

### Phase 1: Build Acquisition (30 min)

#### Option A: GitHub Actions (Recommended)
```bash
# Trigger the build workflow
gh workflow run mobile.yml

# Monitor build progress
gh run list --workflow=mobile.yml

# Wait for completion, then download artifact
gh run download <run-id} -n read-pal-android-apk
```

#### Option B: EAS Cloud Build
```bash
cd packages/mobile
npx eas build --platform android --profile development

# Download from provided URL
# Example: https://expo.dev/accounts/[user]/projects/read-pal/builds/xxxx
```

**Expected Outcome**: APK file named `read-pal-android-1.0.0-development.apk`

### Phase 2: Device Installation (15 min)

```bash
# Verify device connection
adb devices
# Expected: List of devices attached
#           XXXXXXX device

# Install APK (replace existing if present)
adb install -r ./read-pal-android-*.apk

# Verify installation
adb shell pm list packages | grep readpal
# Expected: package:com.readpal.app
```

**Success Criteria**:
- APK installs without errors
- App icon appears on home screen
- No signature mismatch warnings

### Phase 3: Metro Server Setup (10 min)

```bash
# On local machine (not VPS)
cd read-pal/packages/mobile

# Install dependencies (if not done)
pnpm install

# Start Metro bundler
npx expo start
```

**Expected Output**:
```
› Metro waiting on exp://192.168.x.x:8081
› Scan the QR code above with Expo Go (Android) or the Camera app (iOS)
› Press Enter to open in browser
```

### Phase 4: ADB Port Forwarding (5 min)

```bash
# In a new terminal
# Set up reverse port forwarding
adb reverse tcp:8081 tcp:8081

# Verify forwarding
adb reverse --list
# Expected: tcp:8081 tcp:8081

# Test connectivity
adb shell ping -c 1 192.168.x.x:8081
```

**Success Criteria**:
- `adb reverse --list` shows the forwarding rule
- No "address already in use" errors

### Phase 5: Application Connection (10 min)

1. **Launch App**: Tap the ReadPal icon on the device
2. **Initial Screen**: Should show development server connection
3. **Connect Manually**: Enter `http://localhost:8081` if prompted
4. **Alternative**: Scan QR code from Metro terminal

**Expected Behavior**:
- App connects successfully to Metro
- Bundle loads without errors
- No "Unable to load script" messages
- Home screen appears

### Phase 6: Feature Testing (2 hours)

#### Authentication Flow
- [ ] **Login Screen**
  - [ ] Enter username/password
  - [ ] Submit button works
  - [ ] Invalid credentials show error
  - [ ] Successful login navigates to library

- [ ] **Registration Screen**
  - [ ] All fields validate properly
  - [ ] Password strength indicators work
  - [ ] Registration completes successfully

#### Library Management
- [ ] **Book List**
  - [ ] Books load from API
  - [ ] Loading spinners show correctly
  - [ ] Empty state displays when no books

- [ ] **Book Upload**
  - [ ] File picker opens
  - [ ] EPUB files can be selected
  - [ ] Upload progress shows
  - [ ] Upload completes and book appears

#### Reading Experience
- [ ] **Reader Screen**
  - [ ] EPUB content renders correctly
  - [ ] Chapter navigation works
  - [ ] Text selection functions
  - [ ] Settings panel opens
  - [ ] Font size changes apply
  - [ ] Theme switching works (light/dark)

- [ ] **EPUB Rendering**
  - [ ] Images display correctly
  - [ ] Text flows properly
  - [ ] Tables render correctly
  - [ ] CSS styles apply

#### Chat Interface
- [ ] **Chat Panel**
  - [ ] Chat interface opens
  - [ ] Messages display correctly
  - [ ] Input field accepts text
  - [ ] Send button works
  - [ ] AI responses appear

#### Settings
- [ ] **Settings Screen**
  - [ ] All settings are accessible
  - [ ] Changes persist
  - [ ] Logout works correctly

### Phase 7: Performance Testing (30 min)

#### Startup Performance
- [ ] **Cold Start** (app closed completely)
  - [ ] Time to splash screen: < 2s
  - [ ] Time to home screen: < 5s
  - [ ] No visible jank during startup

- [ ] **Warm Start** (app in background)
  - [ ] Time to restore: < 1s
  - [ ] State preserved correctly

#### Runtime Performance
- [ ] **Navigation**
  - [ ] Tab switches are smooth (< 100ms)
  - [ ] Screen transitions animate at 60fps
  - [ ] No dropped frames

- [ ] **Large EPUB Handling**
  - [ ] 50MB EPUB loads in < 10s
  - [ ] Scrolling remains smooth
  - [ ] Memory usage stays reasonable

### Phase 8: Offline Testing (20 min)

```bash
# Enable airplane mode on device
# Test offline functionality:
```

- [ ] **Cached Books**
  - [ ] Previously opened books remain accessible
  - [ ] Page navigation works offline
  - [ ] Reading position is saved

- [ ] **API Requests**
  - [ ] Proper error messages when offline
  - [ ] No app crashes
  - [ ] Queue/sync mechanism works

- [ ] **Reconnection**
  - [ ] Disable airplane mode
  - [ ] App reconnects automatically
  - [ ] Pending requests sync

### Phase 9: Debug Tools Validation (15 min)

#### React DevTools
```bash
npm install -g react-devtools
react-devtools
```

- [ ] DevTools connects to app
- [ ] Component tree displays
- [ ] Props and state inspectable
- [ ] Performance profiling works

#### Logcat Monitoring
```bash
# Real-time logs
adb logcat | grep -E "(ReactNative|Expo|ReadPal)"

# Error logs
adb logcat *:E | grep -i react
```

- [ ] No error logs during normal usage
- [ ] Warnings are investigated
- [ ] Performance logs are reasonable

## 🐛 Troubleshooting Guide

### Connection Issues

**Problem**: Metro connection times out
```
Solutions:
1. Check ADB forwarding: adb reverse --list
2. Restart ADB server: adb kill-server && adb start-server
3. Clear Metro cache: npx expo start --clear
4. Verify device IP is accessible
5. Check firewall settings
```

**Problem**: API requests fail
```
Solutions:
1. Test VPS connectivity: curl http://175.178.66.207:8090/health
2. Check device has internet access
3. Verify API_URL in env.ts
4. Check VPS logs for errors
5. Temporarily disable VPN
```

### Build Issues

**Problem**: APK installation fails
```
Solutions:
1. Uninstall existing app: adb uninstall com.readpal.app
2. Enable USB installation on device
3. Check available storage on device
4. Verify ADB driver is correct
5. Try different USB cable/port
```

**Problem**: Development build crashes
```
Solutions:
1. Check logcat for crash details
2. Verify all native modules are linked
3. Rebuild with prebuild: npx expo prebuild --clean
4. Update EAS CLI to latest version
5. Check for incompatible dependencies
```

### Performance Issues

**Problem**: App is slow/janky
```
Solutions:
1. Enable Hermes engine (verify in app.json)
2. Check for memory leaks in DevTools
3. Optimize large list rendering
4. Reduce animation complexity
5. Profile with React DevTools
```

## 📊 Test Results Template

### Device Information
```
Device Model: ___________
Android Version: ___________
API Level: ___________
RAM: ___________
Storage: ___________
Test Date: ___________
Tester Name: ___________
```

### Test Results Summary
| Feature | Status | Notes |
|---------|--------|-------|
| Authentication | ✅/❌ | |
| Library | ✅/❌ | |
| Book Upload | ✅/❌ | |
| EPUB Reading | ✅/❌ | |
| Chat Interface | ✅/❌ | |
| Settings | ✅/❌ | |
| Offline Mode | ✅/❌ | |
| Performance | ✅/❌ | |

### Issues Found
1. **Severity**: High/Medium/Low
   - Description:
   - Steps to Reproduce:
   - Expected Behavior:
   - Actual Behavior:
   - Screenshots/Logs:

## 📝 Post-Test Actions

### Documentation
- [ ] Record all test results
- [ ] Document bugs found
- [ ] Add screenshots/videos
- [ ] Update user guide if needed

### Bug Tracking
- [ ] Create GitHub issues for bugs
- [ ] Prioritize by severity
- [ ] Assign to developers
- [ ] Set milestones

### Next Steps
- [ ] Fix critical bugs immediately
- [ ] Plan improvements based on feedback
- [ ] Schedule next testing round
- [ ] Prepare for production build

## 🚀 Quick Start Command Reference

```bash
# Full testing session setup
git pull origin main
cd packages/mobile
pnpm install
adb devices
adb install -r read-pal-android-*.apk
adb reverse tcp:8081 tcp:8081
npx expo start --clear

# In another terminal - monitor logs
adb logcat | grep -E "(ReactNative|Expo|ReadPal)" > test-log.txt

# When done - cleanup
adb reverse --remove tcp:8081
```

## 📞 Support Resources

- **Documentation**: `packages/mobile/ADB-DEBUG-GUIDE.md`
- **GitHub Issues**: https://github.com/read-pal-app/read-pal/issues
- **Expo Forums**: https://forums.expo.dev/
- **React Native Docs**: https://reactnative.dev/

---

**Last Updated**: 2026-05-10
**Version**: 1.0.0
**Maintained By**: ReadPal Development Team
