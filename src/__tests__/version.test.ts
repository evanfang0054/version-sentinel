import { VersionChecker, createVersionChecker } from '../index';

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

describe('VersionChecker', () => {
  let checker: VersionChecker;
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

    checker = new VersionChecker({
      autoStart: false,
      checkInterval: 1000,
      versionUrl: '/version'
    });
  });

  afterEach(() => {
    if (checker) {
      checker.stop();
    }
    if (fetchMock) {
      fetchMock.mockRestore();
    }
    jest.clearAllTimers();
    jest.useRealTimers();
    global.fetch = undefined as unknown as typeof fetch;
  });

  describe('基础功能', () => {
    test('应该使用默认配置创建实例', () => {
      const defaultChecker = new VersionChecker({ autoStart: false });
      expect(defaultChecker).toBeInstanceOf(VersionChecker);
    });

    test('应该使用自定义配置创建实例', () => {
      const customChecker = new VersionChecker({
        autoStart: false,
        checkInterval: 5000,
        versionUrl: '/custom-version'
      });
      expect(customChecker).toBeInstanceOf(VersionChecker);
    });
  });

  describe('版本检查', () => {
    test('应该正确执行版本检查', async () => {
      const info = await checker.check();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(info.updateAvailable).toBe(false);
    });

    test('应该检测到版本更新', async () => {
      // 第一次检查
      await checker.check();
      
      // 模拟版本变化
      fetchMock.mockImplementationOnce(() =>
        Promise.resolve(createMockResponse({
          'etag': 'W/"456"'
        }))
      );

      // 第二次检查
      const info = await checker.check();
      expect(info.updateAvailable).toBe(true);
    });

    test('应该处理检查失败的情况', async () => {
      // 创建一个禁用重试的检查器实例
      const noRetryChecker = new VersionChecker({
        autoStart: false,
        retryTimes: 0  // 禁用重试
      });

      fetchMock.mockImplementationOnce(() =>
        Promise.resolve(createMockResponse({}, {
          ok: false,
          status: 500,
          statusText: 'Internal Server Error'
        }))
      );

      await expect(noRetryChecker.check()).rejects.toThrow('HTTP error');
    });
  });

  describe('自动检查', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('应该开始自动检查', () => {
      checker.start();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      
      jest.advanceTimersByTime(1000);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    test('应该停止自动检查', () => {
      checker.start();
      checker.stop();
      
      jest.advanceTimersByTime(1000);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test('应该安全处理重复启动', () => {
      checker.start();
      const firstState = checker.getTimerState();
      
      checker.start(); // 重复启动
      expect(checker.getTimerState()).toBe(firstState);
    });

    test('应该安全处理重复停止', () => {
      checker.stop(); // 在未启动时停止
      expect(checker.getTimerState()).toBe(false);
      
      checker.start();
      checker.stop();
      checker.stop(); // 重复停止
      expect(checker.getTimerState()).toBe(false);
    });
  });

  describe('事件系统', () => {
    test('应该触发更新事件', async () => {
      const updateHandler = jest.fn();
      checker.on('update', updateHandler);

      // 第一次检查设置初始版本
      await checker.check();
      
      // 模拟版本变化
      fetchMock.mockImplementationOnce(() =>
        Promise.resolve(createMockResponse({
          'etag': 'W/"789"'
        }))
      );

      // 第二次检查触发更新事件
      await checker.check();
      expect(updateHandler).toHaveBeenCalledTimes(1);
    });

    test('应该触发错误事件', async () => {
      // 创建一个禁用重试的检查器实例
      const noRetryChecker = new VersionChecker({
        autoStart: false,
        retryTimes: 0  // 禁用重试
      });

      const errorHandler = jest.fn();
      noRetryChecker.on('error', errorHandler);

      const error = new Error('Network error');
      fetchMock.mockRejectedValueOnce(error);

      await expect(noRetryChecker.check()).rejects.toBe(error);
      expect(errorHandler).toHaveBeenCalled();
    });

    test('应该正确移除事件监听器', async () => {
      const handler = jest.fn();
      checker.on('update', handler);
      checker.off('update', handler);

      // 模拟版本变化
      fetchMock.mockImplementationOnce(() =>
        Promise.resolve(createMockResponse({
          'etag': 'W/"new"'
        }))
      );

      await checker.check();
      expect(handler).not.toHaveBeenCalled();
    });

    test('应该正确处理事件监听器错误', async () => {
      // 创建一个禁用重试的检查器实例
      const noRetryChecker = new VersionChecker({
        autoStart: false,
        retryTimes: 0
      });

      const errorHandler = jest.fn(() => {
        throw new Error('Listener error');
      });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      noRetryChecker.on('error', errorHandler);
      
      const error = new Error('Network error');
      fetchMock.mockRejectedValueOnce(error);
      
      await expect(noRetryChecker.check()).rejects.toBe(error);
      
      expect(consoleSpy).toHaveBeenCalledWith('Event listener error:', expect.any(Error));
      consoleSpy.mockRestore();
    });

    test('应该处理事件监听器集合不存在的情况', () => {
      const unknownEvent = 'unknown' as any;
      const callback = jest.fn();
      
      // 测试 off 方法
      checker.off(unknownEvent, callback);
      expect(callback).not.toHaveBeenCalled();

      // 测试 emit 方法
      checker.triggerEvent(unknownEvent);
      expect(callback).not.toHaveBeenCalled();
    });

    test('应该正确处理 autoStart 选项', () => {
      const autoStartChecker = new VersionChecker({
        autoStart: true
      });
      expect(autoStartChecker.getTimerState()).toBe(true);
      autoStartChecker.stop();

      const manualStartChecker = new VersionChecker({
        autoStart: false
      });
      expect(manualStartChecker.getTimerState()).toBe(false);
    });

    test('应该正确处理多个事件监听器', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      checker.on('check', handler1);
      checker.on('check', handler2);
      
      await checker.check();
      
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    test('应该正确处理移除不存在的监听器', () => {
      const handler = jest.fn();
      const nonExistentHandler = jest.fn();
      
      checker.on('check', handler);
      checker.off('check', nonExistentHandler);
      
      checker.triggerEvent('check');
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('重试机制', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('应该在重试成功后重置重试计数', async () => {
      const retryHandler = jest.fn();
      checker.on('retry', retryHandler);

      // 第一次失败
      fetchMock
        .mockRejectedValueOnce(new Error('Network error'))
        // 第二次成功
        .mockResolvedValueOnce(createMockResponse({
          'etag': 'W/"123"'
        }));

      // 第一轮：失败后重试成功
      const firstPromise = checker.check();
      await jest.runAllTimersAsync();
      await firstPromise;
      expect(retryHandler).toHaveBeenCalledTimes(1);

      // 第三次失败
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      // 第二轮：应该能够重新开始重试
      const secondPromise = checker.check().catch(() => {});
      await jest.runAllTimersAsync();
      await secondPromise;
      expect(retryHandler).toHaveBeenCalledTimes(2);
    }, 10000);

    describe('错误处理', () => {
      let noRetryChecker: VersionChecker;
      let errorHandler: jest.Mock;

      beforeEach(() => {
        noRetryChecker = new VersionChecker({
          autoStart: false,
          retryTimes: 0  // 禁用重试
        });
        errorHandler = jest.fn();
        noRetryChecker.on('error', errorHandler);
      });

      test('应该正确处理 TypeError', async () => {
        const typeError = new TypeError('Invalid URL');
        fetchMock.mockImplementationOnce(() => {
          throw typeError;
        });

        await expect(noRetryChecker.check()).rejects.toBe(typeError);
        expect(errorHandler).toHaveBeenCalledTimes(1);
        expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
          type: 'error',
          payload: typeError
        }));
      });

      test('应该正确处理 HTTP 错误', async () => {
        const expectedError = new Error('HTTP error: 404 Not Found');
        fetchMock.mockImplementationOnce(() =>
          Promise.resolve(createMockResponse({}, {
            ok: false,
            status: 404,
            statusText: 'Not Found'
          }))
        );

        await expect(noRetryChecker.check()).rejects.toThrow(expectedError.message);
        expect(errorHandler).toHaveBeenCalledTimes(1);
        expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
          type: 'error',
          payload: expect.any(Error)
        }));
      });
    });
  });

  describe('版本比较策略', () => {
    test('应该使用 ETag 策略', async () => {
      const strategyChecker = new VersionChecker({
        autoStart: false,
        compareStrategy: 'etag'
      });
      await strategyChecker.check();
      expect(fetchMock).toHaveBeenCalled();
      strategyChecker.stop();
    });

    test('应该使用 Last-Modified 策略', async () => {
      const strategyChecker = new VersionChecker({
        autoStart: false,
        compareStrategy: 'last-modified'
      });
      await strategyChecker.check();
      expect(fetchMock).toHaveBeenCalled();
      strategyChecker.stop();
    });

    test('应该使用自定义策略', async () => {
      const strategyChecker = new VersionChecker({
        autoStart: false,
        compareStrategy: 'custom'
      });
      await strategyChecker.check();
      expect(fetchMock).toHaveBeenCalled();
      strategyChecker.stop();
    });

    test('应该处理所有响应头都不存在的情况', async () => {
      const strategyChecker = new VersionChecker({
        autoStart: false,
        compareStrategy: 'etag'
      });

      fetchMock.mockImplementationOnce(() =>
        Promise.resolve(createMockResponse({}, { // 空响应头
          ok: true
        }))
      );

      const info = await strategyChecker.check();
      expect(info.newVersion).toBeNull();
      strategyChecker.stop();
    });

    test('应该优先使用 x-version 头在自定义策略中', async () => {
      const strategyChecker = new VersionChecker({
        autoStart: false,
        compareStrategy: 'custom'
      });

      fetchMock.mockImplementationOnce(() =>
        Promise.resolve(createMockResponse({
          'x-version': '2.0.0',
          'etag': 'W/"123"'
        }))
      );

      const info = await strategyChecker.check();
      expect(info.newVersion).toBe('2.0.0');
      strategyChecker.stop();
    });

    test('应该处理默认策略', async () => {
      const strategyChecker = new VersionChecker({
        autoStart: false,
        compareStrategy: 'invalid' as any
      });

      fetchMock.mockImplementationOnce(() =>
        Promise.resolve(createMockResponse({
          'etag': 'W/"123"',
          'last-modified': 'Wed, 21 Oct 2023 07:28:00 GMT'
        }))
      );

      const info = await strategyChecker.check();
      expect(info.newVersion).toBe('W/"123"');
      strategyChecker.stop();
    });

    test('应该在自定义策略中回退到 ETag', async () => {
      const strategyChecker = new VersionChecker({
        autoStart: false,
        compareStrategy: 'custom'
      });

      fetchMock.mockImplementationOnce(() =>
        Promise.resolve(createMockResponse({
          'etag': 'W/"123"'
          // 没有 x-version 头
        }))
      );

      const info = await strategyChecker.check();
      expect(info.newVersion).toBe('W/"123"');
      strategyChecker.stop();
    });
  });

  describe('工厂函数', () => {
    test('应该正确创建实例', () => {
      const checker = createVersionChecker({
        autoStart: false,
        checkInterval: 5000
      });
      
      expect(checker).toBeInstanceOf(VersionChecker);
      expect(checker.getOptions().checkInterval).toBe(5000);
    });
  });
});
