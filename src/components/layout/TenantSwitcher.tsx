import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { Building2 } from 'lucide-react';

export const TenantSwitcher: React.FC = () => {
  const { tenant, tenants, switchTenant } = useAuth();

  if (tenants.length <= 1) return null;

  return (
    <div className="flex items-center gap-2">
      <Building2 className="w-4 h-4 text-gray-600" />
      <select
        value={tenant?.id || ''}
        onChange={(e) => switchTenant(e.target.value)}
        className="text-sm px-3 py-1 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
      >
        {tenants.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} {t.is_demo ? '(DEMO)' : ''}
          </option>
        ))}
      </select>
    </div>
  );
};
