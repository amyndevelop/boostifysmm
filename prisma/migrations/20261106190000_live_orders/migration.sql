ALTER TABLE "Order"
 ADD COLUMN "financialState" TEXT NOT NULL DEFAULT 'RESERVED',
 ADD COLUMN "providerEndpointSnapshot" TEXT,
 ADD COLUMN "providerCredentialFingerprint" TEXT,
 ADD COLUMN "refillSupportedSnapshot" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "cancelSupportedSnapshot" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "realCost" DECIMAL(18,4),
 ADD COLUMN "providerCharge" DECIMAL(24,8),
 ADD COLUMN "providerChargeCurrency" TEXT,
 ADD COLUMN "startCount" INTEGER,
 ADD COLUMN remains INTEGER,
 ADD COLUMN refunded DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (refunded >= 0 AND refunded <= price),
 ADD COLUMN "nextSyncAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ADD COLUMN "syncLeaseUntil" TIMESTAMP(3),
 ADD COLUMN "syncFailures" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "lastSyncedAt" TIMESTAMP(3);
UPDATE "Order" o SET "financialState"='CAPTURED' WHERE EXISTS(SELECT 1 FROM "WalletTransaction" t WHERE t.key='capture:'||o.id);
ALTER TABLE "Job" ADD COLUMN "leaseToken" TEXT;
CREATE UNIQUE INDEX "Order_providerSnapshot_externalId_key" ON "Order"("providerSnapshot","externalId");
CREATE INDEX "Order_nextSyncAt_status_idx" ON "Order"("nextSyncAt",status);
CREATE TABLE "ProviderRequest" (
 id TEXT PRIMARY KEY,"orderId" TEXT NOT NULL UNIQUE REFERENCES "Order"(id),outcome TEXT NOT NULL DEFAULT 'INTENT',"externalId" TEXT,"errorCode" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "ProviderOperation" (
 id TEXT PRIMARY KEY,"orderId" TEXT NOT NULL REFERENCES "Order"(id),kind TEXT NOT NULL CHECK(kind IN ('REFILL','CANCEL')),status TEXT NOT NULL DEFAULT 'SUBMITTING',"idempotencyKey" TEXT NOT NULL,"externalId" TEXT,"leaseUntil" TIMESTAMP(3),"nextSyncAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "ProviderOperation_orderId_idempotencyKey_key" ON "ProviderOperation"("orderId","idempotencyKey");
CREATE INDEX "ProviderOperation_status_nextSyncAt_idx" ON "ProviderOperation"(status,"nextSyncAt");
CREATE UNIQUE INDEX "ProviderOperation_one_active_kind" ON "ProviderOperation"("orderId",kind) WHERE status IN ('SUBMITTING','REQUESTED','REVIEW_REQUIRED');
CREATE TABLE "OrderRefund" (
 id TEXT PRIMARY KEY,"orderId" TEXT NOT NULL REFERENCES "Order"(id),"actorId" TEXT NOT NULL REFERENCES "User"(id),amount DECIMAL(18,2) NOT NULL CHECK(amount>0),reason TEXT NOT NULL,"idempotencyKey" TEXT NOT NULL UNIQUE,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER immutable_order_refund BEFORE UPDATE OR DELETE ON "OrderRefund" FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();
