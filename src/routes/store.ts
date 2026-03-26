import { Router } from "express";
import { createOrderSchema } from "../store/schema";
import { DogFoodStoreService, StoreValidationError } from "../store/service";
import { DogLifeStage, DogSizeProfile, ProductFilters } from "../store/types";

const allowedLifeStages: DogLifeStage[] = ["puppy", "adult", "senior", "all"];
const allowedSizeProfiles: DogSizeProfile[] = ["mini", "medium", "large", "all"];
const allowedSorts: NonNullable<ProductFilters["sort"]>[] = ["featured", "price_asc", "price_desc", "name"];

export function createStoreRouter() {
  const router = Router();
  const store = new DogFoodStoreService();

  router.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "dog-food-store",
      summary: store.getSummary(),
      now: new Date().toISOString(),
    });
  });

  router.get("/categories", (_req, res) => {
    res.json({
      items: store.listCategories(),
    });
  });

  router.get("/products", (req, res) => {
    const filters = parseProductFilters(req.query);
    res.json(store.listProducts(filters));
  });

  router.get("/products/:id", (req, res) => {
    const product = store.getProductById(req.params.id);

    if (!product) {
      res.status(404).json({ error: "Produto nao encontrado." });
      return;
    }

    res.json(product);
  });

  router.post("/orders", (req, res, next) => {
    try {
      const input = createOrderSchema.parse(req.body);
      const order = store.createOrder(input);

      res.status(201).json({
        message: "Pedido confirmado com sucesso.",
        order,
      });
    } catch (error) {
      if (error instanceof StoreValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }

      next(error);
    }
  });

  router.get("/orders/:id", (req, res) => {
    const order = store.getOrderById(req.params.id);

    if (!order) {
      res.status(404).json({ error: "Pedido nao encontrado." });
      return;
    }

    res.json(order);
  });

  return router;
}

function parseProductFilters(query: Record<string, unknown>): ProductFilters {
  const filters: ProductFilters = {};
  const q = readString(query.q);
  const category = readString(query.category);
  const brand = readString(query.brand);
  const lifeStage = readString(query.lifeStage);
  const sizeProfile = readString(query.sizeProfile);
  const sort = readString(query.sort);
  const minPriceCents = readInteger(query.minPriceCents);
  const maxPriceCents = readInteger(query.maxPriceCents);
  const onlyInStock = readBoolean(query.onlyInStock);

  if (q) {
    filters.q = q;
  }

  if (category) {
    filters.category = category;
  }

  if (brand) {
    filters.brand = brand;
  }

  if (lifeStage && allowedLifeStages.includes(lifeStage as DogLifeStage)) {
    filters.lifeStage = lifeStage as DogLifeStage;
  }

  if (sizeProfile && allowedSizeProfiles.includes(sizeProfile as DogSizeProfile)) {
    filters.sizeProfile = sizeProfile as DogSizeProfile;
  }

  if (sort && allowedSorts.includes(sort as NonNullable<ProductFilters["sort"]>)) {
    filters.sort = sort as NonNullable<ProductFilters["sort"]>;
  }

  if (typeof minPriceCents === "number") {
    filters.minPriceCents = minPriceCents;
  }

  if (typeof maxPriceCents === "number") {
    filters.maxPriceCents = maxPriceCents;
  }

  if (typeof onlyInStock === "boolean") {
    filters.onlyInStock = onlyInStock;
  }

  return filters;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readInteger(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function readBoolean(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return undefined;
}
