import { useState, useCallback, useMemo } from 'react';
import { Product, CartItem } from '@/types/Types_POS';

export const usePOSCart = () => {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  const addToCart = useCallback((product: Product) => {
    setCartItems((prevItems) => {
      const existingItem = prevItems.find((item) => item.product_id === product.id);

      if (existingItem) {
        return prevItems.map((item) =>
          item.product_id === product.id
            ? {
                ...item,
                quantity: item.quantity + 1,
                subtotal: (item.quantity + 1) * item.unit_price,
              }
            : item
        );
      } else {
        return [
          ...prevItems,
          {
            product_id: product.id,
            product,
            quantity: 1,
            unit_price: product.unit_price,
            subtotal: product.unit_price,
          },
        ];
      }
    });
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCartItems((prevItems) => prevItems.filter((item) => item.product_id !== productId));
  }, []);

  const changeQuantity = useCallback((productId: string, quantity: number) => {
    setCartItems((prevItems) => {
      if (quantity <= 0) {
        return prevItems.filter((item) => item.product_id !== productId);
      } else {
        return prevItems.map((item) =>
          item.product_id === productId
            ? {
                ...item,
                quantity,
                subtotal: quantity * item.unit_price,
              }
            : item
        );
      }
    });
  }, []);

  const clearCart = useCallback(() => {
    setCartItems([]);
  }, []);

  const totals = useMemo(() => {
    const subtotal = cartItems.reduce((sum, item) => sum + item.subtotal, 0);
    const taxPercent = 13;
    const taxAmount = subtotal * (taxPercent / 100);
    const total = subtotal + taxAmount;
    return { subtotal, taxAmount, total };
  }, [cartItems]);

  return {
    cartItems,
    addToCart,
    removeFromCart,
    changeQuantity,
    clearCart,
    totals,
  };
};