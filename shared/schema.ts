import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, date, timestamp, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),
  purchaseDate: text("purchase_date").notNull(),
  orderId: text("order_id").notNull(),
  orderItemId: text("order_item_id").notNull().unique(),
  email: text("email"),
  phone: text("phone"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  street: text("street"),
  contactPerson: text("contact_person"),
  city: text("city"),
  postalCode: text("postal_code"),
  country: text("country"),
  sku: text("sku"),
  productName: text("product_name"),
  quantity: integer("quantity").notNull().default(1),
  customerType: text("customer_type").notNull().default("Privat"),
  shippingCarrier: text("shipping_carrier"),
  trackingNumber: text("tracking_number"),
  shippingDate: text("shipping_date"),
  status: text("status").notNull().default("Offen"),
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
});

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
