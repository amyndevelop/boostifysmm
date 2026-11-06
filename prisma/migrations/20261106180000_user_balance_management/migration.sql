ALTER TABLE "User" ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "AuditLog" ADD COLUMN metadata JSONB;
CREATE TABLE "WalletAdjustment" (
 id TEXT PRIMARY KEY,
 "userId" TEXT NOT NULL REFERENCES "User"(id),
 "actorId" TEXT NOT NULL REFERENCES "User"(id),
 "walletId" TEXT NOT NULL REFERENCES "Wallet"(id),
 "transactionId" TEXT NOT NULL UNIQUE REFERENCES "WalletTransaction"(id),
 "idempotencyKey" TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 direction TEXT NOT NULL CHECK (direction IN ('CREDIT','DEBIT')),
 amount DECIMAL(18,2) NOT NULL CHECK (amount > 0),
 "balanceBefore" DECIMAL(18,2) NOT NULL CHECK ("balanceBefore" >= 0),
 "balanceAfter" DECIMAL(18,2) NOT NULL CHECK ("balanceAfter" >= 0),
 reason TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT adjustment_balance_consistent CHECK (
  (direction='CREDIT' AND "balanceAfter"="balanceBefore"+amount) OR
  (direction='DEBIT' AND "balanceAfter"="balanceBefore"-amount)
 )
);
CREATE UNIQUE INDEX "WalletAdjustment_actorId_idempotencyKey_key" ON "WalletAdjustment"("actorId","idempotencyKey");
CREATE INDEX "WalletAdjustment_userId_createdAt_idx" ON "WalletAdjustment"("userId","createdAt");
CREATE TRIGGER immutable_wallet_adjustment BEFORE UPDATE OR DELETE ON "WalletAdjustment" FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();
