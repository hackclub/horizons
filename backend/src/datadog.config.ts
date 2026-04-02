import { config } from 'dotenv';
import { resolve } from 'path';

if (process.env.NODE_ENV !== 'production') {
  config({ path: resolve(__dirname, '../../.env') });
}

import tracer from 'dd-trace';

const serviceName = process.env.DD_SERVICE || 'backend';
const environment = process.env.DD_ENV || process.env.NODE_ENV || 'production';
const version = process.env.DD_VERSION || 'unknown';

console.log(`🔍 Initializing Datadog tracing for service: ${serviceName}`);
console.log(`   Environment: ${environment}`);
console.log(`   Version: ${version}`);
console.log(
  `   Profiling: ${process.env.DD_PROFILING_ENABLED !== 'false' ? 'enabled' : 'disabled'}`,
);
console.log(
  `   APM: ${process.env.DD_APM_ENABLED !== 'false' ? 'enabled' : 'disabled'}`,
);

tracer.init({
  profiling: process.env.DD_PROFILING_ENABLED !== 'false',
  service: serviceName,
  env: environment,
  version: version,
  logInjection: true,
});

console.log('✅ Datadog tracing initialized successfully');

export default tracer;
