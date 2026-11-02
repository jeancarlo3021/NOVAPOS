export interface PlanFeatures { [k: string]: any }
export const DEFAULT_FEATURES: any = {};
const F: any = { customer_portal: true, customer_prices: true };
export const useAuth = () => ({
  user: { id: 'u9', email: 'cajero@negocio.cr', role: 'cajero' },
  tenant: { id: 't-demo' },
  planFeatures: F, loading: false, hasFeature: (k: string) => !!F[k],
});
export default useAuth;
