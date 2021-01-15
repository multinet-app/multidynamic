import { ProvenanceEventTypes, State } from '@/types';
import { createAction } from '@visdesignlab/trrack';

export function updateProvenanceState(vuexState: State, label: ProvenanceEventTypes) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stateUpdateActions = createAction<State, any[], ProvenanceEventTypes>((provState, newProvState) => {
    if (label === 'Select Node' || label === 'De-select Node') {
      // TODO: #148 remove cast back to set
      // eslint-disable-next-line no-param-reassign, @typescript-eslint/no-explicit-any
      provState.selectedNodes = [...newProvState.selectedNodes] as any;
    }

    if (label === 'Set Display Charts') {
      // eslint-disable-next-line no-param-reassign
      provState.displayCharts = newProvState.displayCharts;
    }

    if (label === 'Set Marker Size') {
      // eslint-disable-next-line no-param-reassign
      provState.markerSize = newProvState.markerSize;
    }

    if (label === 'Set Font Size') {
      // eslint-disable-next-line no-param-reassign
      provState.fontSize = newProvState.fontSize;
    }

    if (label === 'Set Label Variable') {
      // eslint-disable-next-line no-param-reassign
      provState.labelVariable = newProvState.labelVariable;
    }

    if (label === 'Set Color Variable') {
      // eslint-disable-next-line no-param-reassign
      provState.colorVariable = newProvState.colorVariable;
    }

    if (label === 'Set Select Neighbors') {
      // eslint-disable-next-line no-param-reassign
      provState.selectNeighbors = newProvState.selectNeighbors;
    }
  })
    .setLabel(label);

  if (vuexState.provenance !== null) {
    vuexState.provenance.apply(stateUpdateActions(vuexState));
  }
}
