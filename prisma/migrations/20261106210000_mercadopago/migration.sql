CREATE TABLE "TopUp" (
 id TEXT PRIMARY KEY,"userId" TEXT NOT NULL REFERENCES "User"(id),amount DECIMAL(18,2) NOT NULL CHECK(amount>0),"idempotencyKey" TEXT NOT NULL,"collectorId" TEXT NOT NULL,"liveMode" BOOLEAN NOT NULL,status TEXT NOT NULL DEFAULT 'CREATING',"preferenceId" TEXT UNIQUE,"checkoutUrl" TEXT,"creditedPaymentId" TEXT UNIQUE,"creditedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "TopUp_userId_idempotencyKey_key" ON "TopUp"("userId","idempotencyKey");
CREATE INDEX "TopUp_status_createdAt_idx" ON "TopUp"(status,"createdAt");
CREATE TABLE "MercadoPagoPayment" (
 id TEXT PRIMARY KEY,"topUpId" TEXT NOT NULL REFERENCES "TopUp"(id),status TEXT NOT NULL,amount DECIMAL(18,2) NOT NULL,refunded DECIMAL(18,2) NOT NULL DEFAULT 0,"reviewReason" TEXT,"providerUpdatedAt" TIMESTAMP(3) NOT NULL,"updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "MercadoPagoPayment_topUpId_idx" ON "MercadoPagoPayment"("topUpId");
