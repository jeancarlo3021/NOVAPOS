import React from 'react';
import { Input, Button } from '@/components/ui/uiComponents';

interface ProductInputsProps {
  formData: any;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

export const ProductInputs: React.FC<ProductInputsProps> = ({ formData, onChange }) => (
  <div className="space-y-4">
    <Input
      name="name"
      placeholder="Nombre del producto"
      value={formData.name}
      onChange={onChange}
      required
    />
    <Input
      name="sku"
      placeholder="SKU"
      value={formData.sku}
      onChange={onChange}
      required
    />
    <Input
      name="category"
      placeholder="Categoría"
      value={formData.category}
      onChange={onChange}
    />
    <textarea
      name="description"
      placeholder="Descripción"
      value={formData.description}
      onChange={onChange}
      className="w-full p-2 border rounded-lg"
      rows={3}
    />
  </div>
);

interface PriceInputsProps {
  formData: any;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const PriceInputs: React.FC<PriceInputsProps> = ({ formData, onChange }) => (
  <div className="grid grid-cols-2 gap-4">
    <Input
      type="number"
      name="cost_price"
      placeholder="Precio de costo"
      value={formData.cost_price}
      onChange={onChange}
      step="0.01"
    />
    <Input
      type="number"
      name="unit_price"
      placeholder="Precio unitario"
      value={formData.unit_price}
      onChange={onChange}
      step="0.01"
    />
  </div>
);

interface StockInputsProps {
  formData: any;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const StockInputs: React.FC<StockInputsProps> = ({ formData, onChange }) => (
  <div className="grid grid-cols-2 gap-4">
    <Input
      type="number"
      name="min_stock_level"
      placeholder="Stock mínimo"
      value={formData.min_stock_level}
      onChange={onChange}
    />
    <Input
      type="number"
      name="max_stock_level"
      placeholder="Stock máximo"
      value={formData.max_stock_level}
      onChange={onChange}
    />
  </div>
);

interface FormActionsProps {
  isLoading: boolean;
  isSyncing: boolean;
  onCancel: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const FormActions: React.FC<FormActionsProps> = ({
  isLoading,
  isSyncing,
  onCancel,
  onSubmit: _onSubmit
}) => (
  <div className="flex gap-4 justify-end pt-4 border-t">
    <Button type="button" onClick={onCancel} variant="secondary">
      Cancelar
    </Button>
    <Button type="submit" disabled={isLoading || isSyncing}>
      {isLoading ? 'Guardando...' : 'Guardar'}
    </Button>
  </div>
);