/**
 * Knowledge Graph Service
 *
 * Integrates with Neo4j to auto-construct knowledge networks from user reading data.
 * Manages concepts, relationships, cross-book themes, and provides graph visualization.
 */

import neo4j, { Driver, Session, Integer, Record as Neo4jRecord } from 'neo4j-driver';
import { neo4jDriver } from '../db';
import { Logger } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Represents a single concept node in the knowledge graph. */
interface Concept {
  id: string;
  userId: string;
  bookId: string;
  name: string;
  description?: string;
  context?: string;
  sourceLocation?: string;
  createdAt: string;
  updatedAt: string;
}

/** Represents a directed relationship between two concepts. */
interface ConceptRelationship {
  id: string;
  fromConceptId: string;
  toConceptId: string;
  type: RelationshipType;
  strength?: number;
  description?: string;
  createdAt: string;
}

/** Supported relationship types between concepts. */
type RelationshipType =
  | 'RELATED_TO'
  | 'PREREQUISITE_OF'
  | 'PART_OF'
  | 'CONTRASTS_WITH'
  | 'SUPPORTS'
  | 'EXAMPLE_OF'
  | 'LEADS_TO'
  | 'SYNONYM_OF';

/** A node formatted for graph visualization clients. */
interface VisualizationNode {
  id: string;
  label: string;
  bookId: string;
  bookTitle?: string;
  weight: number;
  group?: string;
}

/** An edge formatted for graph visualization clients. */
interface VisualizationEdge {
  source: string;
  target: string;
  label: string;
  weight: number;
}

/** Complete graph payload for frontend visualization. */
interface GraphVisualization {
  nodes: VisualizationNode[];
  edges: VisualizationEdge[];
}

/** A theme that spans multiple books. */
interface CrossBookTheme {
  concept: string;
  conceptId: string;
  bookIds: string[];
  bookTitles: string[];
  strength: number;
  relatedConcepts: string[];
}

/** Result of finding connections between two books. */
interface BookConnection {
  conceptA: { id: string; name: string };
  conceptB: { id: string; name: string };
  relationship: string;
  strength: number;
  pathLength: number;
}

