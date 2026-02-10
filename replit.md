# Novalayer Order Dashboard

## Overview
Order management dashboard for Amazon and eBay sellers. Import order files (TSV/CSV), track shipments, and manage orders with duplicate detection and filtering.

## Architecture
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui components
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **File parsing**: csv-parse for robust TSV/CSV handling

## Key Features
- Import Amazon TSV and eBay CSV files with auto platform detection
- Duplicate check on order-item-id (unique constraint)
- Filter by date range, country, platform + full-text search
- Auto status calculation: "Offen" until carrier + tracking + date are set, then "Versendet"
- Edit shipping details (carrier, tracking number, date)
- Delete orders with confirmation

## Project Structure
- `shared/schema.ts` - Drizzle schema for orders table
- `server/db.ts` - Database connection
- `server/storage.ts` - Storage interface with CRUD operations
- `server/routes.ts` - API routes (GET/POST/PATCH/DELETE)
- `client/src/pages/dashboard.tsx` - Main dashboard page
- `client/src/App.tsx` - App entry with routing

## API Endpoints
- `GET /api/orders` - List orders with optional filters (dateFrom, dateTo, country, platform)
- `POST /api/orders/import` - Import file (multipart form, field: "file")
- `PATCH /api/orders/:id` - Update order (shipping details)
- `DELETE /api/orders/:id` - Delete order

## Design
- Blue and black color scheme matching Novalayer logo
- Logo top-right, "Novalayer Order Dashboard" header top-left
- German language UI
