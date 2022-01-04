<script lang="ts">
import store from '@/store';
import { Node, Edge } from '@/types';
import {
  computed, defineComponent, onMounted, PropType,
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
    const chartHeight = 75;

    const network = computed(() => store.state.network);
    const columnTypes = computed(() => store.state.columnTypes);
    const nestedVariables = computed(() => store.state.nestedVariables);
    const nodeGlyphColorScale = computed(() => store.state.nodeGlyphColorScale);
    const edgeWidthScale = computed(() => store.getters.edgeWidthScale);
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

    function unAssignVar() {
      if (props.mappedTo === 'width') {
        store.commit.setEdgeVariables({
          width: '',
          color: store.state.edgeVariables.color,
        });
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
      if (props.mappedTo === 'width') {
        if (isQuantitative(props.varName, props.type)) {
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
        } else {
          const currentData = network.value.edges;

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

        // TODO: https://github.com/multinet-app/multidynamic/issues/3
        // Create density plot
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
          .range([chartHeight, 10]);

        variableSvg
          .selectAll('rect')
          .data(bins)
          .enter()
          .append('rect')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .attr('x', (d) => xScale(d.x0 as any) || 0)
          .attr('y', (d) => yScale(d.length))
          .attr('height', (d) => chartHeight - yScale(d.length))
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .attr('width', (d) => (xScale(d.x1 as any) || 0) - (xScale(d.x0 as any) || 0))
          .attr('fill', '#82B1FF');

        const boxPlotHeight = 100;
        const whiskersHeight = 20;
        const boxPlotSVG = variableSvg.append('g').attr('transform', `translate(${0}, ${chartHeight + 15})`).attr('id', 'boxPlot');

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
        // change so that you click the edge types
        let currentData: string[] = [];

        currentData = network.value.edges.map((d: Edge) => d[props.varName]).sort();

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
          .range([chartHeight, 0]);

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
          .attr('height', (d: string) => chartHeight - yScale(bins.get(d) || 0))
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
            .attr('transform', `translate(0, ${chartHeight})`)
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
        // brush labels
        const labelGroup = variableSvg.append('g');

        const labelL = labelGroup.append('text')
          .attr('id', 'labelleft')
          .attr('x', 0)
          .attr('y', svgHeight + 5)
          .attr('text-anchor', 'middle')
          .attr('fill', '#acacac');
        const labelR = labelGroup.append('text')
          .attr('id', 'labelright')
          .attr('x', 0)
          .attr('y', svgHeight + 5)
          .attr('text-anchor', 'middle')
          .attr('fill', '#acacac');
        const labelB = labelGroup.append('text')
          .attr('id', 'labelbottom')
          .attr('x', 0)
          .attr('y', svgHeight + 5)
          .attr('text-anchor', 'middle')
          .attr('fill', '#acacac');

        // eslint-disable-next-line @typescript-eslint/no-explicit-any, no-inner-declarations
        function brushResizePath(d: any) {
          const e = +(d.type === 'e');
          const x = e ? 1 : -1;
          const y = svgHeight / 2;
          return `M${0.5 * x},${y}A6,6 0 0 ${e} ${6.5 * x},${y + 6}V${2 * y - 6
          // eslint-disable-next-line no-useless-concat
          }A6,6 0 0 ${e} ${0.5 * x},${2 * y}Z` + `M${2.5 * x},${y + 8}V${2 * y - 8
          }M${4.5 * x},${y + 8}V${2 * y - 8}`;
        }

        // create brush
        const brush = brushX()
          .extent([[yAxisPadding, 0], [variableSvgWidth, svgHeight - 10]])
          .on('brush', (event: unknown) => {
            const brushEvent = event as D3BrushEvent<unknown>;
            const extent = brushEvent.selection as [number, number];

            if (extent === null) {
              return;
            }

            const currentAttributeRange = attributeRanges.value[props.varName];

            if (isQuantitative(props.varName, props.type)) {
              const newMin = (((extent[0] - yAxisPadding) / (variableSvgWidth - yAxisPadding)) * (currentAttributeRange.max - currentAttributeRange.min)) + currentAttributeRange.min;
              const newMax = (((extent[1] - yAxisPadding) / (variableSvgWidth - yAxisPadding)) * (currentAttributeRange.max - currentAttributeRange.min)) + currentAttributeRange.min;

              // update and move labels
              labelL.attr('x', extent[0])
                .text(newMin.toFixed(2));
              labelR.attr('x', extent[1])
                .text(newMax.toFixed(2));
              // move brush handles
              const handle = selectAll('.handle--custom');
              handle.attr('display', null).attr('transform', (d, i) => `translate(${[extent[i], -svgHeight / 4]})`);
            } else {
              const firstIndex = Math.floor(((extent[0] - yAxisPadding) / (variableSvgWidth - yAxisPadding)) * attributeRanges.value[props.varName].binLabels.length);
              const secondIndex = Math.ceil(((extent[1] - yAxisPadding) / (variableSvgWidth - yAxisPadding)) * attributeRanges.value[props.varName].binLabels.length);
              const currentBinLabels = currentAttributeRange.binLabels.slice(firstIndex, secondIndex);

              // update and move labels
              labelB.attr('x', variableSvgWidth / 2)
                .text(`Selection: ${currentBinLabels.length}`);
              // move brush handles
              const handle = selectAll('.handle--custom');
              handle.attr('display', null).attr('transform', (d, i) => `translate(${[extent[i], -svgHeight / 4]})`);
            }
          })
          .on('end', (event: unknown) => {
            const brushEvent = event as D3BrushEvent<unknown>;
            const extent = brushEvent.selection as [number, number];

            if (extent === null) {
              return;
            }

            const currentAttributeRange = attributeRanges.value[props.varName];

            if (!isQuantitative(props.varName, props.type)) {
              const firstIndex = Math.floor(((extent[0] - yAxisPadding) / (variableSvgWidth - yAxisPadding)) * attributeRanges.value[props.varName].binLabels.length);
              const secondIndex = Math.ceil(((extent[1] - yAxisPadding) / (variableSvgWidth - yAxisPadding)) * attributeRanges.value[props.varName].binLabels.length);

              store.commit.addAttributeRange({
                ...currentAttributeRange,
                currentBinLabels: currentAttributeRange.binLabels.slice(firstIndex, secondIndex),
                currentBinValues: currentAttributeRange.binValues.slice(firstIndex, secondIndex),
              });
            } else if (isQuantitative(props.varName, props.type)) {
              const newMin = (((extent[0] - yAxisPadding) / (variableSvgWidth - yAxisPadding)) * (currentAttributeRange.max - currentAttributeRange.min)) + currentAttributeRange.min;
              const newMax = (((extent[1] - yAxisPadding) / (variableSvgWidth - yAxisPadding)) * (currentAttributeRange.max - currentAttributeRange.min)) + currentAttributeRange.min;

              store.commit.addAttributeRange({ ...currentAttributeRange, currentMax: newMax, currentMin: newMin });
            }
          });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const gBrush = (variableSvg as any)
          .call(brush);

        gBrush.selectAll('.handle--custom')
          .data([{ type: 'w' }, { type: 'e' }])
          .enter().append('path')
          .attr('class', 'handle--custom')
          .attr('stroke', '#000')
          .attr('fill', '#eee')
          .attr('cursor', 'ew-resize')
          .attr('d', brushResizePath);

        // start with the whole network brushed
        gBrush.call(brush.move, [yAxisPadding, variableSvgWidth]);
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
