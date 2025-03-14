/**
 * 版本检查器类，用于定期检查应用程序的版本更新。
 * 
 * @remarks
 * 该类提供了一个自动化的版本检查机制,可以定期检查应用程序是否有新版本。
 * 支持多种版本比较策略(ETag、Last-Modified、自定义),并提供了完整的事件系统。
 * 
 * 主要功能:
 * - 自动/手动检查版本更新
 * - 支持多种版本比较策略
 * - 完整的事件系统
 * - 错误重试机制
 * - 可配置的检查间隔
 * 
 * @example
 * ```typescript
 * // 创建版本检查器实例
 * const checker = new VersionChecker({
 *   checkInterval: 30000,
 *   versionUrl: '/version'
 * });
 * 
 * // 监听更新事件
 * checker.on('update', (event) => {
 *   console.log('发现新版本:', event.payload);
 * });
 * 
 * // 手动触发检查
 * checker.check().then(info => {
 *   if (info.updateAvailable) {
 *     console.log('有新版本可用');
 *   }
 * });
 * ```
 * 
 * @see {@link VersionCheckerOptions} 配置选项接口
 * @see {@link VersionInfo} 版本信息接口
 * @see {@link VersionCheckerEvent} 事件对象接口
 * @see {@link VersionCheckerEventType} 事件类型
 */
import { VersionCheckerOptions, VersionInfo, VersionCheckerEvent, VersionCheckerEventType } from './types';

export class VersionChecker {
  /** 
   * 版本检查器配置选项
   * @private
   */
  private options: Required<VersionCheckerOptions>;

  /** 
   * 当前版本的标记
   * @private
   */
  private versionTag: string | null = null;

  /** 
   * 定时器，用于定期检查版本
   * @private
   */
  private timer: NodeJS.Timer | null = null;

  /** 
   * 当前重试次数
   * @private
   */
  private retryCount = 0;

  /** 
   * 事件监听器映射表
   * 使用 Map 存储不同事件类型的监听器集合
   * @private
   */
  private eventListeners: Map<VersionCheckerEventType, Set<Function>> = new Map();

  /** 
   * 默认配置选项
   * @private
   * @readonly
   */
  private readonly DEFAULT_OPTIONS: Required<VersionCheckerOptions> = {
    checkInterval: 60000,
    versionUrl: '/',
    compareStrategy: 'etag',
    autoStart: true,
    retryTimes: 3,
    retryInterval: 3000
  };

  /**
   * 构造函数，初始化版本检查器并开始定期检查。
   * 
   * @param options - 版本检查器配置选项，可选
   * 
   * @remarks
   * 构造函数会:
   * 1. 合并默认配置和用户配置
   * 2. 如果 autoStart 为 true，自动调用 start() 方法开始版本检查
   * 
   * @example
   * ```typescript
   * const checker = new VersionChecker({
   *   checkInterval: 30000,
   *   versionUrl: '/api/version',
   *   compareStrategy: 'etag',
   *   autoStart: true
   * });
   * ```
   */
  constructor(options?: VersionCheckerOptions) {
    this.options = { ...this.DEFAULT_OPTIONS, ...options };
    
    if (this.options.autoStart) {
      this.start();
    }
  }

  /**
   * 开始版本检查
   * 
   * @public
   * 
   * @remarks
   * 该方法会:
   * 1. 检查是否已有定时器在运行
   * 2. 触发 'start' 事件
   * 3. 立即执行一次版本检查
   * 4. 设置定时器定期执行检查
   * 
   * 如果检查器已经在运行，则该方法不会执行任何操作。
   * 
   * @example
   * ```typescript
   * const checker = new VersionChecker({ autoStart: false });
   * // 手动启动版本检查
   * checker.start();
   * ```
   */
  public start(): void {
    if (this.timer) {
      return;
    }
    
    this.emit('start');
    this.check();
    this.timer = setInterval(() => this.check(), this.options.checkInterval);
  }

