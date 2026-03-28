// ============================================================================
// Database Clients Initialization
// ============================================================================

import { Pool } from 'pg';
import Redis from 'ioredis';
import neo4j from 'neo4j-driver';
import { PineconeClient } from '@pinecone-database/pinecone';

// ============================================================================
// Clients Factory
// ============================================================================

/**
 * Create database clients
 */
export async function createDatabaseClients(config: EnvironmentConfig): Promise<DatabaseClients> {
  // PostgreSQL
  const postgres = new Pool({
    connectionString: config.database.url,
    min: config.database.poolMin,
    max: config.database.poolMax
  });

  // Redis
  const redis = new Redis(config.redis.url, {
    password: config.redis.password,
    db: config.redis.db,
    retryStrategy: (times) => {
      if (times > 3) {
        console.error('Redis connection failed after 3 retries');
        return null;
      }
      return Math.min(times * 100, 3000);
    }
  });

  // Neo4j
  const neo4jDriver = neo4j.driver(
    config.neo4j.uri,
    neo4j.auth.basic(config.neo4j.user, config.neo4j.password)
  );

  // Pinecone
  const pinecone = new PineconeClient({
    apiKey: config.pinecone.apiKey,
    environment: config.pinecone.environment
  });

  return {
    postgres: {
      query: async (text, params) => {
        const result = await postgres.query(text, params);
        return result.rows;
      },
      transaction: async (callback) => {
        const client = await postgres.connect();
        try {
          await client.query('BEGIN');
          const result = await callback({
            query: async (text, params) => {
              const res = await client.query(text, params);
              return res.rows;
            }
          });
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }
    },
    redis,
    neo4j: {
      run: async (query, params) => {
        const session = neo4jDriver.session();
        try {
          const result = await session.run(query, params);
          return {
            records: result.records.map(record => record.toObject())
          };
        } finally {
          await session.close();
        }
      },
      close: async () => {
        await neo4jDriver.close();
      }
    },
    pinecone: {
      upsert: async (index, vectors) => {
        const indexClient = pinecone.index(index);
        await indexClient.upsert(vectors);
      },
      query: async (index, vector, topK) => {
        const indexClient = pinecone.index(index);
        const queryResponse = await indexClient.query({
          vector,
          topK,
          includeMetadata: true
        });
        return queryResponse.matches.map(match => ({
          id: match.id,
          score: match.score,
          metadata: match.metadata
        }));
      },
      delete: async (index, ids) => {
        const indexClient = pinecone.index(index);
        await indexClient.deleteMany(ids);
      }
    } as any
  };
}

/**
 * Close all database connections
 */
export async function closeDatabaseClients(clients: DatabaseClients): Promise<void> {
  await clients.postgres.query?.('END'); // Close pool
  await clients.redis.disconnect();
  await clients.neo4j.close?.();
}
