export interface PlanFeatures { [k: string]: any }
export const DEFAULT_FEATURES: any = {};
const F: any = { restaurant: true, tables: true, table_orders: true, restaurant_menu_recipes: true, modifiers: true, mesa_digital: true };
export const useAuth = () => ({ user: { id: 'u1', email: 'a@b.cr' }, planFeatures: F, loading: false, hasFeature: (k: string) => !!F[k] });
export default useAuth;
