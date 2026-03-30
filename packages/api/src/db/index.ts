/**
 * Database Connections and Exports
 */

import { Sequelize } from 'sequelize';
import neo4j from 'neo4j-driver';
import { Pinecone } from '@pinecone-database/pinecone';
import Redis from 'ioredis';

// PostgreSQL
export const sequelize = new Sequelize({
  dialect: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'readpal',
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  pool: {
    min: parseInt(process.env.DB_POOL_MIN || '2', 10),
    max: parseInt(process.env.DB_POOL_MAX || '10', 10),
  },
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
});

// Neo4j
export const neo4jDriver = process.env.NEO4J_URI
  ? neo4j.driver(
      process.env.NEO4J_URI,
      neo4j.auth.basic(
        process.env.NEO4J_USER || 'neo4j',
        process.env.NEO4J_PASSWORD || 'password'
      )
    )
  : null;

// Pinecone
let pineconeClient: Pinecone | null = null;

export async function initPinecone() {
  if (process.env.PINECONE_API_KEY) {
    pineconeClient = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });
  }
  return pineconeClient;
}

export const getPinecone = () => pineconeClient;

// Redis (using ioredis)
export const redisClient = new Redis(
  process.env.REDIS_URL || 'redis://localhost:6379',
  {
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    retryStrategy: (times) => {
      if (times > 3) return null;
      return Math.min(times * 100, 3000);
    },
  }
);

redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisClient.on('connect', () => console.log('Redis Client Connected'));

export async function initRedis() {
  // ioredis connects automatically, but we can ping to verify
  try {
    await redisClient.ping();
  } catch {
    // Will retry automatically
  }
}

// Connection check
export async function checkConnections() {
  const status = {
    postgresql: false,
    neo4j: false,
    pinecone: false,
    redis: false,
  };

  try {
    await sequelize.authenticate();
    status.postgresql = true;
  } catch (error) {
    console.error('PostgreSQL connection failed:', error);
  }

  try {
    if (neo4jDriver) {
      const serverInfo = await neo4jDriver.getServerInfo();
      status.neo4j = !!serverInfo;
    }
  } catch (error) {
    console.error('Neo4j connection failed:', error);
  }

  try {
    const pinecone = await initPinecone();
    status.pinecone = !!pinecone;
  } catch (error) {
    console.error('Pinecone connection failed:', error);
  }

  try {
    await redisClient.ping();
    status.redis = true;
  } catch (error) {
    console.error('Redis connection failed:', error);
  }

  return status;
}

// Graceful shutdown
export async function closeConnections() {
  await sequelize.close();
  if (neo4jDriver) await neo4jDriver.close();
  redisClient.disconnect();
}
