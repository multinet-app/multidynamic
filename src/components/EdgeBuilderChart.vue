<script lang="ts">
import store from '@/store';
import { Node, Edge } from '@/types';
import {
  computed, defineComponent, onMounted, PropType, watchEffect,
} from '@vue/composition-api';
import {
  histogram, max, min, mean, median, quantile,
} from 'd3-array';
import { axisBottom, axisLeft } from 'd3-axis';
import { brushX, D3BrushEvent } from 'd3-brush';
import {
  ScaleBand, scaleBand, ScaleLinear, scaleLinear,
} from 'd3-scale';
import { select, selectAll } from 'd3-selection';

export default defineComponent({
  name: 'EdgeBuilderChart',

  props: {
    varName: {
      type: String,
      required: true,
    },
    type: {
      type: String as PropType<'node' | 'edge'>,
      required: true,
    },
    selected: {
      type: Boolean,
      required: true,
    },
    brushable: {
      type: Boolean,
      default: false,
    },
    mappedTo: {
      type: String,
      default: '',
    },
    filter: {
      type: String,
      default: '',
    },
  },

  setup(props) {
    const yAxisPadding = 30;
    const svgHeight = props.brushable === true ? 200 : 50;
    const histogramHeight = 75;

    const network = computed(() => store.state.network);
    const columnTypes = computed(() => store.state.columnTypes);
    const nestedVariables = computed(() => store.state.nestedVariables);
    const nodeColorScale = computed(() => store.getters.nodeColorScale);
    const nodeBarColorScale = computed(() => store.state.nodeBarColorScale);
    const nodeGlyphColorScale = computed(() => store.state.nodeGlyphColorScale);
    const edgeWidthScale = computed(() => store.getters.edgeWidthScale);
    const edgeColorScale = computed(() => store.getters.edgeColorScale);
    const attributeRanges = computed(() => store.state.attributeRanges);

    // TODO: https://github.com/multinet-app/multilink/issues/176
    // use table name for var selection
    function isQuantitative(varName: string, type: 'node' | 'edge') {
      if (columnTypes.value !== null && Object.keys(columnTypes.value).length > 0) {
        return columnTypes.value[varName] === 'number';
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let nodesOrEdges: any[];

      if (network.value !== null) {
        nodesOrEdges = type === 'node' ? network.value.nodes : network.value.edges;
        const uniqueValues = [...new Set(nodesOrEdges.map((element) => parseFloat(element[varName])))];
        return uniqueValues.length > 5;
      }
      return false;
    }

    function dragStart(event: DragEvent) {
      if (event.dataTransfer !== null && event.target !== null) {
        event.dataTransfer.setData('attr_id', (event.target as Element).id);
      }
    }

    function unAssignVar(variable?: string) {
      if (props.type === 'node') {
        if (props.mappedTo === 'size') {
          store.commit.setNodeSizeVariable('');
        } else if (props.mappedTo === 'color') {
          store.commit.setNodeColorVariable('');
        } else if (props.mappedTo === 'bars') {
          const newBarVars = nestedVariables.value.bar.filter(
            (barVar) => barVar !== variable,
          );

          store.commit.setNestedVariables({
            bar: newBarVars,
            glyph: nestedVariables.value.glyph,
          });
        } else if (props.mappedTo === 'glyphs') {
          const newGlyphVars = nestedVariables.value.glyph.filter(
            (glyphVar) => glyphVar !== props.varName,
          );

          store.commit.setNestedVariables({
            bar: nestedVariables.value.bar,
            glyph: newGlyphVars,
          });
        }
      } else if (props.type === 'edge') {
        if (props.mappedTo === 'width') {
          store.commit.setEdgeVariables({
            width: '',
            color: store.state.edgeVariables.color,
          });
        } else if (props.mappedTo === 'color') {
          store.commit.setEdgeVariables({
            width: store.state.edgeVariables.width,
            color: '',
          });
        }
      }
    }

    onMounted(() => {
      const variableSvg = select(`#${props.type}${props.varName}${props.mappedTo}`);

      let variableSvgWidth = (variableSvg
        .node() as Element)
        .getBoundingClientRect()
        .width - yAxisPadding;

      variableSvgWidth = variableSvgWidth < 0 ? 256 : variableSvgWidth;

      let xScale: ScaleLinear<number, number> | ScaleBand<string>;
      let yScale: ScaleLinear<number, number>;

      if (network.value === null) {
        return;
      }

      // Process data for bars/histogram
      if (props.mappedTo === 'width') { // edge width
        yScale = scaleLinear()
          .domain(edgeWidthScale.value.domain())
          .range([svgHeight, 10]);

        const minValue = edgeWidthScale.value.range()[0];
        const maxValue = edgeWidthScale.value.range()[1];
        const middleValue = (edgeWidthScale.value.range()[1] + edgeWidthScale.value.range()[0]) / 2;

        // Draw width lines
        variableSvg
          .append('rect')
          .attr('height', maxValue)
          .attr('width', variableSvgWidth)
          .attr('x', yAxisPadding)
          .attr('y', 0)
          .attr('fill', '#888888');

        variableSvg
          .append('rect')
          .attr('height', middleValue)
          .attr('width', variableSvgWidth)
          .attr('x', yAxisPadding)
          .attr('y', svgHeight / 2)
          .attr('fill', '#888888');

        variableSvg
          .append('rect')
          .attr('height', minValue + 2)
          .attr('width', variableSvgWidth)
          .attr('x', yAxisPadding)
          .attr('y', svgHeight - 1)
          .attr('fill', '#888888');
      } else if (props.mappedTo === 'color') { // node color and edge color
        if (isQuantitative(props.varName, props.type)) {
          // Gradient
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let scale: any;

          if (props.type === 'node') {
            xScale = scaleLinear()
              .domain(nodeColorScale.value.domain() as number[])
              .range([yAxisPadding, variableSvgWidth]);

            scale = nodeColorScale.value;
          } else {
            xScale = scaleLinear()
              .domain(edgeColorScale.value.domain() as number[])
              .range([yAxisPadding, variableSvgWidth]);

            scale = edgeColorScale.value;
          }

          const minColor = scale(scale.domain()[0]);
          const midColor = scale((scale.domain()[0] + scale.domain()[1]) / 2);
          const maxColor = scale(scale.domain()[1]);

          const gradient = variableSvg
            .append('defs')
            .append('linearGradient')
            .attr('id', 'grad');

          gradient
            .append('stop')
            .attr('offset', '0%')
            .attr('stop-color', minColor);

          gradient
            .append('stop')
            .attr('offset', '50%')
            .attr('stop-color', midColor);

          gradient
            .append('stop')
            .attr('offset', '100%')
            .attr('stop-color', maxColor);

          variableSvg
            .append('rect')
            .attr('height', 20)
            .attr('width', (xScale.range()[1] || 0) - (xScale.range()[0] || 0))
            .attr('x', xScale.range()[0] || 0)
            .attr('y', 20)
            .attr('fill', 'url(#grad)')
            .style('opacity', 0.7);
        } else {
          const currentData = props.type === 'node' ? network.value.nodes : network.value.edges;

          // Swatches
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const binLabels: string[] = [...new Set<string>((currentData as any).map((d: Node | Edge) => d[props.varName]))];

          xScale = scaleBand()
            .domain(binLabels)
            .range([yAxisPadding, variableSvgWidth]);

          // Draw swatches
          const swatchWidth = (variableSvgWidth - yAxisPadding) / binLabels.length;

          variableSvg
            .selectAll('rect')
            .data(binLabels)
            .enter()
            .append('rect')
            .attr('height', 15)
            .attr('width', swatchWidth)
            .attr('x', (d, i) => (swatchWidth * i) + yAxisPadding)
            .attr('y', 25)
            .attr('fill', (d) => nodeGlyphColorScale.value(d))
            .classed('swatch', true);
        }
      } else if (props.mappedTo === 'bars') { // nested bars
        watchEffect(() => {
          selectAll('.legend-bars').remove();

          // Draw bars
          nestedVariables.value.bar.forEach((barVar, index) => {
            // Bar backgrounds
            variableSvg
              .append('rect')
              .attr('fill', '#EEEEEE')
              .attr('height', 50)
              .attr('width', 20)
              .attr('x', 50 * (index) + 25)
              .attr('y', 10)
              .classed('legend-bars', true);

            // Main bar
            const barHeight = 10 + (Math.random() * 40);
            variableSvg
              .append('rect')
              .attr('fill', nodeBarColorScale.value(barVar))
              .attr('height', barHeight)
              .attr('width', 20)
              .attr('x', 50 * (index) + 25)
              .attr('y', 60 - barHeight)
              .classed('legend-bars', true);

            // Label
            variableSvg
              .append('foreignObject')
              .attr('height', 20)
              .attr('width', 30)
              .attr('x', 50 * (index) + 15)
              .attr('y', 60)
              .classed('legend-bars', true)
              .append('xhtml:p')
              .attr('title', barVar)
              .text(barVar);

            // Axis
            const barScale = scaleLinear()
              .domain([attributeRanges.value[barVar].min, attributeRanges.value[barVar].max])
              .range([59, 10]);

            variableSvg
              .append('g')
              .classed('legend-bars', true)
              .attr('transform', `translate(${50 * (index) + 23},0)`)
              .call(axisLeft(barScale).ticks(4, 's'))
              .call((g) => g.select('path').remove());
          });
        });
      } else if (isQuantitative(props.varName, props.type)) { // main numeric legend charts
        // WIP
        let currentData: number[] = [];
        // current data is all the values for the edges
        currentData = network.value.edges.map((d: Node | Edge) => parseFloat(d[props.varName]));

        xScale = scaleLinear()
          .domain([Math.min(...currentData), Math.max(...currentData) + 1])
          .range([yAxisPadding, variableSvgWidth]);

        // Generate stats
        const summaryStats = {
          q1: 0, min: 0, median: 0, mean: 0, q3: 0, max: 0,
        };

        summaryStats.min = min(currentData) as number;
        summaryStats.max = max(currentData) as number;
        summaryStats.mean = mean(currentData) as number;
        summaryStats.median = median(currentData) as number;
        summaryStats.q3 = quantile(currentData, 0.75) as number;
        summaryStats.q1 = quantile(currentData, 0.25) as number;

        // TODO Create density plot
        const binGenerator = histogram()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .domain((xScale as any).domain()) // then the domain of the graphic
          .thresholds(xScale.ticks(50)); // then the numbers of bins

        const bins = binGenerator(currentData);

        store.commit.addAttributeRange({
          attr: props.varName,
          min: xScale.domain()[0] || 0,
          max: xScale.domain()[1] || 0,
          binLabels: xScale.domain().map((label) => label.toString()),
          binValues: xScale.range(),
        });

        yScale = scaleLinear()
          .domain([0, max(bins, (d) => d.length) || 0])
          .range([histogramHeight, 10]);

        variableSvg
          .selectAll('rect')
          .data(bins)
          .enter()
          .append('rect')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .attr('x', (d) => xScale(d.x0 as any) || 0)
          .attr('y', (d) => yScale(d.length))
          .attr('height', (d) => histogramHeight - yScale(d.length))
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .attr('width', (d) => (xScale(d.x1 as any) || 0) - (xScale(d.x0 as any) || 0))
          .attr('fill', '#82B1FF');

        const boxPlotHeight = 100;
        const whiskersHeight = 20;
        const boxPlotSVG = variableSvg.append('g').attr('transform', `translate(${0}, ${histogramHeight + 15})`).attr('id', 'boxPlot');

        const whiskerLineGrps = boxPlotSVG
          .selectAll('.whiskers')
          .data([summaryStats.min, summaryStats.max])
          .enter().append('g')
          .attr('class', 'whiskers')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .attr('transform', (d) => `translate(${xScale(d as any) || 0},${boxPlotHeight / 2 - whiskersHeight / 2})`);

        whiskerLineGrps.append('line')
          .attr('x2', 0)
          .attr('y2', () => whiskersHeight)
          .attr('fill', 'none')
          .attr('stroke', '#acacac')
          .attr('stroke-width', 1);

        whiskerLineGrps.append('text')
          .attr('x', 0)
          .attr('y', whiskersHeight + 16)
          .attr('text-anchor', (d, i) => (i === 0 ? 'start' : 'end'))
          .text((d) => Math.floor(d))
          .attr('fill', '#acacac');

        // Horizontal Line
        boxPlotSVG.append('line')
          .attr('x1', xScale(summaryStats.min))
          .attr('y1', boxPlotHeight / 2)
          .attr('x2', xScale(summaryStats.max))
          .attr('y2', boxPlotHeight / 2)
          .attr('fill', 'none')
          .attr('stroke', '#acacac')
          .attr('stroke-width', 1);

        // Rectangle
        boxPlotSVG.append('g').append('rect')
          .attr('width', xScale(summaryStats.q3) - xScale(summaryStats.q1))
          .attr('height', whiskersHeight)
          .attr('x', xScale(summaryStats.q1))
          .attr('y', boxPlotHeight / 2 - whiskersHeight / 2)
          .attr('fill', '#f9f9f9')
          .attr('stroke', '#acacac')
          .attr('stroke-width', 1);

        // QuartileLine Groups
        const quartileLineGrps = boxPlotSVG.selectAll('.quartiles')
          .data([summaryStats.q1, summaryStats.mean, summaryStats.q3])
          .enter().append('g')
          .attr('class', 'quartiles')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .attr('transform', (d) => `translate(${xScale(d as any) || 0},${boxPlotHeight / 2 - whiskersHeight / 2})`);

        quartileLineGrps.append('line')
          .attr('x2', 0)
          .attr('y2', () => whiskersHeight)
          .attr('fill', 'none')
          .attr('stroke', '#acacac')
          .attr('stroke-width', 1);

        quartileLineGrps.append('text')
          .attr('x', 0)
          .attr('y', whiskersHeight + 16)
          .attr('text-anchor', 'middle')
          .text((d) => Math.floor(d))
          .attr('fill', '#acacac');
      } else { // main categorical legend charts
        let currentData: string[] = [];
        if (props.type === 'node') {
          currentData = network.value.nodes.map((d: Node | Edge) => d[props.varName]).sort();
        } else {
          currentData = network.value.edges.map((d: Node | Edge) => d[props.varName]).sort();
        }

        const bins = new Map([...new Set(currentData)].map(
          (x) => [x, currentData.filter((y) => y === x).length],
        ));

        const binLabels: string[] = Array.from(bins.keys());
        const binValues: number[] = Array.from(bins.values());

        store.commit.addAttributeRange({
          attr: props.varName,
          min: parseFloat(min(binLabels) || '0'),
          max: parseFloat(max(binLabels) || '0'),
          binLabels,
          binValues,
        });

        // Generate axis scales
        yScale = scaleLinear()
          .domain([min(binValues) || 0, max(binValues) || 0])
          .range([svgHeight, 0]);

        xScale = scaleBand()
          .domain(binLabels)
          .range([yAxisPadding, variableSvgWidth]);

        variableSvg
          .selectAll('rect')
          .data(currentData)
          .enter()
          .append('rect')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .attr('x', (d: string) => xScale(d as any) || 0)
          .attr('y', (d: string) => yScale(bins.get(d) || 0))
          .attr('height', (d: string) => svgHeight - yScale(bins.get(d) || 0))
          .attr('width', xScale.bandwidth())
          .attr('fill', (d: string) => nodeGlyphColorScale.value(d));
      }

      // Add the axis scales onto the chart
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      if (xScale! !== undefined) {
        if (props.brushable === false) {
          variableSvg
            .append('g')
            .attr('transform', `translate(0, ${svgHeight})`)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .call((axisBottom as any)(xScale).ticks(4, 's'))
            .call((g) => g.select('path').remove());
        } else {
          variableSvg
            .append('g')
            .attr('transform', `translate(0, ${histogramHeight})`)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .call((axisBottom as any)(xScale).ticks(4, 's'))
            .call((g) => g.select('path').remove());
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      if (yScale! !== undefined) {
        variableSvg
          .append('g')
          .attr('transform', `translate(${yAxisPadding},0)`)
          .call(axisLeft(yScale).ticks(3, 's'))
          .call((g) => g.select('path').remove());
      }

      // For the brushable charts for filtering add brushing
      if (props.brushable) {
        const brush = brushX()
          .extent([[yAxisPadding, 0], [variableSvgWidth, svgHeight]])
          .on('end', (event: unknown) => {
            const brushEvent = event as D3BrushEvent<unknown>;
            const extent = brushEvent.selection as [number, number];

            if (extent === null) {
              return;
            }

            const currentAttributeRange = attributeRanges.value[props.varName];

            if (
              (props.filter === 'glyphs' && props.type === 'node')
              || (props.filter === 'color' && !isQuantitative(props.varName, props.type))
            ) {
              const firstIndex = Math.floor(((extent[0] - yAxisPadding) / (variableSvgWidth - yAxisPadding)) * attributeRanges.value[props.varName].binLabels.length);
              const secondIndex = Math.ceil(((extent[1] - yAxisPadding) / (variableSvgWidth - yAxisPadding)) * attributeRanges.value[props.varName].binLabels.length);

              store.commit.addAttributeRange({
                ...currentAttributeRange,
                currentBinLabels: currentAttributeRange.binLabels.slice(firstIndex, secondIndex),
                currentBinValues: currentAttributeRange.binValues.slice(firstIndex, secondIndex),
              });
            } else if (
              (props.filter === 'size' && props.type === 'node')
              || (props.filter === 'color' && isQuantitative(props.varName, props.type))
              || (props.filter === 'width' && props.type === 'edge')
            ) {
              const newMin = (((extent[0] - yAxisPadding) / (variableSvgWidth - yAxisPadding)) * (currentAttributeRange.max - currentAttributeRange.min)) + currentAttributeRange.min;
              const newMax = (((extent[1] - yAxisPadding) / (variableSvgWidth - yAxisPadding)) * (currentAttributeRange.max - currentAttributeRange.min)) + currentAttributeRange.min;

              store.commit.addAttributeRange({ ...currentAttributeRange, currentMax: newMax, currentMin: newMin });
            }
          });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (variableSvg as any)
          .call(brush)
          // start with the whole network brushed
          .call(brush.move, [yAxisPadding, variableSvgWidth]);
      }
    });

    return {
      svgHeight,
      dragStart,
      unAssignVar,
      nestedVariables,
    };
  },
});
</script>

<template>
  <div
    class="pa-4 pb-0"
  >
    <div
      v-if="brushable"
    >
      <v-row class="px-4">
        <strong>Filter Edges</strong>
        <v-spacer />
        <v-icon small>
          mdi-information
        </v-icon>
      </v-row>
    </div>

    <div
      v-else-if="selected && mappedTo !== 'bars'"
    >
      <div>
        <v-row style="margin-right: 0; margin-left: 0;">
          {{ mappedTo }}:
          <strong
            class="pl-1 label"
            :title="varName"
          >{{ varName }}</strong>
          <v-icon
            small
            class="icon pt-0"
            :height="20"
            @click="unAssignVar"
          >
            mdi-close-circle
          </v-icon>

          <v-spacer />

          <v-menu
            absolute
            :position-x="256"
            eager
          >
            <template #activator="{ on, attrs }">
              <v-btn
                x-small
                depressed
                text
                tile
                max-width="20"
                class="pa-0 pl-1"
                v-bind="attrs"
                v-on="on"
              >
                <v-icon
                  :size="24"
                  class="icon pt-0"
                  color="primary"
                  dark
                >
                  mdi-chart-box
                </v-icon>
              </v-btn>
            </template>
            <v-card :width="300">
              <edge-builder-chart
                :var-name="varName"
                :selected="false"
                :brushable="true"
                :filter="mappedTo"
                :type="type"
                class="pb-4"
              />
            </v-card>
          </v-menu>
        </v-row>
      </div>
    </div>

    <svg
      :id="`${type}${varName}${mappedTo}`"
      :height="svgHeight + 20"
      width="100%"
      class="mt-2"
    />
  </div>
</template>

<style scoped>
.edge-builder-chart {
  border: 1px solid #BDBDBD;
  box-shadow: 0px 1px 6px rgba(0, 0, 0, 0.1);
}

.icon {
  height: 20px;
  padding-top: 6px;
  padding-right: 4px;
  margin-right: 0;
  float: right;
}

.label {
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
}

</style>
