import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

export type Product = 'nomia' | 'leadmap';

interface Ctx {
  product: Product;
  setProduct: (p: Product) => void;
}

const ProductContext = createContext<Ctx>({ product: 'nomia', setProduct: () => {} });

const KEY = 'crm.activeProduct';

export function ProductProvider({ children }: { children: React.ReactNode }) {
  const [product, setProductState] = useState<Product>(() => {
    if (typeof window === 'undefined') return 'nomia';
    const stored = localStorage.getItem(KEY);
    return stored === 'leadmap' || stored === 'nomia' ? stored : 'nomia';
  });

  const setProduct = useCallback((p: Product) => {
    setProductState(p);
    try {
      localStorage.setItem(KEY, p);
      window.dispatchEvent(new Event('crm-product-change'));
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-product', product);
  }, [product]);

  return (
    <ProductContext.Provider value={{ product, setProduct }}>
      {children}
    </ProductContext.Provider>
  );
}

export function useProduct() {
  return useContext(ProductContext);
}
