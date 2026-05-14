import { apiFetch } from '@/lib/api';
import { Product, CartItem, ShoppingCart } from '../../types/Types_POS';

export const salesService = {
  // ============ PRODUCTS ============

  /**
   * Buscar productos por nombre o SKU
   */
  async searchProducts(_tenantId: string, query: string): Promise<Product[]> {
    return apiFetch<Product[]>(`/products?search=${encodeURIComponent(query)}&limit=20`);
  },

  /**
   * Obtener producto por ID
   */
  async getProductById(productId: string): Promise<Product> {
    return apiFetch<Product>('/products/' + productId);
  },

  /**
   * Obtener todos los productos de un tenant
   */
  async getAllProducts(_tenantId: string): Promise<Product[]> {
    return apiFetch<Product[]>('/products');
  },

  /**
   * Obtener productos por categoría
   */
  async getProductsByCategory(_tenantId: string, categoryId: string): Promise<Product[]> {
    return apiFetch<Product[]>(`/products?category_id=${categoryId}`);
  },

  // ============ CART CALCULATIONS ============

  /**
   * Calcular subtotal de un item
   */
  calculateItemSubtotal(quantity: number, unitPrice: number, discountPercent?: number): number {
    let subtotal = quantity * unitPrice;
    if (discountPercent) {
      subtotal = subtotal * (1 - discountPercent / 100);
    }
    return Math.round(subtotal * 100) / 100;
  },

  /**
   * Calcular totales del carrito
   */
  calculateCartTotals(items: CartItem[], taxPercent: number = 13): ShoppingCart {
    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    const discount_total = items.reduce((sum, item) => {
      if (item.discount_percent) {
        return sum + (item.quantity * item.unit_price * item.discount_percent / 100);
      }
      return sum;
    }, 0);

    const taxable = subtotal;
    const tax_total = Math.round(taxable * taxPercent / 100 * 100) / 100;
    const total = subtotal + tax_total;

    return {
      items,
      subtotal: Math.round(subtotal * 100) / 100,
      discount_total: Math.round(discount_total * 100) / 100,
      tax_total,
      total: Math.round(total * 100) / 100,
    };
  },

  /**
   * Agregar item al carrito
   */
  addToCart(
    items: CartItem[],
    product: Product,
    quantity: number,
    discountPercent?: number
  ): CartItem[] {
    const existingItem = items.find(item => item.product_id === product.id);

    if (existingItem) {
      existingItem.quantity += quantity;
      existingItem.subtotal = this.calculateItemSubtotal(
        existingItem.quantity,
        existingItem.unit_price,
        discountPercent
      );
    } else {
      items.push({
        product_id: product.id,
        product,
        quantity,
        unit_price: product.unit_price,
        discount_percent: discountPercent,
        subtotal: this.calculateItemSubtotal(quantity, product.unit_price, discountPercent),
      });
    }

    return [...items];
  },

  /**
   * Eliminar item del carrito
   */
  removeFromCart(items: CartItem[], productId: string): CartItem[] {
    return items.filter(item => item.product_id !== productId);
  },

  /**
   * Actualizar cantidad de item
   */
  updateItemQuantity(items: CartItem[], productId: string, quantity: number): CartItem[] {
    return items.map(item => {
      if (item.product_id === productId) {
        return {
          ...item,
          quantity,
          subtotal: this.calculateItemSubtotal(quantity, item.unit_price, item.discount_percent),
        };
      }
      return item;
    });
  },

  /**
   * Actualizar descuento de item
   */
  updateItemDiscount(items: CartItem[], productId: string, discountPercent: number): CartItem[] {
    return items.map(item => {
      if (item.product_id === productId) {
        return {
          ...item,
          discount_percent: discountPercent,
          subtotal: this.calculateItemSubtotal(item.quantity, item.unit_price, discountPercent),
        };
      }
      return item;
    });
  },

  /**
   * Limpiar carrito
   */
  clearCart(): CartItem[] {
    return [];
  },
};
