// src/config/env.ts
import { cleanEnv, str, port, url } from 'envalid';

export function validateEnvironment() {
    return cleanEnv(process.env, {
        NODE_ENV: str({
            choices: ['development', 'test', 'production', 'staging'],
            default: 'development',
        }),
        PORT: port({ default: 3000 }),
        DATABASE_URL: url({ desc: 'PostgreSQL connection string is required for persistence' }),
        JWT_SECRET: str({ desc: 'Cryptographic secret key for JWT authentication is required', minLength: 32 }),
    });
}

export type EnvironmentConfig = ReturnType<typeof validateEnvironment>;
