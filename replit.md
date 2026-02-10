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
- **Amazon SP-API integration**: Automatic order fetch via Amazon Selling Partner API (OAuth 2.0 + LWA)
- Import shipping lists (CSV with Referenz matching orderId + fuzzy matching via name/phone/city) to auto-fill carrier, tracking, shipper (LogoiX)
- Duplicate check on order-item-id (unique constraint)
- Filter by date range, country, platform, status (default: Offen) + full-text search
- Versender dropdown per order (Senddrop, Sendcloud, LogoiX)
- Auto status calculation: "Offen" until carrier + tracking + date are set, then "Versendet"
- Edit shipping details (carrier, tracking number, date)
- Delete individual orders or all orders with confirmation
- **Analyse tab**: Matrix table showing shipped article quantities per country (SKU rows, country columns, totals)

## Project Structure
- `shared/schema.ts` - Drizzle schema for orders table
- `server/db.ts` - Database connection
- `server/storage.ts` - Storage interface with CRUD operations
- `server/routes.ts` - API routes (GET/POST/PATCH/DELETE)
- `server/amazon-sp-api.ts` - Amazon SP-API client (OAuth token exchange, Orders API, RDT for PII)
- `client/src/pages/dashboard.tsx` - Main dashboard page (Bestellungen tab)
- `client/src/pages/analyse.tsx` - Analysis page with article-country matrix
- `client/src/App.tsx` - App entry with routing and tab navigation

## API Endpoints
- `GET /api/orders` - List orders with optional filters (dateFrom, dateTo, country, platform)
- `POST /api/orders/import` - Import file (multipart form, field: "file")
- `POST /api/orders/import-shipping` - Import shipping list CSV (matches Referenz to orderId, sets carrier/tracking/shipper)
- `POST /api/orders/fetch-amazon` - Fetch orders from Amazon SP-API (body: createdAfter, createdBefore)
- `GET /api/orders/export-logoix` - Export open orders as LogoiX CSV (semicolon-delimited, UTF-8 BOM, groups by orderId, articles as [qty]x[sku] comma-separated)
- `PATCH /api/orders/:id` - Update order (shipping details, shipper)
- `DELETE /api/orders/:id` - Delete order

## Secrets
- `AMAZON_SP_CLIENT_ID` - Amazon LWA Client ID
- `AMAZON_SP_CLIENT_SECRET` - Amazon LWA Client Secret
- `AMAZON_SP_REFRESH_TOKEN` - Amazon SP-API Refresh Token

## Design
- Blue and black color scheme matching Novalayer logo
- Logo top-right, "Novalayer Order Dashboard" header top-left
- German language UI
