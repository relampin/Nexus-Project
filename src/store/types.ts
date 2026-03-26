export type DogLifeStage = "puppy" | "adult" | "senior" | "all";
export type DogSizeProfile = "mini" | "medium" | "large" | "all";
export type StoreOrderStatus = "confirmed";

export interface StoreCategory {
  id: string;
  slug: string;
  name: string;
  description: string;
}

export interface StoreProduct {
  id: string;
  slug: string;
  categoryId: string;
  name: string;
  brand: string;
  lifeStage: DogLifeStage;
  sizeProfile: DogSizeProfile;
  flavor: string;
  priceCents: number;
  compareAtCents?: number;
  weightKg: number;
  stock: number;
  featured: boolean;
  active: boolean;
  imageUrl: string;
  highlights: string[];
}

export interface StoreOrderCustomer {
  name: string;
  email: string;
  phone: string;
}

export interface StoreOrderAddress {
  zipCode: string;
  street: string;
  number: string;
  district: string;
  city: string;
  state: string;
  complement?: string;
}

export interface StoreOrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface StoreOrder {
  id: string;
  number: string;
  status: StoreOrderStatus;
  customer: StoreOrderCustomer;
  address: StoreOrderAddress;
  items: StoreOrderItem[];
  notes?: string;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  createdAt: string;
}

export interface StoreState {
  categories: StoreCategory[];
  products: StoreProduct[];
  orders: StoreOrder[];
}

export interface ProductFilters {
  q?: string;
  category?: string;
  brand?: string;
  lifeStage?: DogLifeStage;
  sizeProfile?: DogSizeProfile;
  onlyInStock?: boolean;
  minPriceCents?: number;
  maxPriceCents?: number;
  sort?: "featured" | "price_asc" | "price_desc" | "name";
}

export interface CreateOrderInput {
  customer: StoreOrderCustomer;
  address: StoreOrderAddress;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
  notes?: string;
}
