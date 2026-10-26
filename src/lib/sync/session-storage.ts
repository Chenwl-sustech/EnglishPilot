export interface SecureSessionTransport {
  get(input: { key: string }): Promise<{ value: string | null }>;
  set(input: { key: string; value: string }): Promise<unknown>;
  remove(input: { key: string }): Promise<unknown>;
}
export function createSessionStorage(transport: SecureSessionTransport) {
  return {
    getItem: async (key: string): Promise<string | null> =>
      (await transport.get({ key })).value,
    setItem: async (key: string, value: string): Promise<void> => {
      await transport.set({ key, value });
    },
    removeItem: async (key: string): Promise<void> => {
      await transport.remove({ key });
    },
  };
}
