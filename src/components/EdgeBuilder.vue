<script lang="ts">
import store from '@/store';
import { internalFieldNames, Edge } from '@/types';
import DragTarget from '@/components/DragTarget.vue';
import { computed, defineComponent, ref } from '@vue/composition-api';
import EdgeBuilderChart from '@/components/EdgeBuilderChart.vue';
import LegendChart from '@/components/LegendChart.vue';

export default defineComponent({
  components: {
    DragTarget,
    EdgeBuilderChart,
    LegendChart,
  },

  setup() {
    const showOptions = ref(false);
    const network = computed(() => store.state.network);
    const nestedVariables = computed(() => store.state.nestedVariables);
    const edgeVariables = computed(() => store.state.edgeVariables);

    const columnTypes = computed(() => store.state.columnTypes);

    function cleanVariableList(list: Set<string>): Set<string> {
      const cleanedVariables = new Set<string>();

      list.forEach((variable) => {
        if (columnTypes.value !== null && columnTypes.value[variable] !== 'label') {
          cleanedVariables.add(variable);
        }
      });

      return cleanedVariables;
    }

    const cleanedEdgeVariables = computed(() => {
      if (network.value !== null) {
        // Loop through all edges, flatten the 2d array, and turn it into a set
        const allVars: Set<string> = new Set();
        network.value.edges.map((edge: Edge) => Object.keys(edge).forEach((key) => allVars.add(key)));

        internalFieldNames.forEach((field) => allVars.delete(field));
        allVars.delete('source');
        allVars.delete('target');
        allVars.delete('index');

        return cleanVariableList(allVars);
      }
      return new Set();
    });

    const displayCharts = computed(() => store.state.displayCharts);

    return {
      showOptions,
      edgeVariables,
      cleanedEdgeVariables,
      displayCharts,
      nestedVariables,
    };
  },
});
</script>

<template>
  <div id="edgebuilder">
    <v-list class="pa-0">
      <v-subheader class="grey darken-3 py-0 pr-0 white--text">
        Build Edges

        <v-spacer />

        <v-btn
          :min-width="40"
          :height="48"
          depressed
          tile
          :class="showOptions? `grey darken-2 pa-0` : `grey darken-3 pa-0`"
          @click="showOptions = !showOptions"
        >
          <v-icon color="white">
            mdi-cog
          </v-icon>
        </v-btn>
      </v-subheader>

      <v-card
        v-if="showOptions"
        flat
        color="white"
        class="pb-4 pt-2"
      >
        <div class="sticky">
          <drag-target
            v-if="edgeVariables.width === ''"
            :title="'width'"
            :type="'edge'"
          />

          <edge-builder-chart
            v-else
            :var-name="edgeVariables.width"
            :type="'edge'"
            :selected="true"
            :mapped-to="'width'"
          />

          <v-divider />
        </div>

        <div v-if="cleanedEdgeVariables.size === 0">
          No edge attributes to visualize
        </div>

        <div
          v-for="edgeAttr of cleanedEdgeVariables"
          v-else
          :key="`edge${edgeAttr}`"
        >
          <legend-chart
            :var-name="edgeAttr"
            :type="'edge'"
            :selected="false"
          />
        </div>
      </v-card>
    </v-list>
  </div>
</template>

<style scoped>
.sticky {
  position: sticky;
  top: 0;
  z-index: 2;
  background-color: white;
}

.draggable {
  cursor: pointer;
}
</style>
