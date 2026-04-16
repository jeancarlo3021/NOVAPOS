import React from 'react';
import { Edit2, Trash2, Mail, Phone, MapPin, Building2 } from 'lucide-react';
import { Card, CardContent, Badge } from '@/components/ui/uiComponents';

interface Supplier {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  payment_terms: string;
  contact_person?: string;
}

interface SupplierCardProps {
  supplier: Supplier;
  onEdit: () => void;
  onDelete: () => void;
}

export const SupplierCard: React.FC<SupplierCardProps> = ({ supplier, onEdit, onDelete }) => {
  return (
    <Card className="hover:shadow-lg transition-all duration-300 group">
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-100 to-blue-50 rounded-lg group-hover:from-blue-200 group-hover:to-blue-100 transition">
              <Building2 size={20} className="text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">{supplier.name}</h3>
              {supplier.contact_person && (
                <p className="text-xs text-gray-500 mt-1">Contacto: {supplier.contact_person}</p>
              )}
            </div>
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onEdit}
              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
              title="Editar"
            >
              <Edit2 size={18} />
            </button>
            <button
              onClick={onDelete}
              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
              title="Eliminar"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 mb-4" />

        {/* Contact Info */}
        <div className="space-y-3 mb-4">
          <div className="flex items-center gap-3 text-sm">
            <Mail size={16} className="text-gray-400 flex-shrink-0" />
            <a href={`mailto:${supplier.email}`} className="text-gray-600 hover:text-blue-600 transition truncate">
              {supplier.email || 'N/A'}
            </a>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Phone size={16} className="text-gray-400 flex-shrink-0" />
            <a href={`tel:${supplier.phone}`} className="text-gray-600 hover:text-blue-600 transition">
              {supplier.phone || 'N/A'}
            </a>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <MapPin size={16} className="text-gray-400 flex-shrink-0" />
            <span className="text-gray-600">{supplier.city}, {supplier.country}</span>
          </div>
        </div>

        {/* Payment Terms Badge */}
        {supplier.payment_terms && (
          <div className="pt-3 border-t border-gray-200">
            <p className="text-xs font-semibold text-gray-600 mb-2">TÉRMINOS DE PAGO</p>
            <Badge className="bg-purple-100 text-purple-700 text-xs">
              {supplier.payment_terms}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
};