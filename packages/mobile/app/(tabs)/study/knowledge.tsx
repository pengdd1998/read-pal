import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Dimensions, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Svg, Circle, Line, Text as SvgText, G } from 'react-native-svg';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withDecay } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { colors, typography, radius, shadows, spacing } from '@/lib/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const GRAPH_SIZE = Math.min(SCREEN_WIDTH, SCREEN_HEIGHT) * 1.5;

interface GraphNode {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
}

interface GraphEdge {
  source: string;
  target: string;
  label: string;
}

const NODE_COLORS: Record<string, string> = {
  concept: '#d97706',
  person: '#2b8a94',
  place: '#6b9e76',
  event: '#e85d75',
  quote: '#7c5cbf',
};

function forceDirectedLayout(nodes: GraphNode[], edges: GraphEdge[], iterations = 60): GraphNode[] {
  const placed = nodes.map((n, i) => ({
    ...n,
    x: GRAPH_SIZE / 2 + Math.cos((2 * Math.PI * i) / nodes.length) * 150,
    y: GRAPH_SIZE / 2 + Math.sin((2 * Math.PI * i) / nodes.length) * 150,
  }));

  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 1 - iter / iterations;
    // Repulsion
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const dx = placed[j].x - placed[i].x;
        const dy = placed[j].y - placed[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (200 * alpha) / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        placed[i].x -= fx;
        placed[i].y -= fy;
        placed[j].x += fx;
        placed[j].y += fy;
      }
    }
    // Attraction
    for (const edge of edges) {
      const s = placed.find((n) => n.id === edge.source);
      const t = placed.find((n) => n.id === edge.target);
      if (!s || !t) continue;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - 120) * 0.05 * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      s.x += fx;
      s.y += fy;
      t.x -= fx;
      t.y -= fy;
    }
    // Centering
    let cx = 0, cy = 0;
    placed.forEach((n) => { cx += n.x; cy += n.y; });
    cx /= placed.length;
    cy /= placed.length;
    placed.forEach((n) => {
      n.x += (GRAPH_SIZE / 2 - cx) * 0.1;
      n.y += (GRAPH_SIZE / 2 - cy) * 0.1;
    });
  }
  return placed;
}

