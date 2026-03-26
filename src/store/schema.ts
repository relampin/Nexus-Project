import { z } from "zod";

export const createOrderSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(3).max(120),
    email: z.string().trim().email(),
    phone: z.string().trim().min(8).max(30),
  }),
  address: z.object({
    zipCode: z.string().trim().min(8).max(10),
    street: z.string().trim().min(3).max(120),
    number: z.string().trim().min(1).max(20),
    district: z.string().trim().min(2).max(80),
    city: z.string().trim().min(2).max(80),
    state: z.string().trim().min(2).max(2),
    complement: z.string().trim().max(120).optional(),
  }),
  items: z.array(z.object({
    productId: z.string().trim().min(1),
    quantity: z.number().int().min(1).max(20),
  })).min(1).max(20),
  notes: z.string().trim().max(500).optional(),
});