  /**
   * 停止版本检查
   * 
   * @public
   * 
   * @remarks
   * 该方法会:
   * 1. 清除定时器
   * 2. 重置定时器引用
   * 3. 触发 'stop' 事件
   * 
   * 如果检查器未在运行，则该方法不会执行任何操作。
   * 
   * @example
   * ```typescript
   * checker.stop();
   * ```
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer as NodeJS.Timeout);
      this.timer = null;
      this.emit('stop');
    }
  }

  /**
   * 执行版本检查
   * @returns 返回版本检查结果
   * @throws 如果请求失败会抛出错误
   */
  public async check(): Promise<VersionInfo> {
    try {
      this.emit('check');
      const response = await fetch(this.options.versionUrl, {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      
      if (!response.ok) {
        const error = new Error(`HTTP error: ${response.status} ${response.statusText}`);
        // 不在这里触发error事件，而是让它进入catch块统一处理
        throw error;
      }

      // 获取版本标记
      let newVersionTag: string | null = null;
      switch (this.options.compareStrategy) {
        case 'etag':
          newVersionTag = response.headers.get('etag');
          break;
        case 'last-modified':
          newVersionTag = response.headers.get('last-modified');
          break;
        case 'custom':
          newVersionTag = response.headers.get('x-version') || response.headers.get('etag');
          break;
        default:
          newVersionTag = response.headers.get('etag') || response.headers.get('last-modified');
      }

      // 比较版本
      const versionInfo = this.compareVersion(newVersionTag);
      
      if (versionInfo.updateAvailable) {
        this.emit('update', versionInfo);
      }
      
      return versionInfo;
    } catch (error) {
      this.emit('error', error);
      
      if (this.retryCount < this.options.retryTimes) {
        this.retryCount++;
        this.emit('retry', { error, retryCount: this.retryCount });
        
        await new Promise(resolve => setTimeout(resolve, this.options.retryInterval));
        return this.check();
      }
      
      this.retryCount = 0;
      throw error;
    }
  }

  /**
   * 添加事件监听器
   * 
   * @public
   * @param event - 事件类型
   * @param callback - 事件回调函数
   * 
   * @remarks
   * 支持的事件类型包括:
   * - 'update': 发现新版本时触发
   * - 'check': 执行版本检查时触发
   * - 'error': 发生错误时触发
   * - 'retry': 开始重试时触发
   * - 'start': 开始版本检查时触发
   * - 'stop': 停止版本检查时触发
   * 
   * @example
   * ```typescript
   * checker.on('update', (event) => {
   *   console.log('发现新版本:', event.payload);
   * });
   * 
   * checker.on('error', (event) => {
   *   console.error('检查出错:', event.payload);
   * });
   * ```
   */
  public on(event: VersionCheckerEventType, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)?.add(callback);
  }

  /**
   * 移除事件监听器
   * 
   * @public
   * @param event - 事件类型
   * @param callback - 要移除的事件回调函数
   * 
   * @remarks
   * 该方法会从指定事件类型的监听器集合中移除指定的回调函数。
   * 如果事件类型不存在或回调函数未注册，则不会执行任何操作。
   * 
   * @example
   * ```typescript
   * const handleUpdate = (event) => {
   *   console.log('发现新版本:', event.payload);
   * };
   * 
   * // 添加监听器
   * checker.on('update', handleUpdate);
   * 
   * // 移除监听器
   * checker.off('update', handleUpdate);
   * ```
   */
  public off(event: VersionCheckerEventType, callback: Function): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  /**
   * 比较版本标记并生成版本信息
   * 
   * @private
   * @param newVersionTag - 新的版本标记
   * @returns 版本信息对象
   */
  private compareVersion(newVersionTag: string | null): VersionInfo {
    const versionInfo: VersionInfo = {
      currentVersion: this.versionTag,
      newVersion: newVersionTag,
      updateAvailable: false,
      timestamp: Date.now()
    };

    if (this.versionTag === null) {
      this.versionTag = newVersionTag;
    } else if (newVersionTag !== null && newVersionTag !== this.versionTag) {
      versionInfo.updateAvailable = true;
      this.versionTag = newVersionTag;
    }

    return versionInfo;
  }

  /**
   * 触发事件并通知所有监听器
   * 
   * @private
   * @param event - 事件类型
   * @param payload - 事件数据
   */
  private emit(event: VersionCheckerEventType, payload?: any): void {
    const eventData: VersionCheckerEvent = {
      type: event,
      payload,
      timestamp: Date.now()
    };

    this.eventListeners.get(event)?.forEach(callback => {
      try {
        callback(eventData);
      } catch (error) {
        console.error('Event listener error:', error);
      }
    });
  }

  /**
   * 获取定时器状态 - 仅用于测试
   * @internal
   */
  public getTimerState(): boolean {
    return this.timer !== null;
  }

  /**
   * 触发事件 - 仅用于测试
   * @internal
   */
  public triggerEvent(event: VersionCheckerEventType, payload?: any): void {
    this.emit(event, payload);
  }

  /**
   * 获取配置选项 - 仅用于测试
   * @internal
   */
  public getOptions(): Required<VersionCheckerOptions> {
    return { ...this.options };
  }
}

/**
 * 创建版本检查器实例的工厂函数
 * 
 * @param options - 版本检查器配置选项
 * @returns 返回一个新的 VersionChecker 实例
 * 
 * @remarks
 * 这是创建 VersionChecker 实例的推荐方式。
 * 该函数提供了一个更简洁的 API 来创建和配置版本检查器。
 * 
 * @example
 * ```typescript
 * const checker = createVersionChecker({
 *   checkInterval: 30000,
 *   versionUrl: '/api/version',
 *   compareStrategy: 'etag'
 * });
 * 
 * checker.on('update', (event) => {
 *   console.log('发现新版本:', event.payload);
 * });
 * ```
 */
export function createVersionChecker(options?: VersionCheckerOptions): VersionChecker {
  return new VersionChecker(options);
}