/** Search hit returned by `searchConcepts`. */
interface ConceptSearchResult {
  id: string;
  name: string;
  description?: string;
  bookId: string;
  score: number;
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const defaultLogger: Logger = {
  debug: (message: string, meta?: unknown) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[KnowledgeGraph] ${message}`, meta ?? '');
    }
  },
  info: (message: string, meta?: unknown) => {
    console.info(`[KnowledgeGraph] ${message}`, meta ?? '');
  },
  warn: (message: string, meta?: unknown) => {
    console.warn(`[KnowledgeGraph] ${message}`, meta ?? '');
  },
  error: (message: string, meta?: unknown) => {
    console.error(`[KnowledgeGraph] ${message}`, meta ?? '');
  },
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class KnowledgeGraphService {
  private readonly driver: Driver | null;
  private readonly logger: Logger;
  private driverWarned = false;

  constructor(logger?: Logger) {
    this.driver = neo4jDriver;
    this.logger = logger ?? defaultLogger;

    if (!this.driver && !this.driverWarned) {
      this.driverWarned = true;
      this.logger.info(
        'Neo4j driver is not initialised. Knowledge graph operations will be silently skipped.'
      );
    }
  }

  // -----------------------------------------------------------------------
  // Concept CRUD
  // -----------------------------------------------------------------------

  /**
   * Add a concept extracted from a book into the knowledge graph.
   *
   * Creates a `Concept` node scoped to the user and book. If a concept with
   * the same name already exists for this user+book combination the existing
   * node is updated instead of duplicated.
   */
  async addConcept(
    userId: string,
    bookId: string,
    concept: { name: string; description?: string },
    context?: string,
    sourceLocation?: string,
  ): Promise<Concept> {
    if (!this.isAvailable()) {
      return {
        id: '',
        userId,
        bookId,
        name: concept.name,
        description: concept.description,
        context,
        sourceLocation,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    const session = this.openSession();

    try {
      const now = new Date().toISOString();
      const result = await session.run(
        `
        MERGE (c:Concept {userId: $userId, name: $name, bookId: $bookId})
        ON CREATE SET
          c.id        = randomUUID(),
          c.createdAt = $now,
          c.description = $description
        ON MATCH SET
          c.description = $description,
          c.updatedAt   = $now
        SET
          c.context        = $context,
          c.sourceLocation = $sourceLocation,
          c.updatedAt      = $now
        RETURN c
        `,
        {
          userId,
          bookId,
          name: concept.name,
          description: concept.description ?? null,
          context: context ?? null,
          sourceLocation: sourceLocation ?? null,
          now,
        },
      );

      const record = this.singleRecord(result.records);
      return this.hydrateConcept(record.get('c'));
    } catch (error) {
      this.logger.error('Failed to add concept', { userId, bookId, concept, error });
      throw new Error(`Failed to add concept: ${(error as Error).message}`);
    } finally {
      await session.close();
    }
  }

  /**
   * Create a directed relationship between two concepts.
   *
   * If a relationship of the same type already exists in the same direction
   * its strength and description are updated.
   */
  async addRelationship(
    userId: string,
    fromConceptId: string,
    toConceptId: string,
    relationshipType: RelationshipType,
    strength?: number,
    description?: string,
  ): Promise<ConceptRelationship> {
    if (!this.isAvailable()) {
      return {
        id: '',
        fromConceptId,
        toConceptId,
        type: relationshipType,
        strength,
        description,
        createdAt: new Date().toISOString(),
      };
    }
    const session = this.openSession();

    try {
      const now = new Date().toISOString();
      const safeRelType = this.sanitizeRelationshipType(relationshipType);

      const result = await session.run(
        `
        MATCH (a:Concept {id: $fromConceptId, userId: $userId})
        MATCH (b:Concept {id: $toConceptId, userId: $userId})
        MERGE (a)-[r:${safeRelType}]->(b)
        ON CREATE SET r.id = randomUUID(), r.createdAt = $now
        SET r.strength   = coalesce($strength, r.strength, 0.5),
            r.description = $description,
            r.updatedAt   = $now
        RETURN a.id AS fromId, b.id AS toId, type(r) AS relType, r
        `,
        {
          userId,
          fromConceptId,
          toConceptId,
          strength: strength ?? null,
          description: description ?? null,
          now,
        },
      );

      if (result.records.length === 0) {
        throw new Error(
          'One or both concepts not found for this user. Ensure both concept IDs exist and belong to the same user.',
        );
      }

      const record = result.records[0];
      const rel = this.nodeProperties(record.get('r'));

      return {
        id: rel.id as string,
        fromConceptId: record.get('fromId') as string,
        toConceptId: record.get('toId') as string,
        type: record.get('relType') as RelationshipType,
        strength: rel.strength as number | undefined,
        description: rel.description as string | undefined,
        createdAt: rel.createdAt as string,
      };
    } catch (error) {
      this.logger.error('Failed to add relationship', {
        userId,
        fromConceptId,
        toConceptId,
        relationshipType,
        error,
      });
      throw new Error(`Failed to add relationship: ${(error as Error).message}`);
    } finally {
      await session.close();
    }
  }

  /**
   * Retrieve concepts for a user, optionally filtered by book.
   */
  async getConcepts(userId: string, bookId?: string): Promise<Concept[]> {
    if (!this.isAvailable()) return [];
    const session = this.openSession();

    try {
      const query = bookId
        ? 'MATCH (c:Concept {userId: $userId, bookId: $bookId}) RETURN c ORDER BY c.createdAt DESC'
        : 'MATCH (c:Concept {userId: $userId}) RETURN c ORDER BY c.createdAt DESC';

      const params: Record<string, unknown> = { userId };
      if (bookId) {
        params.bookId = bookId;
      }

      const result = await session.run(query, params);
      return result.records.map((rec: Neo4jRecord) => this.hydrateConcept(rec.get('c')));
    } catch (error) {
      this.logger.error('Failed to get concepts', { userId, bookId, error });
      throw new Error(`Failed to get concepts: ${(error as Error).message}`);
    } finally {
      await session.close();
    }
  }

  /**
   * Retrieve concepts related to a given concept, up to `depth` hops.
   *
   * Returns a flat list of concepts reachable within the specified depth,
   * excluding the starting concept itself.
   */
  async getRelatedConcepts(
    userId: string,
    conceptId: string,
    depth: number = 1,
  ): Promise<Concept[]> {
    if (!this.isAvailable()) return [];

    if (depth < 1 || depth > 5) {
      throw new Error('Depth must be between 1 and 5.');
    }

    const session = this.openSession();

    try {
      const result = await session.run(
        `
        MATCH (start:Concept {id: $conceptId, userId: $userId})
        MATCH (start)-[*1..${depth}]-(related:Concept {userId: $userId})
        WHERE related.id <> $conceptId
        RETURN DISTINCT related
        ORDER BY related.createdAt DESC
        `,
        { userId, conceptId },
      );

      return result.records.map((rec: Neo4jRecord) => this.hydrateConcept(rec.get('related')));
    } catch (error) {
      this.logger.error('Failed to get related concepts', { userId, conceptId, depth, error });
      throw new Error(`Failed to get related concepts: ${(error as Error).message}`);
    } finally {
      await session.close();
    }
  }

  /**
   * Find connections between two books through shared or related concepts.
   */
  async findConnections(
    userId: string,
    bookId1: string,
    bookId2: string,
  ): Promise<BookConnection[]> {
    if (!this.isAvailable()) return [];
    const session = this.openSession();

    try {
      const result = await session.run(
        `
        MATCH (a:Concept {userId: $userId, bookId: $bookId1})
        MATCH (b:Concept {userId: $userId, bookId: $bookId2})
        MATCH path = shortestPath((a)-[*..6]-(b))
        WHERE ALL(n IN nodes(path) WHERE n.userId = $userId)
        WITH a, b, relationships(path) AS rels
        WITH a, b,
             head(rels) AS firstRel,
             size(rels) AS pathLength,
             CASE WHEN size(rels) > 0
               THEN avg(r IN rels | coalesce(r.strength, 0.5))
               ELSE 0.5
             END AS avgStrength
        RETURN a.id   AS conceptAId,
               a.name AS conceptAName,
               b.id   AS conceptBId,
               b.name AS conceptBName,
               type(firstRel) AS relationship,
               avgStrength   AS strength,
               pathLength
        ORDER BY strength DESC
        LIMIT 50
        `,
        { userId, bookId1, bookId2 },
      );

      return result.records.map((rec: Neo4jRecord) => ({
        conceptA: {
          id: rec.get('conceptAId') as string,
          name: rec.get('conceptAName') as string,
        },
        conceptB: {
          id: rec.get('conceptBId') as string,
          name: rec.get('conceptBName') as string,
        },
        relationship: rec.get('relationship') as string,
        strength: this.toNumber(rec.get('strength')),
        pathLength: this.toNumber(rec.get('pathLength')),
      }));
    } catch (error) {
      this.logger.error('Failed to find connections between books', {
        userId,
        bookId1,
        bookId2,
        error,
      });
      throw new Error(`Failed to find connections: ${(error as Error).message}`);
    } finally {
      await session.close();
    }
  }

  /**
   * Build a graph payload (nodes + edges) suitable for visualization on the
   * frontend (e.g. D3.js, Cytoscape, or Vis.js).
   */
  async getGraphVisualization(userId: string): Promise<GraphVisualization> {
    if (!this.isAvailable()) return { nodes: [], edges: [] };
    const session = this.openSession();

    try {
      // Fetch all concept nodes for the user with their degree
      const nodeResult = await session.run(
        `
        MATCH (c:Concept {userId: $userId})
        OPTIONAL MATCH (c)-[r]-(:Concept {userId: $userId})
        WITH c, count(r) AS degree
        RETURN c, degree
        ORDER BY degree DESC
        `,
        { userId },
      );

      const nodes: VisualizationNode[] = nodeResult.records.map((rec: Neo4jRecord) => {
        const c = this.nodeProperties(rec.get('c'));
        return {
          id: c.id as string,
          label: c.name as string,
          bookId: (c.bookId as string) ?? '',
          weight: this.toNumber(rec.get('degree')),
        };
      });

      // Fetch all relationships between those concepts
      const edgeResult = await session.run(
        `
        MATCH (a:Concept {userId: $userId})-[r]->(b:Concept {userId: $userId})
        RETURN a.id AS source, b.id AS target, type(r) AS label,
               coalesce(r.strength, 0.5) AS weight
        `,
        { userId },
      );

      const edges: VisualizationEdge[] = edgeResult.records.map((rec: Neo4jRecord) => ({
        source: rec.get('source') as string,
        target: rec.get('target') as string,
        label: rec.get('label') as string,
        weight: this.toNumber(rec.get('weight')),
      }));

      return { nodes, edges };
    } catch (error) {
      this.logger.error('Failed to build graph visualization', { userId, error });
      throw new Error(`Failed to build graph visualization: ${(error as Error).message}`);
    } finally {
      await session.close();
    }
  }

  /**
   * Search concepts by name or description using text matching.
   *
   * For true semantic search, a vector-based approach via Pinecone would be
   * layered on top of this in a future iteration.
   */
  async searchConcepts(userId: string, query: string): Promise<ConceptSearchResult[]> {
    if (!this.isAvailable()) return [];

    if (!query || query.trim().length === 0) {
      throw new Error('Search query must not be empty.');
    }

    const session = this.openSession();

    try {
      const result = await session.run(
        `
        MATCH (c:Concept {userId: $userId})
        WHERE c.name CONTAINS $term
           OR c.description CONTAINS $term
           OR c.context CONTAINS $term
        WITH c,
             CASE
               WHEN c.name = $term                     THEN 1.0
               WHEN c.name STARTS WITH $term           THEN 0.9
               WHEN c.name CONTAINS $term              THEN 0.8
               WHEN c.description CONTAINS $term       THEN 0.6
               ELSE 0.4
             END AS score
        RETURN c.id AS id, c.name AS name, c.description AS description,
               c.bookId AS bookId, score
        ORDER BY score DESC
        LIMIT 30
        `,
        { userId, term: query.trim() },
      );

      return result.records.map((rec: Neo4jRecord) => ({
        id: rec.get('id') as string,
        name: rec.get('name') as string,
        description: rec.get('description') as string | undefined,
        bookId: rec.get('bookId') as string,
        score: this.toNumber(rec.get('score')),
      }));
    } catch (error) {
      this.logger.error('Failed to search concepts', { userId, query, error });
      throw new Error(`Failed to search concepts: ${(error as Error).message}`);
    } finally {
      await session.close();
    }
  }

  /**
   * Discover themes that appear across multiple books for a given user.
   *
   * A "theme" is any concept that is connected to concepts in more than one
   * book. Results are ordered by the number of distinct books involved.
   */
  async getCrossBookThemes(userId: string): Promise<CrossBookTheme[]> {
    if (!this.isAvailable()) return [];
    const session = this.openSession();

    try {
      const result = await session.run(
        `
        MATCH (c:Concept {userId: $userId})-[]-(other:Concept {userId: $userId})
        WHERE other.bookId <> c.bookId
        WITH c, collect(DISTINCT other.bookId) AS crossBookIds,
             collect(DISTINCT other.name)[0..10] AS relatedNames
        RETURN c.id      AS conceptId,
               c.name    AS concept,
               c.bookId  AS ownBookId,
               crossBookIds,
               size(crossBookIds) + 1 AS strength,
               relatedNames AS relatedConcepts
        ORDER BY strength DESC
        LIMIT 50
        `,
        { userId },
      );

      return result.records.map((rec: Neo4jRecord) => {
        const ownBookId = rec.get('ownBookId') as string;
        const crossBookIds = (rec.get('crossBookIds') as string[]) ?? [];
        const allBookIds = [ownBookId, ...crossBookIds];
        return {
          conceptId: rec.get('conceptId') as string,
          concept: rec.get('concept') as string,
          bookIds: allBookIds,
          bookTitles: [],
          strength: this.toNumber(rec.get('strength')),
          relatedConcepts: (rec.get('relatedConcepts') as string[]) ?? [],
        };
      });
    } catch (error) {
      this.logger.error('Failed to get cross-book themes', { userId, error });
      throw new Error(`Failed to get cross-book themes: ${(error as Error).message}`);
    } finally {
      await session.close();
    }
  }

  /**
   * Remove a concept and all its relationships from the graph.
   */
  async removeConcept(userId: string, conceptId: string): Promise<boolean> {
    if (!this.isAvailable()) return false;
    const session = this.openSession();

    try {
      const result = await session.run(
        `
        MATCH (c:Concept {id: $conceptId, userId: $userId})
        DETACH DELETE c
        RETURN count(c) AS deleted
        `,
        { userId, conceptId },
      );

      const deleted = this.toNumber(result.records[0]?.get('deleted'));
      this.logger.info('Concept removed', { userId, conceptId, deleted });

      return deleted > 0;
    } catch (error) {
      this.logger.error('Failed to remove concept', { userId, conceptId, error });
      throw new Error(`Failed to remove concept: ${(error as Error).message}`);
    } finally {
      await session.close();
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /** Return false if the Neo4j driver has not been initialised. */
  private isAvailable(): boolean {
    return this.driver !== null;
  }

  /** Open a new Neo4j session. Caller must close it when done. */
  private openSession(): Session {
    return this.driver!.session();
  }

  /**
   * Validate and sanitize a relationship type so it is safe to interpolate
   * into a Cypher query. Neo4j relationship types must match `[A-Z_0-9]+`.
   */
  private sanitizeRelationshipType(type: string): string {
    const sanitized = type.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    if (sanitized !== type) {
      this.logger.warn(`Relationship type "${type}" was sanitised to "${sanitized}"`);
    }
    return sanitized;
  }

  /** Convert a Neo4j `Integer` or number to a JS number. */
  private toNumber(value: unknown): number {
    if (value === null || value === undefined) {
      return 0;
    }
    if (typeof value === 'number') {
      return value;
    }
    if (neo4j.isInt(value as Integer)) {
      return (value as Integer).toNumber();
    }
    return Number(value);
  }

  /** Get the first (and expected only) record from a result set. */
  private singleRecord(records: Neo4jRecord[]): Neo4jRecord {
    if (records.length === 0) {
      throw new Error('No records returned from Neo4j.');
    }
    return records[0];
  }

  /** Extract properties from a Neo4j node or relationship value. */
  private nodeProperties(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && 'properties' in value) {
      return (value as { properties: () => Record<string, unknown> }).properties();
    }
    return value as Record<string, unknown>;
  }

  /** Hydrate a Neo4j node into a `Concept` object. */
  private hydrateConcept(nodeValue: unknown): Concept {
    const props = this.nodeProperties(nodeValue);
    return {
      id: String(props.id),
      userId: String(props.userId),
      bookId: String(props.bookId),
      name: String(props.name),
      description: props.description ? String(props.description) : undefined,
      context: props.context ? String(props.context) : undefined,
      sourceLocation: props.sourceLocation ? String(props.sourceLocation) : undefined,
      createdAt: String(props.createdAt ?? ''),
      updatedAt: String(props.updatedAt ?? ''),
    };
  }
}

/** Singleton instance for convenient import. */
export const knowledgeGraph = new KnowledgeGraphService();
