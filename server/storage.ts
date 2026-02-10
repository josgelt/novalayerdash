import { type Order, type InsertOrder, orders } from "@shared/schema";
import { db } from "./db";
import { eq, and, gte, lte, sql } from "drizzle-orm";

export interface IStorage {
  getOrders(filters?: {
    dateFrom?: string;
    dateTo?: string;
    country?: string;
    platform?: string;
  }): Promise<Order[]>;
  getOrderByItemId(orderItemId: string): Promise<Order | undefined>;
  createOrder(order: InsertOrder): Promise<Order>;
  createOrders(orders: InsertOrder[]): Promise<{ imported: number; duplicates: number; duplicateIds: string[] }>;
  updateOrder(id: number, data: Partial<InsertOrder>): Promise<Order | undefined>;
  deleteOrder(id: number): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getOrders(filters?: {
    dateFrom?: string;
    dateTo?: string;
    country?: string;
    platform?: string;
  }): Promise<Order[]> {
    const conditions = [];

    if (filters?.dateFrom) {
      conditions.push(gte(orders.purchaseDate, filters.dateFrom));
    }
    if (filters?.dateTo) {
      conditions.push(lte(orders.purchaseDate, filters.dateTo + "T23:59:59"));
    }
    if (filters?.country) {
      conditions.push(eq(orders.country, filters.country));
    }
    if (filters?.platform) {
      conditions.push(eq(orders.platform, filters.platform));
    }

    if (conditions.length > 0) {
      return db.select().from(orders).where(and(...conditions)).orderBy(sql`${orders.purchaseDate} DESC`);
    }

    return db.select().from(orders).orderBy(sql`${orders.purchaseDate} DESC`);
  }

  async getOrderByItemId(orderItemId: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.orderItemId, orderItemId));
    return order;
  }

  async createOrder(order: InsertOrder): Promise<Order> {
    const [created] = await db.insert(orders).values(order).returning();
    return created;
  }

  async createOrders(orderList: InsertOrder[]): Promise<{ imported: number; duplicates: number; duplicateIds: string[] }> {
    let imported = 0;
    const duplicateIds: string[] = [];

    for (const order of orderList) {
      const existing = await this.getOrderByItemId(order.orderItemId);
      if (existing) {
        duplicateIds.push(order.orderItemId);
        continue;
      }
      await db.insert(orders).values(order);
      imported++;
    }

    return { imported, duplicates: duplicateIds.length, duplicateIds };
  }

  async updateOrder(id: number, data: Partial<InsertOrder>): Promise<Order | undefined> {
    const updateData: Record<string, unknown> = { ...data };

    const [current] = await db.select().from(orders).where(eq(orders.id, id));
    if (!current) return undefined;

    const carrier = data.shippingCarrier !== undefined ? data.shippingCarrier : current.shippingCarrier;
    const tracking = data.trackingNumber !== undefined ? data.trackingNumber : current.trackingNumber;
    const shipDate = data.shippingDate !== undefined ? data.shippingDate : current.shippingDate;

    if (carrier && tracking && shipDate) {
      updateData.status = "Versendet";
    } else {
      updateData.status = "Offen";
    }

    const [updated] = await db.update(orders).set(updateData).where(eq(orders.id, id)).returning();
    return updated;
  }

  async deleteOrder(id: number): Promise<boolean> {
    const result = await db.delete(orders).where(eq(orders.id, id));
    return true;
  }
}

export const storage = new DatabaseStorage();
