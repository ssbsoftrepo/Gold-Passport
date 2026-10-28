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

/** Screens see a good connection; tests of offline behaviour drive the listeners instead. */
export function useNetInfo(): State & { type: string } {
  return { isConnected: true, isInternetReachable: true, type: "wifi" };
}

export function emitNetworkChange(state: State) {
  listeners.forEach((l) => l(state));
}
