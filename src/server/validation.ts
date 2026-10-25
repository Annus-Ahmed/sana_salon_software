import { z } from "zod";
import {
  METHODS,
  STATUSES,
  EXPENSE_CATEGORIES,
  CATEGORIES,
  validDay,
} from "@/lib/domain";
const short = z.string().trim().max(160);
const notes = z.string().trim().max(4000).optional().default("");
const amount = z.union([z.string(), z.number()]).transform(String);
const day = z.string().refine(validDay, "Choose a valid date.");
export const clientSchema = z.object({
  id: z.uuid().optional(),
  version: z.number().int().positive().optional(),
  name: short.min(2),
  phone: short.min(7),
  whatsapp: short.optional().default(""),
  email: z
    .union([z.email(), z.literal("")])
    .optional()
    .default(""),
  instagram: short.optional().default(""),
  address: z.string().trim().max(500).optional().default(""),
  type: z
    .enum(["Individual", "Bride", "Model", "Brand", "Corporate"])
    .default("Individual"),
  notes,
});
export const serviceSchema = z.object({
  id: z.uuid().optional(),
  version: z.number().int().positive().optional(),
  name: short.min(2),
  category: z.enum(CATEGORIES),
  description: z.string().trim().max(1000).optional().default(""),
  price: amount,
  durationMinutes: z.coerce.number().int().min(5).max(1440),
  estimatedCost: amount.default("0"),
  active: z.boolean().default(true),
});
export const bookingSchema = z.object({
  initialStatus: z.enum(["inquiry", "confirmed"]).default("confirmed"),
  id: z.uuid().optional(),
  version: z.number().int().positive().optional(),
  customerId: z.uuid(),
  appointmentDate: day,
  appointmentTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  category: short.min(1),
  artist: short.optional().default(""),
  hairstylist: short.optional().default(""),
  notes,
  discount: amount.default("0"),
  reason: z.string().trim().max(1000).optional(),
  items: z
    .array(
      z.object({
        serviceId: z.uuid(),
        quantity: z.coerce.number().int().min(1).max(100),
        price: amount,
      }),
    )
    .min(1)
    .max(30),
});
export const statusSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  status: z.enum(STATUSES),
  date: day,
  reason: z.string().trim().max(1000).optional(),
});
export const paymentSchema = z.object({
  bookingId: z.uuid(),
  amount,
  method: z.enum(METHODS),
  date: day,
  reference: short.optional().default(""),
  notes,
  verified: z.boolean().default(true),
});
export const refundSchema = z.object({
  paymentId: z.uuid(),
  amount,
  date: day,
  method: z.enum(METHODS),
  reason: z.string().trim().min(5).max(1000),
});
export const correctionSchema = z.object({
  id: z.uuid(),
  date: day,
  reason: z.string().trim().min(5).max(1000),
});
export const expenseSchema = z.object({
  date: day,
  category: z.enum(EXPENSE_CATEGORIES),
  classification: z.enum(["overhead", "direct", "capital"]),
  amount,
  payee: short.min(2),
  description: z.string().trim().min(3).max(1000),
  method: z.enum(METHODS),
  bookingId: z
    .union([z.uuid(), z.literal("")])
    .optional()
    .default(""),
  paid: z.boolean(),
  notes,
});
export const settleSchema = z.object({
  id: z.uuid(),
  date: day,
  method: z.enum(METHODS),
});
