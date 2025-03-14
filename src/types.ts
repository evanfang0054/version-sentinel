/**
 * 版本检查器配置选项接口
 * 
 * @remarks
 * 该接口定义了版本检查器的所有可配置选项。所有选项都是可选的,都有默认值。
 */
export interface VersionCheckerOptions {
  /** 
   * 检查间隔时间(毫秒)
   * @defaultValue 60000
   */
  checkInterval?: number;
  
  /** 
   * 自定义版本获取URL
   * @remarks 用于指定获取版本信息的接口地址
   */
  versionUrl?: string;
  
  /** 
   * 自定义版本比较策略
   * @remarks 支持三种比较策略:
   * - etag: 使用HTTP ETag头进行比较
   * - last-modified: 使用HTTP Last-Modified头进行比较 
   * - custom: 使用自定义比较逻辑
   */
  compareStrategy?: 'etag' | 'last-modified' | 'custom';
  
  /** 
   * 是否自动开始检查
   * @defaultValue true
   */
  autoStart?: boolean;
  
  /** 
   * 版本检查失败重试次数
   * @defaultValue 3
   */
  retryTimes?: number;
  
  /** 
   * 重试间隔时间(毫秒)
   * @defaultValue 3000
   */
  retryInterval?: number;
}

/**
 * 版本信息接口
 * 
 * @remarks
 * 该接口定义了版本检查的结果信息,包含当前版本、新版本、是否需要更新等信息
 */
export interface VersionInfo {
  /** 当前应用版本号 */
  currentVersion: string | null;
  /** 检测到的新版本号 */
  newVersion: string | null;
  /** 是否有可用更新 */
  updateAvailable: boolean;
  /** 版本检查时间戳 */
  timestamp: number;
}

/**
 * 版本检查器事件类型
 * 
 * @remarks
 * 定义了版本检查器支持的所有事件类型
 */
export type VersionCheckerEventType = 
  /** 发现新版本更新时触发 */
  | 'update'      
  /** 执行版本检查时触发 */
  | 'check'       
  /** 发生错误时触发 */
  | 'error'       
  /** 开始重试检查时触发 */
  | 'retry'       
  /** 开始版本检查时触发 */
  | 'start'       
  /** 停止版本检查时触发 */
  | 'stop';       

/**
 * 版本检查器事件接口
 * 
 * @remarks
 * 定义了版本检查器事件的数据结构
 */
export interface VersionCheckerEvent {
  /** 事件类型 */
  type: VersionCheckerEventType;
  /** 事件携带的数据 */
  payload?: any;
  /** 事件发生的时间戳 */
  timestamp: number;
} 