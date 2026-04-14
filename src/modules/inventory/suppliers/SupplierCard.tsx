import React from 'react';
import { Edit2, Trash2, Mail, Phone, MapPin } from 'lucide-react';

interface Supplier {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  payment_terms: string;
}

interface SupplierCardProps {
  supplier: Supplier;
  onEdit: () => void;
  onDelete: () => void;
}

export const SupplierCard: React.FC<SupplierCardProps> = ({ supplier, onEdit, onDelete }) => {
  return (
    <div className="bg-white rounded-lg shadow p-4 hover:shadow-lg transition">
      <div className="flex justify-between items-start mb-3">
        <h3 className="text-lg font-semibold text-gray-900">{supplier.name}</h3>
        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded"
            title="Editar"
          >
            <Edit2 size={18} />
          </button>
          <button
            onClick={onDelete}
            className="p-2 text-red-600 hover:bg-red-50 rounded"
            title="Eliminar"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      <div className="space-y-2 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <Mail size={16} />
          <span>{supplier.email || 'N/A'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Phone size={16} />
          <span>{supplier.phone || 'N/A'}</span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin size={16} />
          <span>{supplier.city}, {supplier.country}</span>
        </div>
        <div className="pt-2 border-t">
          <p className="text-xs font-semibold text-gray-700">Términos de pago:</p>
          <p className="text-gray-600">{supplier.payment_terms || 'N/A'}</p>
        </div>
      </div>
    </div>
  );
};