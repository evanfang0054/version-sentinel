# Version Sentinel

[![npm version](https://img.shields.io/npm/v/version-sentinel.svg)](https://www.npmjs.com/package/version-sentinel)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

一个轻量级的版本检查工具，用于检测Web应用是否有新版本。支持多种版本比较策略(ETag、Last-Modified、自定义)，提供完整的事件系统和错误重试机制。

## 特性

- 🔄 **自动检测更新**：定期检查应用是否有新版本
- 🔧 **多种比较策略**：支持ETag、Last-Modified和自定义头部比较
- 📊 **完整事件系统**：提供丰富的事件通知机制
- 🛡️ **错误重试机制**：内置智能重试逻辑，提高检查可靠性
- 🔌 **灵活配置**：提供多种配置选项，满足不同需求
- 📦 **轻量级**：无外部依赖，体积小巧

## 安装

```bash
npm install version-sentinel
# 或
yarn add version-sentinel
# 或
pnpm add version-sentinel
```

## 快速开始

### 基本用法

```typescript
import { createVersionChecker } from 'version-sentinel';

// 创建版本检查器实例
const checker = createVersionChecker({
  checkInterval: 30000, // 每30秒检查一次
  versionUrl: '/api/version', // 版本检查的URL
  compareStrategy: 'etag' // 使用ETag进行版本比较
});

// 监听更新事件
checker.on('update', (event) => {
  console.log('发现新版本:', event.payload);
  // 在这里提示用户刷新页面或自动刷新
});

// 监听错误事件
checker.on('error', (event) => {
  console.error('版本检查失败:', event.payload);
});
```

### 手动控制检查

```typescript
// 创建不自动启动的检查器
const checker = createVersionChecker({
  autoStart: false,
  versionUrl: '/api/version'
});

// 手动启动检查
checker.start();

// 手动执行一次检查
checker.check().then(info => {
  if (info.updateAvailable) {
    console.log('有新版本可用');
  }
});

// 停止检查
checker.stop();
```

## API文档

### VersionCheckerOptions

创建版本检查器时的配置选项：

| 选项 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `checkInterval` | `number` | `60000` | 检查间隔时间(毫秒) |
| `versionUrl` | `string` | `/` | 版本检查的URL |
| `compareStrategy` | `'etag'\|'last-modified'\|'custom'` | `'etag'` | 版本比较策略 |
| `autoStart` | `boolean` | `true` | 是否自动开始检查 |
| `retryTimes` | `number` | `3` | 检查失败后的重试次数 |
| `retryInterval` | `number` | `3000` | 重试间隔时间(毫秒) |

### VersionChecker 类

#### 方法

| 方法 | 描述 |
|------|------|
| `constructor(options?: VersionCheckerOptions)` | 创建版本检查器实例 |
| `start(): void` | 开始版本检查 |
| `stop(): void` | 停止版本检查 |
| `check(): Promise<VersionInfo>` | 执行一次版本检查 |
| `on(event: VersionCheckerEventType, callback: Function): void` | 添加事件监听器 |
| `off(event: VersionCheckerEventType, callback: Function): void` | 移除事件监听器 |

#### 事件类型

| 事件类型 | 触发时机 |
|----------|----------|
| `'update'` | 发现新版本时触发 |
| `'check'` | 执行版本检查时触发 |
| `'error'` | 发生错误时触发 |
| `'retry'` | 开始重试时触发 |
| `'start'` | 开始版本检查时触发 |
| `'stop'` | 停止版本检查时触发 |

### VersionInfo 接口

版本检查返回的信息：

```typescript
interface VersionInfo {
  currentVersion: string | null; // 当前版本标记
  newVersion: string | null;     // 新版本标记
  updateAvailable: boolean;      // 是否有更新可用
  timestamp: number;             // 检查时间戳
}
```

### 工厂函数

```typescript
function createVersionChecker(options?: VersionCheckerOptions): VersionChecker
```

创建版本检查器实例的便捷方法。

## 高级用例

### 自定义版本比较策略

```typescript
// 使用自定义头部进行版本比较
const checker = createVersionChecker({
  compareStrategy: 'custom',
  versionUrl: '/api/version'
});

// 此时会优先使用 x-version 头，如果不存在则回退到 etag
```

### 错误重试机制

```typescript
// 配置重试机制
const checker = createVersionChecker({
  retryTimes: 5,        // 最多重试5次
  retryInterval: 2000,  // 每次重试间隔2秒
  versionUrl: '/api/version'
});

// 监听重试事件
checker.on('retry', (event) => {
  console.log(`正在进行第${event.payload.retryCount}次重试...`);
});
```

## 浏览器兼容性

该库使用了 `fetch` API，如需在不支持 `fetch` 的环境中使用，请确保提供相应的 polyfill。
