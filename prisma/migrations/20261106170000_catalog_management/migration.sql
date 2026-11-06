CREATE TABLE "ServiceCategory" (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 network TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '',
 active BOOLEAN NOT NULL DEFAULT true,
 "sortOrder" INTEGER NOT NULL DEFAULT 0,
 version INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ServiceCategory_network_name_key" ON "ServiceCategory"(network,name);
CREATE INDEX "ServiceCategory_active_sortOrder_idx" ON "ServiceCategory"(active,"sortOrder");
ALTER TABLE "Service"
 ADD COLUMN "categoryId" TEXT REFERENCES "ServiceCategory"(id) ON DELETE RESTRICT,
 ADD COLUMN "sourceId" TEXT REFERENCES "ProviderService"(id) ON DELETE RESTRICT,
 ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN version INTEGER NOT NULL DEFAULT 1,
 ADD COLUMN "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1 CHECK ("exchangeRate" > 0),
 ADD COLUMN "manualProviderRate" DECIMAL(18,6) NOT NULL DEFAULT 0,
 ADD COLUMN "costCurrency" TEXT NOT NULL DEFAULT 'ARS';
CREATE INDEX "Service_categoryId_sortOrder_idx" ON "Service"("categoryId","sortOrder");
CREATE INDEX "Service_sourceId_idx" ON "Service"("sourceId");
ALTER TABLE "ProviderService" ADD COLUMN available BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Order"
 ADD COLUMN "providerCostSnapshot" DECIMAL(18,6),
 ADD COLUMN "providerCurrencySnapshot" TEXT,
 ADD COLUMN "exchangeRateSnapshot" DECIMAL(18,6);
INSERT INTO "ServiceCategory"(id,name,network)
 SELECT md5('boostify-category:' || network || ':' || category),category,network FROM "Service" GROUP BY network,category;
UPDATE "Service" SET "categoryId" = md5('boostify-category:' || network || ':' || category);
UPDATE "Service" s SET "sourceId" = p.id, "costCurrency" = p.currency FROM "ProviderService" p
 WHERE s."providerId" = p."providerId" AND s."externalId" = p."externalId";

UPDATE "Service" SET "manualProviderRate" = cost WHERE "sourceId" IS NULL;
