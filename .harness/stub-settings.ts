export const useSettings = (_t?: string) => ({
  settings: { tax_enabled: true, tax_rate: 13 },
  updateSettings: async () => {},
  loading: false,
});
export default useSettings;
