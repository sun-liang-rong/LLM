const fs = require("node:fs");
const path = require("node:path");
const sqlite3 = require("sqlite3");

const databaseUrl = process.env.DATABASE_URL || "file:../data/gateway.db";
const filePath = databaseUrl.replace(/^file:/, "");
const dbPath = path.resolve(__dirname, "../prisma", filePath);
const sqlPath = path.resolve(__dirname, "../prisma/init.sql");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sql = fs.readFileSync(sqlPath, "utf8");
const db = new sqlite3.Database(dbPath);

function ensureColumn(table, column, definition) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info('${table}')`, (pragmaError, columns) => {
      if (pragmaError) {
        reject(pragmaError);
        return;
      }

      if (columns.some((item) => item.name === column)) {
        resolve();
        return;
      }

      db.exec(`ALTER TABLE "${table}" ADD COLUMN ${definition}`, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });
}

function ensureTable(definition) {
  return new Promise((resolve, reject) => {
    db.exec(definition, (error) => {
      if (error && !String(error.message).includes("already exists")) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

db.exec(sql, (error) => {
  if (error && !String(error.message).includes("already exists")) {
    db.close();
    console.error(error);
    process.exit(1);
  }
  Promise.all([
    ensureTable(`CREATE TABLE IF NOT EXISTS "VerificationCode" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "email" TEXT NOT NULL,
          "channel" TEXT NOT NULL DEFAULT 'email',
          "purpose" TEXT NOT NULL DEFAULT 'register',
          "codeHash" TEXT NOT NULL,
          "tokenHash" TEXT,
          "attempts" INTEGER NOT NULL DEFAULT 0,
          "consumedAt" DATETIME,
          "expiresAt" DATETIME NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
    ensureTable(`CREATE TABLE IF NOT EXISTS "LoginAttempt" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "email" TEXT NOT NULL,
          "ip" TEXT,
          "scope" TEXT NOT NULL,
          "status" TEXT NOT NULL,
          "reason" TEXT,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
    ensureTable(`CREATE TABLE IF NOT EXISTS "UserCreditAccount" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "userId" TEXT NOT NULL,
          "tenantId" TEXT NOT NULL,
          "balanceCredits" INTEGER NOT NULL DEFAULT 0,
          "totalGrantedCredits" INTEGER NOT NULL DEFAULT 0,
          "totalUsedCredits" INTEGER NOT NULL DEFAULT 0,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
    ensureTable(`CREATE TABLE IF NOT EXISTS "CreditLedger" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "userId" TEXT NOT NULL,
          "tenantId" TEXT NOT NULL,
          "type" TEXT NOT NULL,
          "amountCredits" INTEGER NOT NULL,
          "balanceAfterCredits" INTEGER NOT NULL,
          "requestId" TEXT,
          "expiresAt" DATETIME,
          "description" TEXT,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
    ensureTable(`CREATE TABLE IF NOT EXISTS "CheckInRecord" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "userId" TEXT NOT NULL,
          "tenantId" TEXT NOT NULL,
          "checkInDate" TEXT NOT NULL,
          "rewardCredits" INTEGER NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
    ensureTable(`CREATE TABLE IF NOT EXISTS "BillingGroup" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "tenantId" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "multiplier" REAL NOT NULL DEFAULT 1,
          "description" TEXT,
          "isDefault" BOOLEAN NOT NULL DEFAULT false,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
  ])
    .then(() =>
      Promise.all([
        ensureColumn("User", "passwordHash", '"passwordHash" TEXT'),
        ensureColumn("User", "verifiedAt", '"verifiedAt" DATETIME'),
        ensureColumn("User", "failedLoginCount", '"failedLoginCount" INTEGER NOT NULL DEFAULT 0'),
        ensureColumn("User", "billingGroupId", '"billingGroupId" TEXT'),
        ensureColumn("User", "lockedUntil", '"lockedUntil" DATETIME'),
        ensureColumn("User", "disabled", '"disabled" BOOLEAN NOT NULL DEFAULT false'),
        ensureColumn("User", "lastLoginAt", '"lastLoginAt" DATETIME'),
        ensureColumn("User", "lastLoginIp", '"lastLoginIp" TEXT'),
        ensureColumn("VerificationCode", "channel", '"channel" TEXT NOT NULL DEFAULT "email"'),
        ensureColumn("VerificationCode", "purpose", '"purpose" TEXT NOT NULL DEFAULT "register"'),
        ensureColumn("VerificationCode", "tokenHash", '"tokenHash" TEXT'),
        ensureColumn("VerificationCode", "attempts", '"attempts" INTEGER NOT NULL DEFAULT 0'),
        ensureColumn("VerificationCode", "consumedAt", '"consumedAt" DATETIME'),
        ensureColumn("VerificationCode", "updatedAt", '"updatedAt" DATETIME'),
        ensureColumn("RequestLog", "tenantId", '"tenantId" TEXT'),
        ensureColumn("RequestLog", "providerKeyId", '"providerKeyId" TEXT'),
        ensureColumn("RequestLog", "apiKeyId", '"apiKeyId" TEXT'),
        ensureColumn("RequestLog", "totalTokens", '"totalTokens" INTEGER NOT NULL DEFAULT 0'),
        ensureColumn("RequestLog", "cacheReadTokens", '"cacheReadTokens" INTEGER NOT NULL DEFAULT 0'),
        ensureColumn("RequestLog", "cacheCreationTokens", '"cacheCreationTokens" INTEGER NOT NULL DEFAULT 0'),
        ensureColumn("RequestLog", "reasoningTokens", '"reasoningTokens" INTEGER NOT NULL DEFAULT 0'),
        ensureColumn("RequestLog", "estimatedTokens", '"estimatedTokens" BOOLEAN NOT NULL DEFAULT false'),
        ensureColumn("ApiKey", "encryptedKey", '"encryptedKey" TEXT'),
        ensureColumn("ApiKey", "keyPrefix", '"keyPrefix" TEXT'),
        ensureColumn("ApiKey", "enabled", '"enabled" BOOLEAN NOT NULL DEFAULT true'),
        ensureColumn("ApiKey", "userId", '"userId" TEXT'),
        ensureColumn("Provider", "protocol", '"protocol" TEXT NOT NULL DEFAULT "openai-compatible"'),
        ensureColumn("ProviderKey", "windowSizeMinutes", '"windowSizeMinutes" INTEGER NOT NULL DEFAULT 300'),
        ensureColumn("ProviderKey", "windowRequestLimit", '"windowRequestLimit" INTEGER NOT NULL DEFAULT 500'),
        ensureColumn("ProviderKey", "windowStartedAt", '"windowStartedAt" DATETIME'),
        ensureColumn("ProviderKey", "windowRequestCount", '"windowRequestCount" INTEGER NOT NULL DEFAULT 0'),
        ensureColumn("Budget", "downgradeModelAlias", '"downgradeModelAlias" TEXT'),
      ]),
    )
    .then(
      () =>
        new Promise((resolve, reject) => {
          db.exec(
            [
              'CREATE UNIQUE INDEX IF NOT EXISTS "UserCreditAccount_userId_key" ON "UserCreditAccount"("userId")',
              'CREATE UNIQUE INDEX IF NOT EXISTS "CheckInRecord_userId_checkInDate_key" ON "CheckInRecord"("userId", "checkInDate")',
            ].join(";"),
            (indexError) => {
              if (indexError) reject(indexError);
              else resolve();
            },
          );
        }),
    )
    .then(() => {
      db.close();
      console.log(`SQLite ready at ${dbPath}`);
    })
    .catch((migrationError) => {
      db.close();
      console.error(migrationError);
      process.exit(1);
    });
});