export default function KnowledgeGraphScreen() {
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);

  const { data: graphData, isLoading } = useQuery({
    queryKey: ['knowledge-graph'],
    queryFn: async () => {
      const result = await api.get<any>('/api/knowledge/graph');
      return result.success ? result.data : null;
    },
  });

  const nodes: GraphNode[] = useMemo(() => {
    if (!graphData?.nodes) {
      return [
        { id: '1', label: 'Reading Comprehension', type: 'concept', x: 0, y: 0 },
        { id: '2', label: 'Critical Thinking', type: 'concept', x: 0, y: 0 },
        { id: '3', label: 'Knowledge Synthesis', type: 'concept', x: 0, y: 0 },
        { id: '4', label: 'Active Recall', type: 'concept', x: 0, y: 0 },
        { id: '5', label: 'Spaced Repetition', type: 'concept', x: 0, y: 0 },
      ];
    }
    return (graphData.nodes as any[]).map((n: any) => ({
      id: n.id, label: n.label || n.name || 'Concept',
      type: n.type || 'concept', x: 0, y: 0,
    }));
  }, [graphData]);

  const edges: GraphEdge[] = useMemo(() => {
    if (!graphData?.edges && !graphData?.connections) {
      return [
        { source: '1', target: '2', label: 'enables' },
        { source: '2', target: '3', label: 'leads to' },
        { source: '3', target: '4', label: 'uses' },
        { source: '4', target: '5', label: 'enhanced by' },
        { source: '1', target: '5', label: 'supports' },
      ];
    }
    return (graphData.edges || graphData.connections || []).map((e: any) => ({
      source: e.source || e.sourceId,
      target: e.target || e.targetId,
      label: e.label || e.relationship || '',
    }));
  }, [graphData]);

  const layoutNodes = useMemo(() => forceDirectedLayout(nodes, edges), [nodes, edges]);

  const filteredNodes = useMemo(() => {
    if (!searchQuery) return layoutNodes;
    return layoutNodes.filter((n) => n.label.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [layoutNodes, searchQuery]);

  const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = edges.filter((e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target));

  const panGesture = Gesture.Pan()
    .onUpdate((e) => { translateX.value = e.translationX; translateY.value = e.translationY; });

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => { scale.value = savedScale.value * e.scale; })
    .onEnd(() => { savedScale.value = scale.value; });

  const composed = Gesture.Simultaneous(panGesture, pinchGesture);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }],
  }));

  const handleNodeTap = (node: GraphNode) => setSelectedNode(node);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#d97706" />
        <Text style={styles.loadingText}>Loading knowledge graph...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => {}} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={22} color="#d97706" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Knowledge Graph</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={18} color={colors.navy[300]} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search concepts..."
          placeholderTextColor={colors.navy[300]}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color={colors.navy[300]} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.graphContainer}>
        <GestureDetector gesture={composed}>
          <Animated.View style={[{ width: GRAPH_SIZE, height: GRAPH_SIZE }, animatedStyle]}>
            <Svg width={GRAPH_SIZE} height={GRAPH_SIZE}>
              {/* Edges */}
              {filteredEdges.map((edge, i) => {
                const s = layoutNodes.find((n) => n.id === edge.source);
                const t = layoutNodes.find((n) => n.id === edge.target);
                if (!s || !t) return null;
                return (
                  <G key={`e-${i}`}>
                    <Line x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke="#d4b896" strokeWidth={1.5} opacity={0.5} />
                  </G>
                );
              })}
              {/* Nodes */}
              {filteredNodes.map((node) => {
                const color = NODE_COLORS[node.type] || '#d97706';
                const isSelected = selectedNode?.id === node.id;
                return (
                  <G key={node.id}>
                    <Circle
                      cx={node.x} cy={node.y} r={isSelected ? 24 : 18}
                      fill={`${color}22`} stroke={color} strokeWidth={isSelected ? 3 : 1.5}
                      onPress={() => handleNodeTap(node)}
                    />
                    <SvgText
                      x={node.x} y={node.y + 34}
                      textAnchor="middle"
                      fill={colors.navy[500]}
                      fontSize={10} fontFamily="DM Sans"
                    >
                      {node.label.length > 16 ? node.label.slice(0, 14) + '...' : node.label}
                    </SvgText>
                  </G>
                );
              })}
            </Svg>
          </Animated.View>
        </GestureDetector>
      </View>

      {/* Node detail sheet */}
      {selectedNode && (
        <View style={styles.nodeSheet}>
          <View style={styles.nodeSheetHeader}>
            <View style={[styles.nodeTypeDot, { backgroundColor: NODE_COLORS[selectedNode.type] || '#d97706' }]} />
            <Text style={styles.nodeSheetTitle}>{selectedNode.label}</Text>
            <TouchableOpacity onPress={() => setSelectedNode(null)}>
              <Ionicons name="close" size={20} color={colors.navy[300]} />
            </TouchableOpacity>
          </View>
          <Text style={styles.nodeSheetType}>Type: {selectedNode.type}</Text>
          <Text style={styles.nodeSheetConnections}>
            {filteredEdges.filter((e) => e.source === selectedNode.id || e.target === selectedNode.id).length} connections
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface[1] },
  centered: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { ...typography.body, color: colors.navy[300], marginTop: spacing.md },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.surface[2],
  },
  headerBtn: { padding: spacing.sm },
  headerTitle: { ...typography.bodyMedium, color: colors.navy[700] },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginHorizontal: spacing.lg, marginTop: spacing.md, marginBottom: spacing.sm,
    backgroundColor: colors.surface[0], borderRadius: radius.xl,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.surface[2],
  },
  searchInput: { flex: 1, ...typography.body, paddingVertical: 4, color: colors.navy[700] },
  graphContainer: { flex: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  nodeSheet: {
    backgroundColor: colors.surface[0], borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl, padding: spacing.lg,
    ...shadows.lg, borderTopWidth: 1, borderTopColor: colors.surface[2],
  },
  nodeSheetHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nodeTypeDot: { width: 12, height: 12, borderRadius: 6 },
  nodeSheetTitle: { ...typography.title, flex: 1, color: colors.navy[700] },
  nodeSheetType: { ...typography.caption, color: colors.navy[300], marginTop: spacing.sm },
  nodeSheetConnections: { ...typography.caption, color: colors.primary[500], marginTop: 4 },
});
