<script lang="ts">
import { formatShortDate } from '@/lib/utils';
import store from '@/store';
import {
  internalFieldNames, Edge, SlicedNetwork,
} from '@/types';
import {
  computed, defineComponent, Ref, ref, watch,
} from '@vue/composition-api';
import { scaleLinear, scaleTime } from 'd3-scale';

export default defineComponent({
  name: 'TimeSlicing',

  setup() {
    const showOptions = ref(false);
    const sliceRules = (value: string) => !Number.isNaN(parseFloat(value)) || 'Please type a number';
    const calMenu = ref([false, false]);
    const dateFormatted: Ref<string[]> = ref([]);

    const network = computed(() => store.state.network);
    const originalNetwork = computed(() => store.state.networkOnLoad);
    const edgeVariables = computed(() => store.state.edgeVariables);
    const columnTypes = computed(() => store.state.columnTypes);
    const startTimeVar = ref('');
    const endTimeVar = ref('');
    const timeSliceNumber = ref(1);
    const isDate = computed({
      get() {
        return store.state.isDate;
      },
      set(value: boolean) {
        return store.commit.setIsDate(value);
      },
    });

    function formatDate(date: Date) {
      const dateString = formatShortDate(date);
      const [month, day, year] = dateString.split('/');
      return `${year}-${month}-${day}`;
    }

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
      if (originalNetwork.value !== null) {
        // Loop through all edges, flatten the 2d array, and turn it into a set
        const allVars: Set<string> = new Set();
        originalNetwork.value.edges.map((edge: Edge) => Object.keys(edge).forEach((key) => allVars.add(key)));

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
      const range: Date[] | number[] | string[] = [];
      if (startTimeVar.value !== null && endTimeVar.value !== null && originalNetwork.value !== null) {
        // Loop through all edges, return min and max time values
        originalNetwork.value.edges.forEach((edge: Edge, i: number) => {
          // Check for dates
          let startTime: number | Date = edge[startTimeVar.value];
          let endTime: number | Date = edge[endTimeVar.value];
          if (isDate.value) {
            startTime = Date.parse(edge[startTimeVar.value]);
            endTime = Date.parse(edge[endTimeVar.value]);
          }
          if (i === 0) {
            range[0] = startTime;
            range[1] = endTime;
          }
          if (startTime < range[0]) {
            range[0] = startTime;
          }
          if (endTime > range[1]) {
            range[1] = endTime;
          }
        });
      }
      // Format date
      if (isDate) {
        dateFormatted.value = [formatDate(new Date(range[0])), formatDate(new Date(range[1]))];
      }
      return range;
    });

    watch([dateFormatted], () => {
      if (isDate.value) {
        timeRange.value[0] = new Date(dateFormatted.value[0]);
        timeRange.value[1] = new Date(dateFormatted.value[1]);
      }
    });

    function sliceNetwork() {
      // Resets to original network view when time slice is 1
      if (originalNetwork.value !== null && timeSliceNumber.value === 1) {
        store.commit.setSlicedNetwork([]);
        store.commit.setNetwork(originalNetwork.value);
      }
      // Generates sliced networks based on time slices
      if (originalNetwork.value !== null && timeSliceNumber.value !== 1) {
        const slicedNetwork: SlicedNetwork[] = [];
        const slicedRange = [];
        if (isDate.value) {
          slicedRange[0] = new Date(timeRange.value[0]).getTime();
          slicedRange[1] = new Date(timeRange.value[1]).getTime();
        } else {
          slicedRange[0] = parseFloat(timeRange.value[0].toString());
          slicedRange[1] = parseFloat(timeRange.value[1].toString());
        }
        // Generate sliced network
        // eslint-disable-next-line no-plusplus
        for (let i = 0; i < timeSliceNumber.value; i++) {
          const currentSlice: SlicedNetwork = { slice: i + 1, time: [], network: { nodes: [], edges: [] } };
          if (isDate.value) {
            const timeIntervals = scaleTime().domain(slicedRange).range([0, timeSliceNumber.value]);
            currentSlice.time = [timeIntervals.invert(i), timeIntervals.invert(i + 1)];
            currentSlice.network.nodes = originalNetwork.value.nodes;
            originalNetwork.value.edges.forEach((edge: Edge) => {
              if (timeIntervals(new Date(edge[startTimeVar.value])) >= i && timeIntervals(new Date(edge[startTimeVar.value])) < i + 1) {
                currentSlice.network.edges.push(edge);
              }
            });
          } else {
            const timeIntervals = scaleLinear().domain(slicedRange).range([0, timeSliceNumber.value]);
            currentSlice.time = [timeIntervals.invert(i), timeIntervals.invert(i + 1)];
            currentSlice.network.nodes = originalNetwork.value.nodes;
            originalNetwork.value.edges.forEach((edge: Edge) => {
              if (timeIntervals(parseFloat(edge[startTimeVar.value])) >= i && timeIntervals(parseFloat(edge[startTimeVar.value])) < i + 1) {
                currentSlice.network.edges.push(edge);
              }
            });
          }
          slicedNetwork.push(currentSlice);
        }
        store.commit.setSlicedNetwork(slicedNetwork);
        store.commit.setNetwork(slicedNetwork[0].network);
      }
    }

    function exportEdges() {
      if (network.value === null) {
        return;
      }
      // Slice network in case 'Generate Slices' button
      // not clicked or updated
      sliceNetwork();
      const { slicedNetwork } = store.state;

      // Generate edge table data
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const edges: any[] = [];
      slicedNetwork.forEach((slice) => {
        const timeObj = { slice: slice.slice, timeStart: slice.time[0], timeFinish: slice.time[1] };
        slice.network.edges.forEach((edge) => {
          const rowObj = { ...edge, ...timeObj };
          edges.push(rowObj);
        });
      });

      // Formate edge data for CSV
      const separator = ',';
      const keys = Object.keys(edges[0]);
      const edgeTable = `${keys.join(separator)
      }\n${
        edges.map((edge) => keys.map((k) => {
          let cell = edge[k] === null || edge[k] === undefined ? '' : edge[k];
          cell = cell instanceof Date
            ? cell.toLocaleString()
            : cell.toString().replace(/"/g, '""');
          if (cell.search(/("|,|\n)/g) >= 0) {
            cell = `"${cell}"`;
          }
          return cell;
        }).join(separator)).join('\n')}`;

      const a = document.createElement('a');
      a.href = URL.createObjectURL(
        new Blob([edgeTable], {
          type: 'text/csv',
        }),
      );
      a.download = `${store.state.networkName}_${timeSliceNumber.value}-slices.csv`;
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
      exportEdges,
      timeRange,
      isDate,
      calMenu,
      dateFormatted,
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
          <v-icon color="blue">
            mdi-numeric-1-circle
          </v-icon>
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
          <v-icon color="blue">
            mdi-numeric-2-circle
          </v-icon>
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
          <v-checkbox
            v-model="isDate"
            label="Date format"
          />
        </v-list-item>
        <!-- Date Picker -->
        <v-list-item v-if="isDate">
          <v-menu
            :ref="calMenu[0]"
            v-model="calMenu[0]"
            :close-on-content-click="false"
            transition="scale-transition"
            offset-y
            max-width="290px"
            min-width="auto"
          >
            <template #activator="{ on, attrs }">
              <v-text-field
                v-model="dateFormatted[0]"
                label="Start Date"
                hint="YYYY-MM-DD"
                persistent-hint
                prepend-icon="mdi-calendar"
                v-bind="attrs"
                v-on="on"
              />
            </template>
            <v-date-picker
              v-model="dateFormatted[0]"
              no-title
              @input="calMenu[0] = false"
            />
          </v-menu>
          <v-menu
            :ref="calMenu[1]"
            v-model="calMenu[1]"
            :close-on-content-click="false"
            transition="scale-transition"
            offset-y
            max-width="290px"
            min-width="auto"
          >
            <template #activator="{ on, attrs }">
              <v-text-field
                v-model="dateFormatted[1]"
                label="End Date"
                hint="YYYY-MM-DD"
                persistent-hint
                prepend-icon="mdi-calendar"
                v-bind="attrs"
                v-on="on"
              />
            </template>
            <v-date-picker
              v-model="dateFormatted[1]"
              no-title
              @input="calMenu[1] = false"
            />
          </v-menu>
        </v-list-item>
        <!-- Numeric Picker -->
        <v-list-item v-else>
          <v-icon color="blue">
            mdi-numeric-3-circle
          </v-icon>
          <v-col>
            <v-text-field
              v-model="timeRange[0]"
              label="Min"
              outlined
            />
          </v-col>
          <v-col>
            <v-text-field
              v-model="timeRange[1]"
              label="Max"
              outlined
            />
          </v-col>
        </v-list-item>
        <v-list-item>
          <v-icon color="blue">
            mdi-numeric-4-circle
          </v-icon>
          <v-text-field
            v-model="timeSliceNumber"
            label="Time Slices"
            :rules="[sliceRules]"
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
                @click="exportEdges"
              >
                Export Edge Table
              </v-btn>
            </v-col>
          </v-row>
        </v-list-item>
      </v-card>
    </v-list>
  </div>
</template>
