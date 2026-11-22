/** Stand-in for @react-native-community/netinfo whose connectivity changes tests trigger. */

type State = { isConnected: boolean | null; isInternetReachable: boolean | null };
type Listener = (state: State) => void;

const listeners = new Set<Listener>();

const NetInfo = {
  addEventListener(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  fetch: async (): Promise<State> => ({ isConnected: true, isInternetReachable: true }),
};

export default NetInfo;

export function emitNetworkChange(state: State) {
  listeners.forEach((l) => l(state));
}
