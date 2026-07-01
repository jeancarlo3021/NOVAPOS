import { CR_PROVINCES, cantonsOf, districtsOf } from '@/data/crLocations';

/**
 * Selects en cascada de Provincia → Cantón (con sus códigos de Hacienda) +
 * input de Distrito. Al elegir provincia/cantón se setea el código numérico.
 */
export function CRLocationFields({
  province, canton, district, onChange, compact,
}: {
  province: string;
  canton: string;
  district: string;
  onChange: (field: 'province' | 'canton' | 'district', value: string) => void;
  compact?: boolean;
}) {
  const cantons = cantonsOf(province);
  const districts = districtsOf(province, canton);
  const label = 'block text-xs font-bold text-gray-600 mb-1';
  const input = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white';

  return (
    <div className={`grid grid-cols-3 gap-2 ${compact ? '' : ''}`}>
      <div>
        <label className={label}>Provincia</label>
        <select value={province}
          onChange={e => { onChange('province', e.target.value); onChange('canton', ''); onChange('district', ''); }}
          className={input}>
          <option value="">—</option>
          {CR_PROVINCES.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
        </select>
      </div>
      <div>
        <label className={label}>Cantón</label>
        <select value={canton} disabled={!province}
          onChange={e => { onChange('canton', e.target.value); onChange('district', ''); }}
          className={`${input} disabled:bg-gray-100`}>
          <option value="">—</option>
          {cantons.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className={label}>Distrito</label>
        <select value={district} disabled={!canton}
          onChange={e => onChange('district', e.target.value)}
          className={`${input} disabled:bg-gray-100`}>
          <option value="">—</option>
          {districts.map(d => <option key={d.code} value={d.code}>{d.name}</option>)}
        </select>
      </div>
    </div>
  );
}

export default CRLocationFields;
