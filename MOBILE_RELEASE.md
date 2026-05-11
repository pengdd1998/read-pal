# Mobile Release Process

本文档说明 read-pal 移动端应用的发布流程。

## 版本号规范

遵循语义化版本规范 (Semantic Versioning): **Vx.y.z**

- **V** - 大写前缀（统一格式）
- **x (MAJOR)** - 不兼容的 API 变更
- **y (MINOR)** - 向后兼容的新功能
- **z (PATCH)** - 向后兼容的 bug 修复

### 示例
- `V1.0.0` - 初始稳定版本
- `V1.1.0` - 添加新功能
- `V1.1.1` - Bug 修复
- `V2.0.0` - 重大更新/不兼容变更

当前版本: `V1.0.0` (查看 `packages/mobile/package.json`)

## 发布流程

### 方法一：通过 GitHub Actions 手动发布（推荐）

1. **更新版本号**
   ```bash
   cd packages/mobile
   npm version patch  # V1.0.0 -> V1.0.1
   # 或
   npm version minor  # V1.0.0 -> V1.1.0
   # 或
   npm version major  # V1.0.0 -> V2.0.0
   ```

2. **提交更改**
   ```bash
   git add packages/mobile/package.json
   git commit -m "chore(mobile): bump version to V1.0.1"
   git push
   ```

3. **触发 GitHub Actions**
   - 访问 https://github.com/pengdd1998/read-pal/actions/workflows/mobile.yml
   - 点击 "Run workflow"
   - 输入版本号（如 `1.0.1`，不带 V 前缀）
   - 勾选 "Create GitHub Release"
   - 点击 "Run workflow"

4. **等待构建完成**
   - Actions 会自动构建 APK
   - 创建 GitHub Release（标记为 Latest）
   - 推送新的 git tag (V1.0.1)

### 方法二：通过 Git Tag 发布

1. **更新版本号**
   ```bash
   cd packages/mobile
   npm version patch
   ```

2. **创建并推送 tag**
   ```bash
   git add packages/mobile/package.json
   git commit -m "chore(mobile): bump version to V1.0.1"
   git tag -a V1.0.1 -m "Release V1.0.1"
   git push origin main --tags
   ```

3. **GitHub Actions 自动触发**
   - 检测到 `V*` 标签
   - 自动构建并创建 Release

## 发布检查清单

### 发布前

- [ ] 运行测试：`pnpm --filter @read-pal/mobile test`
- [ ] 类型检查：`pnpm --filter @read-pal/mobile typecheck`
- [ ] 更新版本号：`npm version patch/minor/major`
- [ ] 检查 CHANGELOG.md 是否需要更新
- [ ] 在真机上测试关键功能
- [ ] 确认 `packages/mobile/package.json` 版本号正确

### 发布后

- [ ] 验证 GitHub Release 创建成功
- [ ] 确认 Release 标记为 "Latest" 而非 "Pre-release"
- [ ] 下载 APK 并测试
- [ ] 通知团队成员新版本可用

## 常见问题

### Q: 为什么版本号要大写 V 开头？

A: 统一命名规范，便于区分：
- `V*` - 移动端版本（Exo 构建）
- `v*` (已弃用) - 旧版本或其他用途

### Q: 如何回滚一个发布？

A: 删除对应的 GitHub Release 和 tag：
```bash
gh release delete V1.0.1 -y
git tag -d V1.0.1
git push origin :refs/tags/V1.0.1
```

### Q: Pre-release vs Stable Release？

A:
- 当前工作流默认创建 **Stable Release** (prerelease: false)
- 如需创建 Pre-release，修改 workflow 中的 `prerelease: true`

### Q: 如何查看所有版本？

A: 访问 https://github.com/pengdd1998/read-pal/releases

## 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| V1.0.0 | 待发布 | 初始稳定版本（清理后重新发布） |
