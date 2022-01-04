<script lang="ts">
import store from '@/store';
import { internalFieldNames, Edge, Node } from '@/types';
import { computed, defineComponent, ref } from '@vue/composition-api';

export default defineComponent({
  setup() {
    const showOptions = ref(false);
    // TODO: https://github.com/multinet-app/multidynamic/issues/1
    // Fix slice rules to check for type and show hints
    const sliceRules = [
      (value: number) => !!value || 'Required.',
      (value: number) => (value && typeof value === 'number') || 'Please type a number',
    ];

    const network = computed(() => store.state.network);
    const edgeVariables = computed(() => store.state.edgeVariables);
    const columnTypes = computed(() => store.state.columnTypes);
    const startTimeVar = ref('');
    const endTimeVar = ref('');
    const timeSliceNumber = ref(1);

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

    // Compute the min and max times
    const timeRange = computed(() => {
      const range: number[] = [0, 0];
      if (startTimeVar.value !== null && endTimeVar.value !== null && network.value !== null) {
        // Loop through all edges, return min and max time values
        network.value.edges.forEach((edge: Edge) => {
          if (edge[startTimeVar.value] < range[0]) {
            range[0] = edge[startTimeVar.value];
          }
          if (edge[endTimeVar.value] > range[1]) {
            range[1] = edge[endTimeVar.value];
          }
        });
      }
      return range;
    });

    const timeMin = computed(() => timeRange.value[0]);
    const timeMax = computed(() => timeRange.value[1]);

    // TODO: https://github.com/multinet-app/multidynamic/issues/2
    // Add watch effect for time max?
    const selectedRange = ref(timeMax.value > 0 ? [timeMin.value, timeMax.value] : [0, 100]);

    function sliceNetwork() {
      let networkToReturn: { network: { edges: Edge[]; nodes: Node[]}; slice: number; time: number[] }[] = [];
      if (network.value !== null) {
        const slicedNetwork: { network: { edges: Edge[]; nodes: Node[]}; slice: number; time: number[] }[] = [];
        const timeInterval = (selectedRange.value[1] - selectedRange.value[0]) / timeSliceNumber.value;

        // Generate time chunks
        // eslint-disable-next-line no-plusplus
        for (let i = 0; i < timeSliceNumber.value; i++) {
          const currentSlice: { network: { edges: Edge[]; nodes: Node[]}; slice: number; time: number[] } = { slice: i, time: [0, 0], network: { nodes: [], edges: [] } };
          currentSlice.time = [i * timeInterval, (i + 1) * timeInterval];
          currentSlice.network.nodes = network.value.nodes;
          slicedNetwork.push(currentSlice);
        }

        // Generate sliced network
        let i = 0;
        network.value.edges.forEach((edge: Edge) => {
          if (edge[startTimeVar.value] >= slicedNetwork[i].time[0] && edge[startTimeVar.value] < slicedNetwork[i].time[1]) {
            slicedNetwork[i].network.edges.push(edge);
          } else if (i < timeSliceNumber.value) {
            i += 1;
            slicedNetwork[i].network.edges.push(edge);
          }
        });
        networkToReturn = slicedNetwork;

        return networkToReturn;
      }
      return networkToReturn;
    }

    function exportNetwork() {
      if (network.value === null) {
        return;
      }

      const networkToExport = sliceNetwork();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(
        new Blob([JSON.stringify(networkToExport)], {
          type: 'text/json',
        }),
      );
      a.download = `${store.state.networkName}_${timeSliceNumber.value}-slices.json`;
      a.click();
    }

    return {
      showOptions,
      sliceRules,
      edgeVariables,
      startTimeVar,
      endTimeVar,
      timeSliceNumber,
      cleanedEdgeVariables,
      sliceNetwork,
      exportNetwork,
      timeRange,
      timeMin,
      timeMax,
      selectedRange,
    };
  },
});
</script>

<template>
  <div id="timeslicing">
    <v-list class="pa-0">
      <v-subheader class="grey darken-3 py-0 pr-0 white--text">
        Time Slicing

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
        <v-list-item>
          <v-select
            v-model="startTimeVar"
            label="Start Time"
            :items="Array.from(cleanedEdgeVariables)"
            :hide-details="true"
            class="mt-3"
            clearable
            outlined
            dense
          />
        </v-list-item>
        <v-list-item>
          <v-select
            v-model="endTimeVar"
            label="End Time"
            :items="Array.from(cleanedEdgeVariables)"
            :hide-details="true"
            class="mt-3"
            clearable
            outlined
            dense
          />
        </v-list-item>
        <v-list-item>
          <v-range-slider
            v-model="selectedRange"
            dense
            hide-details
            :min="timeMin"
            :max="timeMax"
            thumb-label
          />
        </v-list-item>

        <v-list-item>
          <v-text-field
            v-model="timeSliceNumber"
            label="Time Slices"
            :rules="sliceRules"
            :hide-details="true"
            class="mt-3"
            clearable
            outlined
            dense
          />
        </v-list-item>

        <v-list-item>
          <v-row>
            <v-col>
              <v-btn
                color="primary"
                block
                depressed
                @click="sliceNetwork"
              >
                Generate Slices
              </v-btn>
            </v-col>
            <v-col>
              <v-btn
                color="primary"
                block
                depressed
                @click="exportNetwork"
              >
                Export Network
              </v-btn>
            </v-col>
          </v-row>
        </v-list-item>
      </v-card>
    </v-list>
  </div>
</template>
