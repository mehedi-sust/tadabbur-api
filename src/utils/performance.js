// Performance monitoring utilities
class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.startTimes = new Map();
  }

  startTimer(label) {
    this.startTimes.set(label, process.hrtime.bigint());
  }

  endTimer(label) {
    const startTime = this.startTimes.get(label);
    if (!startTime) return null;

    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds

    this.startTimes.delete(label);
    
    // Store metric
    if (!this.metrics.has(label)) {
      this.metrics.set(label, []);
    }
    
    const metrics = this.metrics.get(label);
    metrics.push(duration);
    
    // Keep only last 100 measurements
    if (metrics.length > 100) {
      metrics.shift();
    }

    return duration;
  }

  getAverageTime(label) {
    const metrics = this.metrics.get(label);
    if (!metrics || metrics.length === 0) return 0;
    
    return metrics.reduce((sum, time) => sum + time, 0) / metrics.length;
  }

  getStats(label) {
    const metrics = this.metrics.get(label);
    if (!metrics || metrics.length === 0) return null;

    const sorted = [...metrics].sort((a, b) => a - b);
    const len = sorted.length;
    
    return {
      count: len,
      min: sorted[0],
      max: sorted[len - 1],
      avg: metrics.reduce((sum, time) => sum + time, 0) / len,
      p50: sorted[Math.floor(len * 0.5)],
      p95: sorted[Math.floor(len * 0.95)],
      p99: sorted[Math.floor(len * 0.99)]
    };
  }

  getAllStats() {
    const stats = {};
    for (const [label] of this.metrics) {
      stats[label] = this.getStats(label);
    }
    return stats;
  }

  clear() {
    this.metrics.clear();
    this.startTimes.clear();
  }
}

// Middleware for Express performance monitoring
const performanceMiddleware = (monitor) => {
  return (req, res, next) => {
    const label = `${req.method} ${req.route?.path || req.path}`;
    monitor.startTimer(label);

    const originalSend = res.send;
    res.send = function(data) {
      const duration = monitor.endTimer(label);
      if (duration !== null) {
        res.set('X-Response-Time', `${duration.toFixed(2)}ms`);
      }
      return originalSend.call(this, data);
    };

    next();
  };
};

// Database query performance wrapper
const withPerformanceTracking = (monitor, label) => {
  return async (queryFn) => {
    monitor.startTimer(`db_${label}`);
    try {
      const result = await queryFn();
      const duration = monitor.endTimer(`db_${label}`);
      if (duration > 1000) { // Log slow queries (>1s)
        console.warn(`🐌 Slow query detected: ${label} took ${duration.toFixed(2)}ms`);
      }
      return result;
    } catch (error) {
      monitor.endTimer(`db_${label}`);
      throw error;
    }
  };
};

module.exports = {
  PerformanceMonitor,
  performanceMiddleware,
  withPerformanceTracking
};
