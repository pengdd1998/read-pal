/**
 * Knowledge Routes
 *
 * Exposes the KnowledgeGraph service for graph visualization, concept listing,
 * and cross-book theme discovery.
 */

import { Router } from 'express';
import { KnowledgeGraphService } from '../services/KnowledgeGraph';
import { neo4jDriver } from '../db';
import { AuthRequest, authenticate } from '../middleware/auth';

const router: Router = Router();

// Lazy-initialised singleton (created once when Neo4j is available)
let kgInstance: KnowledgeGraphService | null = null;

function getKnowledgeGraph(): KnowledgeGraphService | null {
  if (!neo4jDriver) return null;
  if (!kgInstance) {
    kgInstance = new KnowledgeGraphService();
  }
  return kgInstance;
}

/**
 * Helper: build a standard "not configured" response so the frontend can
 * display a graceful empty state instead of an error.
 */
function notConfiguredResponse(res: { json: (body: unknown) => void }, partial?: Record<string, unknown>): void {
  res.json({
    success: true,
    data: {
      neo4jAvailable: false,
      ...partial,
    },
  });
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /api/knowledge/graph
 *
 * Returns nodes + edges for graph visualization.
 */
router.get('/graph', authenticate, async (req: AuthRequest, res) => {
  try {
    const kg = getKnowledgeGraph();
    if (!kg) {
      return notConfiguredResponse(res, {
        nodes: [],
        edges: [],
      });
    }

    const userId = req.userId!;
    const visualization = await kg.getGraphVisualization(userId);

    res.json({
      success: true,
      data: {
        neo4jAvailable: true,
        nodes: visualization.nodes,
        edges: visualization.edges,
      },
    });
  } catch (error) {
    console.error('Error fetching knowledge graph:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'KNOWLEDGE_GRAPH_ERROR',
        message: 'Failed to fetch knowledge graph',
      },
    });
  }
});

/**
 * GET /api/knowledge/concepts
 *
 * Returns a list of concepts for the authenticated user, optionally filtered
 * by bookId query parameter.
 */
router.get('/concepts', authenticate, async (req: AuthRequest, res) => {
  try {
    const kg = getKnowledgeGraph();
    if (!kg) {
      return notConfiguredResponse(res, {
        concepts: [],
      });
    }

    const userId = req.userId!;
    const bookId = req.query.bookId as string | undefined;
    const concepts = await kg.getConcepts(userId, bookId);

    res.json({
      success: true,
      data: {
        neo4jAvailable: true,
        concepts,
      },
    });
  } catch (error) {
    console.error('Error fetching concepts:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CONCEPTS_FETCH_ERROR',
        message: 'Failed to fetch concepts',
      },
    });
  }
});

/**
 * GET /api/knowledge/themes
 *
 * Returns cross-book themes discovered from the user's knowledge graph.
 */
router.get('/themes', authenticate, async (req: AuthRequest, res) => {
  try {
    const kg = getKnowledgeGraph();
    if (!kg) {
      return notConfiguredResponse(res, {
        themes: [],
      });
    }

    const userId = req.userId!;
    const themes = await kg.getCrossBookThemes(userId);

    res.json({
      success: true,
      data: {
        neo4jAvailable: true,
        themes,
      },
    });
  } catch (error) {
    console.error('Error fetching cross-book themes:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'THEMES_FETCH_ERROR',
        message: 'Failed to fetch cross-book themes',
      },
    });
  }
});

export default router;
