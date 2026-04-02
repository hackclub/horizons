import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
// import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  // private client: Redis;

  async onModuleInit() {
    console.log(
      'RedisService: Redis is disabled - using no-op implementations',
    );
    // const redisConfig = this.getRedisConfig();
    // this.client = new Redis(redisConfig);

    // this.client.on('error', (err) => {
    //   console.error('Redis error:', err);
    // });

    // this.client.on('connect', () => {
    //   console.log('Connected to Redis');
    // });

    // this.client.on('ready', () => {
    //   console.log('Redis client ready');
    // });

    // this.client.on('close', () => {
    //   console.log('Redis connection closed');
    // });

    // this.client.on('reconnecting', () => {
    //   console.log('Redis reconnecting...');
    // });

    // // Test Redis connection and commands with retry
    // let retryCount = 0;
    // const maxRetries = 3;

    // while (retryCount < maxRetries) {
    //   try {
    //     await this.testRedisCommands();
    //     await this.getRedisInfo();
    //     console.log('Redis initialization successful');
    //     break;
    //   } catch (error) {
    //     retryCount++;
    //     console.error(`Redis connection test failed (attempt ${retryCount}/${maxRetries}):`, error);

    //     if (retryCount < maxRetries) {
    //       console.log('Retrying Redis connection in 2 seconds...');
    //       await new Promise(resolve => setTimeout(resolve, 2000));
    //     } else {
    //       console.error('Redis connection failed after all retries. Application will continue but Redis features may not work properly.');
    //     }
    //   }
    // }
  }

  // private getRedisConfig() {
  //   const sentinelHosts = process.env.REDIS_SENTINEL_HOSTS;
  //   const sentinelName = process.env.REDIS_SENTINEL_NAME;
  //   const redisHost = process.env.REDIS_HOST || 'localhost';
  //   const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);

  //   // Auto-detect sentinel mode if connecting to sentinel port or if sentinel env vars are set
  //   const isSentinelMode = (sentinelHosts && sentinelName) || redisPort === 26379;

  //   if (isSentinelMode) {
  //     let hosts;

  //     if (sentinelHosts) {
  //       // Use explicit sentinel hosts
  //       hosts = sentinelHosts.split(',').map(host => {
  //         const [hostname, port] = host.trim().split(':');
  //         return { host: hostname, port: parseInt(port || '26379', 10) };
  //       });
  //     } else {
  //       // Auto-detect: use current host and port as sentinel
  //       hosts = [{ host: redisHost, port: redisPort }];
  //     }

  //     const masterName = sentinelName || 'mymaster';

  //     console.log('Using Redis Sentinel mode:', {
  //       sentinels: hosts,
  //       name: masterName,
  //       hasPassword: !!process.env.REDIS_PASSWORD
  //     });

  //     return {
  //       sentinels: hosts,
  //       name: masterName,
  //       password: process.env.REDIS_PASSWORD,
  //       db: parseInt(process.env.REDIS_DB || '0', 10),
  //       retryDelayOnFailover: 100,
  //       maxRetriesPerRequest: 3,
  //       lazyConnect: true,
  //       connectTimeout: 10000,
  //       commandTimeout: 5000,
  //     };
  //   }

  //   // Standard Redis configuration
  //   const config = {
  //     host: redisHost,
  //     port: redisPort,
  //     password: process.env.REDIS_PASSWORD,
  //     db: parseInt(process.env.REDIS_DB || '0', 10),
  //     retryDelayOnFailover: 100,
  //     maxRetriesPerRequest: 3,
  //     lazyConnect: true,
  //     connectTimeout: 10000,
  //     commandTimeout: 5000,
  //   };

  //   console.log('Using standard Redis mode:', {
  //     host: config.host,
  //     port: config.port,
  //     db: config.db,
  //     hasPassword: !!config.password
  //   });

  //   return config;
  // }

  async onModuleDestroy() {
    // if (this.client) {
    //   await this.client.quit();
    // }
  }

  // private async isRedisAvailable(): Promise<boolean> {
  //   try {
  //     await this.client.ping();
  //     return true;
  //   } catch (error) {
  //     return false;
  //   }
  // }

  async get(key: string): Promise<string | null> {
    console.log(`[Redis DISABLED] get: ${key}`);
    return null;
    // if (!(await this.isRedisAvailable())) {
    //   console.warn('Redis not available, returning null for get operation');
    //   return null;
    // }
    // return await this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    console.log(
      `[Redis DISABLED] set: ${key} = ${value.substring(0, 50)}... (ttl: ${ttlSeconds})`,
    );
    // if (!(await this.isRedisAvailable())) {
    //   console.warn('Redis not available, skipping set operation');
    //   return;
    // }
    // if (ttlSeconds) {
    //   await this.client.setex(key, ttlSeconds, value);
    // } else {
    //   await this.client.set(key, value);
    // }
  }

  async del(key: string): Promise<void> {
    console.log(`[Redis DISABLED] del: ${key}`);
    // if (!(await this.isRedisAvailable())) {
    //   console.warn('Redis not available, skipping delete operation');
    //   return;
    // }
    // await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    console.log(`[Redis DISABLED] exists: ${key}`);
    return false;
    // if (!(await this.isRedisAvailable())) {
    //   console.warn('Redis not available, returning false for exists check');
    //   return false;
    // }
    // const result = await this.client.exists(key);
    // return result === 1;
  }

  async increment(key: string, ttlSeconds?: number): Promise<number> {
    console.log(`[Redis DISABLED] increment: ${key} (ttl: ${ttlSeconds})`);
    return 0;
    // if (!(await this.isRedisAvailable())) {
    //   console.warn('Redis not available, skipping increment operation');
    //   return 0;
    // }

    // try {
    //   const count = await this.client.incr(key);
    //   if (ttlSeconds && count === 1) {
    //     await this.client.expire(key, ttlSeconds);
    //   }
    //   return count;
    // } catch (error) {
    //   console.error('Redis increment failed:', error);
    //   return 0;
    // }
  }

  async acquireLock(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    console.log(`[Redis DISABLED] acquireLock: ${key} (ttl: ${ttlSeconds})`);
    return true; // Always succeed when Redis is disabled
    // if (!(await this.isRedisAvailable())) {
    //   console.warn('Redis not available, lock acquisition failed');
    //   return false;
    // }

    // try {
    //   // Try the modern SET with NX and EX options first
    //   const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
    //   return result === 'OK';
    // } catch (error) {
    //   console.warn('Redis SET with NX/EX failed, trying fallback method:', error.message);

    //   try {
    //     // Fallback to using SETNX + EXPIRE
    //     const setResult = await this.client.setnx(key, value);
    //     if (setResult === 1) {
    //       await this.client.expire(key, ttlSeconds);
    //       return true;
    //     }
    //     return false;
    //   } catch (fallbackError) {
    //     console.error('Redis acquireLock fallback also failed:', fallbackError);
    //     // If Redis is completely unavailable, we could return false or implement
    //     // an in-memory lock mechanism as a last resort
    //     return false;
    //   }
    // }
  }

  async releaseLock(key: string, value: string): Promise<boolean> {
    console.log(`[Redis DISABLED] releaseLock: ${key}`);
    return true;
    // if (!(await this.isRedisAvailable())) {
    //   console.warn('Redis not available, lock release failed');
    //   return false;
    // }

    // const script = `
    //   if redis.call("get", KEYS[1]) == ARGV[1] then
    //     return redis.call("del", KEYS[1])
    //   else
    //     return 0
    //   end
    // `;
    // const result = await this.client.eval(script, 1, key, value);
    // return result === 1;
  }

  async extendLock(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    console.log(`[Redis DISABLED] extendLock: ${key} (ttl: ${ttlSeconds})`);
    return true;
    // if (!(await this.isRedisAvailable())) {
    //   console.warn('Redis not available, lock extension failed');
    //   return false;
    // }

    // const script = `
    //   if redis.call("get", KEYS[1]) == ARGV[1] then
    //     return redis.call("expire", KEYS[1], ARGV[2])
    //   else
    //     return 0
    //   end
    // `;
    // const result = await this.client.eval(script, 1, key, value, ttlSeconds);
    // return result === 1;
  }

  async getRedisInfo(): Promise<any> {
    console.log('[Redis DISABLED] getRedisInfo');
    return null;
    // try {
    //   const info = await this.client.info('server');
    //   console.log('Redis server info:', info);
    //   return info;
    // } catch (error) {
    //   console.error('Failed to get Redis info:', error);
    //   return null;
    // }
  }

  async testRedisCommands(): Promise<boolean> {
    console.log('[Redis DISABLED] testRedisCommands');
    return true;
    // try {
    //   // Test basic commands
    //   await this.client.ping();
    //   console.log('Redis PING successful');

    //   // Test SET command
    //   await this.client.set('test:basic', 'value');
    //   const value = await this.client.get('test:basic');
    //   await this.client.del('test:basic');

    //   if (value !== 'value') {
    //     throw new Error('Basic SET/GET failed');
    //   }
    //   console.log('Redis SET/GET/DEL commands working');

    //   // Test SET with EX
    //   const setExResult = await this.client.setex('test:ex', 10, 'value');
    //   if (setExResult !== 'OK') {
    //     throw new Error('SETEX command failed');
    //   }
    //   await this.client.del('test:ex');
    //   console.log('Redis SETEX command working');

    //   // Test SETNX with better error handling
    //   try {
    //     const setNxResult = await this.client.setnx('test:nx', 'value');
    //     if (setNxResult !== 1) {
    //       console.warn('SETNX command returned unexpected result:', setNxResult);
    //       // Don't throw error, just log warning
    //     } else {
    //       console.log('Redis SETNX command working');
    //     }
    //     await this.client.del('test:nx');
    //   } catch (setNxError) {
    //     console.warn('SETNX command failed, but continuing:', setNxError.message);
    //     // Try to clean up if key exists
    //     try {
    //       await this.client.del('test:nx');
    //     } catch (cleanupError) {
    //       // Ignore cleanup errors
    //     }
    //   }

    //   console.log('Redis connection and basic commands working correctly');
    //   return true;
    // } catch (error) {
    //   console.error('Redis command test failed:', error);
    //   return false;
    // }
  }
}
