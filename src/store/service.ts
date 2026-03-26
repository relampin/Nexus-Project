import { resolveProjectPath } from "../core/paths";
import { JsonFileStore } from "../core/storage";
import { defaultStoreState } from "./seed";
import { CreateOrderInput, ProductFilters, StoreCategory, StoreOrder, StoreProduct, StoreState } from "./types";

export class StoreValidationError extends Error {}

export class DogFoodStoreService {
  private readonly store = new JsonFileStore<StoreState>(resolveProjectPath("data", "store.json"), defaultStoreState);

  listCategories() {
    const state = this.store.read();

    return state.categories.map((category) => ({
      ...category,
      productCount: state.products.filter((product) => product.active && product.categoryId === category.id).length,
    }));
  }

  listProducts(filters: ProductFilters) {
    const state = this.store.read();
    const normalizedQuery = filters.q?.trim().toLowerCase();
    let items = state.products.filter((product) => product.active);

    if (normalizedQuery) {
      items = items.filter((product) =>
        product.name.toLowerCase().includes(normalizedQuery)
        || product.brand.toLowerCase().includes(normalizedQuery)
        || product.flavor.toLowerCase().includes(normalizedQuery));
    }

    if (filters.category) {
      items = items.filter((product) => product.categoryId === filters.category);
    }

    if (filters.brand) {
      const normalizedBrand = filters.brand.trim().toLowerCase();
      items = items.filter((product) => product.brand.toLowerCase() === normalizedBrand);
    }

    if (filters.lifeStage) {
      items = items.filter((product) => product.lifeStage === filters.lifeStage || product.lifeStage === "all");
    }

    if (filters.sizeProfile) {
      items = items.filter((product) => product.sizeProfile === filters.sizeProfile || product.sizeProfile === "all");
    }

    if (filters.onlyInStock) {
      items = items.filter((product) => product.stock > 0);
    }

    if (typeof filters.minPriceCents === "number") {
      const minPriceCents = filters.minPriceCents;
      items = items.filter((product) => product.priceCents >= minPriceCents);
    }

    if (typeof filters.maxPriceCents === "number") {
      const maxPriceCents = filters.maxPriceCents;
      items = items.filter((product) => product.priceCents <= maxPriceCents);
    }

    this.sortProducts(items, filters.sort);

    return {
      items: items.map((product) => this.mapProductDetails(product, state.categories)),
      meta: {
        total: items.length,
        filters,
        availableBrands: [...new Set(state.products.filter((product) => product.active).map((product) => product.brand))].sort(),
      },
    };
  }

  getProductById(id: string) {
    const state = this.store.read();
    const product = state.products.find((item) => item.id === id || item.slug === id);

    if (!product || !product.active) {
      return undefined;
    }

    return this.mapProductDetails(product, state.categories);
  }

  createOrder(input: CreateOrderInput) {
    const state = this.store.read();
    const items = input.items.map((item) => {
      const product = state.products.find((candidate) => candidate.id === item.productId);

      if (!product || !product.active) {
        throw new StoreValidationError(`Produto invalido ou indisponivel: ${item.productId}`);
      }

      if (product.stock < item.quantity) {
        throw new StoreValidationError(`Estoque insuficiente para ${product.name}. Disponivel: ${product.stock}`);
      }

      return {
        product,
        quantity: item.quantity,
      };
    });

    const subtotalCents = items.reduce((total, item) => total + item.product.priceCents * item.quantity, 0);
    const shippingCents = subtotalCents >= 19900 ? 0 : 1490;
    const order: StoreOrder = {
      id: this.createOrderId(),
      number: this.createOrderNumber(state.orders.length + 1),
      status: "confirmed",
      customer: input.customer,
      address: {
        ...input.address,
        state: input.address.state.toUpperCase(),
      },
      items: items.map(({ product, quantity }) => ({
        productId: product.id,
        productName: product.name,
        quantity,
        unitPriceCents: product.priceCents,
        lineTotalCents: product.priceCents * quantity,
      })),
      notes: input.notes,
      subtotalCents,
      shippingCents,
      totalCents: subtotalCents + shippingCents,
      createdAt: new Date().toISOString(),
    };

    for (const item of items) {
      item.product.stock -= item.quantity;
    }

    state.orders.unshift(order);
    this.store.write(state);

    return order;
  }

  getOrderById(id: string) {
    return this.store.read().orders.find((order) => order.id === id || order.number === id);
  }

  getSummary() {
    const state = this.store.read();
    const activeProducts = state.products.filter((product) => product.active);

    return {
      categories: state.categories.length,
      products: activeProducts.length,
      featuredProducts: activeProducts.filter((product) => product.featured).length,
      orders: state.orders.length,
      inventoryUnits: activeProducts.reduce((total, product) => total + product.stock, 0),
    };
  }

  private mapProductDetails(product: StoreProduct, categories: StoreCategory[]) {
    const category = categories.find((item) => item.id === product.categoryId);

    return {
      ...product,
      category: category
        ? {
            id: category.id,
            slug: category.slug,
            name: category.name,
          }
        : null,
      available: product.stock > 0,
    };
  }

  private sortProducts(items: StoreProduct[], sort: ProductFilters["sort"]) {
    switch (sort) {
      case "price_asc":
        items.sort((left, right) => left.priceCents - right.priceCents);
        return;
      case "price_desc":
        items.sort((left, right) => right.priceCents - left.priceCents);
        return;
      case "name":
        items.sort((left, right) => left.name.localeCompare(right.name));
        return;
      case "featured":
      default:
        items.sort((left, right) => {
          if (left.featured !== right.featured) {
            return Number(right.featured) - Number(left.featured);
          }

          return left.name.localeCompare(right.name);
        });
    }
  }

  private createOrderId() {
    return `order-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private createOrderNumber(sequence: number) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return `DOG-${date}-${String(sequence).padStart(4, "0")}`;
  }
}
