<script lang="ts">
import { select, selectAll } from 'd3-selection';
import store from '@/store';
import {
  computed, defineComponent, ref, Ref,
} from '@vue/composition-api';

export default defineComponent({
  setup() {
    const slicedNetwork = computed(() => store.state.slicedNetwork);
    const svg: Ref<Element | null> = ref(null);

    const currentTime = computed(() => {
      const times: { timeRanges: {[key: number]: number[]} ; current: number ; slices: number } = { timeRanges: {}, current: 0, slices: 0 };
      slicedNetwork.value.forEach((slice, i) => {
        times.timeRanges[i] = slice.time;
        times.slices = i + 1;
      });
      return times;
    });

    // Update height and width as the window size changes
    const svgDimensions = computed(() => store.state.svgDimensions);
    const timeRangesLength = computed(() => currentTime.value.slices);

    // Tooltip
    const tooltipMessage = ref('');
    const toggleTooltip = ref(false);
    const tooltipPosition = ref({ x: 0, y: 0 });
    const tooltipStyle = computed(() => `left: ${tooltipPosition.value.x}px; top: ${tooltipPosition.value.y}px; white-space: pre-line;`);
    const controlsWidth = computed(() => store.state.controlsWidth);

    function showTooltip(slice: number[], key: number, event: MouseEvent) {
      tooltipPosition.value = {
        x: event.clientX - controlsWidth.value,
        y: event.clientY + 20,
      };

      tooltipMessage.value = `Slice: ${key}
      Time: ${Math.floor(slice[0])} - ${Math.floor(slice[1])}`;
      toggleTooltip.value = true;
    }

    function hideTooltip() {
      tooltipMessage.value = '';
      toggleTooltip.value = false;
    }

    // Update time slice view and network
    function updateTime(selection: number) {
      currentTime.value.current = selection;
      selectAll('.timelineRectClass').classed('selected', false);
      select(`#timeSlice_${selection}`).classed('selected', true);
    }

    return {
      svg,
      svgDimensions,
      currentTime,
      timeRangesLength,
      showTooltip,
      hideTooltip,
      tooltipStyle,
      toggleTooltip,
      tooltipMessage,
      updateTime,
    };
  },
});
</script>

<template>
  <div>
    <h3>
      Time Slices
    </h3>
    <svg
      ref="svg"
      :width="svgDimensions.width"
      :height="50"
    >
      <g
        id="timeline"
      >
        <rect
          v-for="(slice, key, index) of currentTime.timeRanges"
          :id="`timeSlice_${key}`"
          :key="`timeSlice_${key}`"
          :class="currentTime.current === index ? 'timelineRectClass selected' : 'timelineRectClass'"
          :width="svgDimensions.width / timeRangesLength"
          :height="20"
          :y="0"
          :x="(svgDimensions.width / timeRangesLength) * index"
          @mouseover="showTooltip(slice, key, $event)"
          @mouseout="hideTooltip"
          @click="updateTime(key)"
        />
      </g>
    </svg>

    <div
      v-if="toggleTooltip"
      class="tooltip"
      :style="tooltipStyle"
    >
      {{ tooltipMessage }}
    </div>
  </div>
</template>

<style scoped>
.tooltip {
  position: absolute;
  background-color: white;

  font-size: 12.5px;
  color: #000;
  border-radius: 5px;
  padding: 5px;
  pointer-events: none;
  -webkit-box-shadow: 0 4px 8px 0 rgba(0,0,0,.2);
  box-shadow: 0 4px 8px 0 rgba(0,0,0,.2);
  max-width: 400px
}

.timelineRectClass {
  stroke: black;
  stroke-width: 1px;
  cursor: pointer;
  fill: lightgray
}

.selected {
  fill: #F8CF91;
  stroke-width: 1px;
}

</style>
