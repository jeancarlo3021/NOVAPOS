export const supabase: any = { auth: {}, channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: () => {} };
export default supabase;
