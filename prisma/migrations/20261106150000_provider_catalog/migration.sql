CREATE TABLE "ProviderService" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "providerId" TEXT NOT NULL REFERENCES "Provider"("id"),
 "externalId" TEXT NOT NULL,
 "name" TEXT NOT NULL,
 "category" TEXT NOT NULL,
 "type" TEXT NOT NULL,
 "rate" DECIMAL(18,6) NOT NULL,
 "currency" TEXT NOT NULL,
 "min" INTEGER NOT NULL,
 "max" INTEGER NOT NULL,
 "refill" BOOLEAN NOT NULL,
 "cancel" BOOLEAN NOT NULL,
 "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ProviderService_providerId_externalId_key" ON "ProviderService"("providerId", "externalId");
