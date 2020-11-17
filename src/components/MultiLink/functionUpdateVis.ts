import {
  Selection, select, selectAll, BaseType,
} from 'd3-selection';
import {
  forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, Simulation, ForceLink,
} from 'd3-force';
import { max } from 'd3-array';
import { ScaleOrdinal } from 'd3-scale';
// eslint-disable-next-line import/no-cycle
import { selectNode, ProvenanceEvents } from '@/lib/provenance';
import {
  Node, State, Link, Network, Dimensions,
} from '@/types';
import { Provenance } from '@visdesignlab/trrack';

export function getForceRadius(nodeMarkerLength: number, nodeMarkerHeight: number, renderNested: boolean) {
  if (renderNested) {
    const radius = max([nodeMarkerLength, nodeMarkerHeight]) || 0;
    return radius * 0.8;
  }
  const radius = max([nodeMarkerLength / 2, nodeMarkerHeight / 2]) || 0;
  return radius * 1.5;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeSimulation(this: any, state: State): Simulation<Node, Link> {
  const simulation = forceSimulation<Node, Link>()
    .force('link', forceLink().id((l: unknown) => {
      const link = l as Link;
      return link.id;
    }))
    .force('charge', forceManyBody().strength(-300))
    .force(
      'center',
      forceCenter(
        this.visDimensions.width / 2,
        this.visDimensions.height / 2,
      ),
    );

  simulation.nodes(state.network.nodes);

  const simulationLinks: ForceLink<Node, Link> | undefined = simulation.force('link');

  if (simulationLinks !== undefined) {
    simulationLinks.links(state.network.links);
    simulationLinks.distance(() => 60);
  }

  simulation.force('link');
  simulation.force('center');
  simulation.on('tick', () => dragNode(state, this));

  simulation.force('collision',
    forceCollide()
      .radius(getForceRadius(state.nodeMarkerLength, state.nodeMarkerHeight, this.renderNested))
      .strength(0.7)
      .iterations(10));

  // Start the simulation with an alpha target and an alpha min
  // that's a little larger so the sim ends
  simulation.alphaMin(0.025);
  simulation.alphaTarget(0.02).restart();

  return simulation;
}

export function highlightLinks(state: State): void {
  const linksToHighlight = state.network.links.map((l: Link) => {
    if (l.source.id in state.selected || l.target.id in state.selected) {
      return l.id;
    }
    return '';
  });

  select('.links')
    .selectAll('.linkGroup')
    .classed('muted', (l: unknown) => {
      const link = l as Link;
      return Object.keys(state.selected).length > 0 && !linksToHighlight.includes(link.id);
    });
}

export function drawNested(
  node: Selection<BaseType, Node, BaseType, unknown>,
  nodeMarkerHeight: number,
  nodeMarkerLength: number,
  glyphColorScale: ScaleOrdinal<string, string>,
  barVariables: string[],
  glyphVariables: string[],
  graphStructure: Network,
) {
  // Delete past renders
  node.selectAll('.bar').remove();
  node.selectAll('.glyph').remove();

  // Set some bar specific variables that we'll need for tracking position and sizes
  const barWidth = glyphVariables.length === 0
    ? nodeMarkerLength / barVariables.length
    : (nodeMarkerLength / 2) / barVariables.length;

  barVariables.forEach((barVar, i) => {
    const maxValue: number = max(graphStructure.nodes.map((n: Node) => parseFloat(n[barVar]))) || 1;
    // Draw white, background bar
    node.append('rect')
      .attr('class', 'bar')
      .attr('width', `${barWidth - 10}px`)
      .attr('height', `${nodeMarkerHeight - 16 - 5 - 5}px`)
      .attr('y', `${16 + 5}px`)
      .attr('x', `${5 + (i * barWidth)}px`)
      .style('fill', '#FFFFFF');

    // Draw the color bar with height based on data
    node.append('rect')
      .attr('class', 'bar')
      .attr('width', `${barWidth - 10}px`)
      .attr('height', (d: Node) => `${((nodeMarkerHeight - 16 - 5 - 5) * d[barVar]) / maxValue}px`)
      .attr('y', (d: Node) => `${(nodeMarkerHeight - 5 - ((nodeMarkerHeight - 16 - 5 - 5) * d[barVar]) / maxValue)}px`)
      .attr('x', `${5 + (i * barWidth)}px`)
      .style('fill', '#82b1ff');
  });

  // Append glyphs
  [0, 1].forEach((i) => {
    const glyphVar = glyphVariables[i];
    if (glyphVar === undefined) {
      return;
    }
    // Draw glyph
    node.append('rect')
      .attr('class', 'glyph')
      .attr('width', `${(nodeMarkerLength / 2) - 5 - 5 - 5}px`)
      .attr('height', `${(nodeMarkerHeight / 2) - 5 - 5 - 5}px`)
      .attr('y', `${16 + 5 + (i * ((nodeMarkerHeight / 2) - 5 - 5 - 5)) + 5 * (i)}px`)
      .attr('x', `${5 + ((nodeMarkerLength / 2) - 5 - 5) + 5 + 5}px`)
      .attr('ry', `${((nodeMarkerHeight / 2) - 5 - 5) / 2}px`)
      .attr('rx', `${((nodeMarkerLength / 2) - 5 - 5) / 2}px`)
      .style('fill', (d: Node) => glyphColorScale(d[glyphVar]));
  });
}

// eslint-disable-next-line  @typescript-eslint/no-explicit-any
export function startSimulation(this: any, simulation: Simulation<Node, Link>) {
  // Update the force radii
  simulation.force('collision',
    forceCollide()
      .radius(getForceRadius(this.nodeMarkerLength, this.nodeMarkerHeight, this.renderNested))
      .strength(0.7)
      .iterations(10));

  simulation.alpha(0.5);
  // simulation.alphaTarget(0.02).restart();
}

export function stopSimulation(network: Network, simulation: Simulation<Node, Link>) {
  simulation.stop();
  network.nodes.forEach((n: Node) => {
    n.savedX = n.x;
    n.savedY = n.y;
  });
}

export function releaseNodes(network: Network, simulation: Simulation<Node, Link>) {
  // Release the pinned nodes
  network.nodes.forEach((n: Node) => {
    n.fx = null;
    n.fy = null;
  });
  startSimulation(simulation);
}
