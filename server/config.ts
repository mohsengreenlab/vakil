export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  sslMode: boolean;
  connectionLimit: number;
  queueLimit: number;
}

export interface AppConfig {
  port: number;
  nodeEnv: string;
  sessionSecret: string;
  trustProxy: boolean;
  secureCookies: boolean;
  database: DatabaseConfig;
}

function getEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name];
  if (!value && defaultValue === undefined) {
    throw new Error(`Environment variable ${name} is required`);
  }
  return value || defaultValue!;
}

function getEnvNumber(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) return defaultValue;
  const num = parseInt(value, 10);
  if (isNaN(num)) {
    throw new Error(`Environment variable ${name} must be a number`);
  }
  return num;
}

function getEnvBoolean(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

export function getConfig(): AppConfig {
  const nodeEnv = getEnvVar('NODE_ENV', 'development');
  const isProduction = nodeEnv === 'production';

  return {
    port: getEnvNumber('PORT', 5000),
    nodeEnv,
    sessionSecret: getEnvVar('SESSION_SECRET'),
    trustProxy: getEnvBoolean('TRUST_PROXY', isProduction),
    secureCookies: getEnvBoolean('SECURE_COOKIES', isProduction),
    database: {
      host: getEnvVar('DB_HOST'),
      port: getEnvNumber('DB_PORT', 3306),
      database: getEnvVar('DB_NAME'),
      username: getEnvVar('DB_USER'),
      password: getEnvVar('DB_PASSWORD'),
      sslMode: getEnvBoolean('DB_SSL', true),
      connectionLimit: getEnvNumber('DB_CONNECTION_LIMIT', 10),
      queueLimit: getEnvNumber('DB_QUEUE_LIMIT', 0)
    }
  };
}