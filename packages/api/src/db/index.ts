/**
 * Database Connections and Exports
 */

import { Sequelize } from 'sequelize';
import { Client as Neo4jClient } from 'neo4j-driver';
import { PineconeClient } from '@pinecone-database/pinecone';
import { createClient } from 'redis';

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
  ? Neo4jClient.driver(
      process.env.NEO4J_URI,
      Neo4jClient.auth.basic(
        process.env.NEO4J_USER || 'neo4j',
        process.env.NEO4J_PASSWORD || 'password'
      )
    )
  : null;

// Pinecone
let pineconeClient: PineconeClient | null = null;

export async function initPinecone() {
  if (process.env.PINECONE_API_KEY && process.env.PINECONE_ENVIRONMENT) {
    pineconeClient = new PineconeClient();
    await pineconeClient.init({
      apiKey: process.env.PINECONE_API_KEY,
      environment: process.env.PINECONE_ENVIRONMENT,
    });
  }
  return pineconeClient;
}

export const getPinecone = () => pineconeClient;

// Redis
export const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  password: process.env.REDIS_PASSWORD,
  database: parseInt(process.env.REDIS_DB || '0', 10),
});

redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisClient.on('connect', () => console.log('Redis Client Connected'));

export async function initRedis() {
  if (!redisClient.isOpen) {
    await redisClient.connect();
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
    await initRedis();
    status.redis = redisClient.isOpen;
  } catch (error) {
    console.error('Redis connection failed:', error);
  }

  return status;
}

// Graceful shutdown
export async function closeConnections() {
  await sequelize.close();
  if (neo4jDriver) await neo4jDriver.close();
  if (redisClient.isOpen) await redisClient.quit();
}
