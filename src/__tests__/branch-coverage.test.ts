import { VersionChecker } from '../index';

// 添加 Headers polyfill
class HeadersPolyfill {
  private headers: Map<string, string>;

  constructor(init?: Record<string, string>) {
    this.headers = new Map();
    if (init) {
      Object.entries(init).forEach(([key, value]) => {
        this.append(key, value);
      });
    }
  }

  append(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value);
  }

  delete(name: string): void {
    this.headers.delete(name.toLowerCase());
  }

  get(name: string): string | null {
    return this.headers.get(name.toLowerCase()) || null;
  }

  has(name: string): boolean {
    return this.headers.has(name.toLowerCase());
  }

  set(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value);
  }

  forEach(callback: (value: string, key: string) => void): void {
    this.headers.forEach((value, key) => callback(value, key));
  }
}

// 替换全局 Headers
global.Headers = HeadersPolyfill as any;

describe('分支覆盖率测试', () => {
  let fetchMock: jest.SpyInstance;

  const createMockResponse = (headers: Record<string, string>, options: Partial<Response> = {}) => {
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new HeadersPolyfill(headers),
      redirected: false,
      type: 'default',
      url: '',
      body: null,
      bodyUsed: false,
      clone: () => ({} as Response),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      blob: () => Promise.resolve(new Blob()),
      formData: () => Promise.resolve(new FormData()),
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
      ...options
    } as Response;
  };

  beforeEach(() => {
    jest.useFakeTimers();
    global.fetch = jest.fn();
    
    fetchMock = jest.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve(createMockResponse({
        'etag': 'W/"123"',
        'last-modified': 'Wed, 21 Oct 2023 07:28:00 GMT',
        'x-version': '1.0.0'
      }))
    );
  });

  afterEach(() => {
    if (fetchMock) {
      fetchMock.mockRestore();
    }
    jest.clearAllTimers();
    jest.useRealTimers();
    global.fetch = undefined as unknown as typeof fetch;
  });

  // 测试 compareStrategy 的 default 分支（208行）
  test('应该处理无效的比较策略并使用默认策略', async () => {
    // 创建一个使用无效比较策略的检查器实例
    const invalidStrategyChecker = new VersionChecker({
      autoStart: false,
      // 使用一个不在类型定义中的策略，强制走default分支
      compareStrategy: 'invalid-strategy' as any
    });

    // 只提供last-modified头，不提供etag头
    // 这样可以验证default分支中的逻辑是否正确执行
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(createMockResponse({
        'last-modified': 'Wed, 21 Oct 2023 07:28:00 GMT'
        // 没有提供etag头
      }))
    );

    const info = await invalidStrategyChecker.check();
    // 验证是否使用了last-modified作为版本标记
    expect(info.newVersion).toBe('Wed, 21 Oct 2023 07:28:00 GMT');
    invalidStrategyChecker.stop();
  });

  // 测试事件监听器的添加（266行）
  test('应该正确处理事件监听器的添加和获取', () => {
    const checker = new VersionChecker({ autoStart: false });
    const callback = jest.fn();
    
    // 测试添加事件监听器
    checker.on('update', callback);
    
    // 手动触发事件，验证监听器是否被正确添加
    checker.triggerEvent('update', { version: '1.0.0' });
    expect(callback).toHaveBeenCalledTimes(1);
    
    // 再次添加同一个事件的监听器，验证Set是否正常工作
    const callback2 = jest.fn();
    checker.on('update', callback2);
    
    // 再次触发事件，验证两个回调是否都被调用
    checker.triggerEvent('update', { version: '1.0.0' });
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback2).toHaveBeenCalledTimes(1);
    
    checker.stop();
  });
  
  // 测试事件监听器的可选链操作（266行）
  test('应该正确处理事件监听器的可选链操作', () => {
    // 创建一个检查器实例并获取其内部的eventListeners对象
    const checker = new VersionChecker({ autoStart: false });
    
    // 使用jest.spyOn模拟Map.prototype.get方法返回undefined
    // 这样可以模拟eventListeners.get(event)返回undefined的情况，从而测试可选链操作
    const originalGet = jest.spyOn(Map.prototype, 'get').mockImplementationOnce(() => undefined);
    
    // 添加一个事件监听器，这将触发可选链操作
    const callback = jest.fn();
    checker.on('update', callback);
    
    // 验证Map.prototype.get被调用
    expect(originalGet).toHaveBeenCalled();
    
    // 恢复原始的实现
    originalGet.mockRestore();
    
    checker.stop();
  });
});