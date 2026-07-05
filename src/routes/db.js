// Single shared Prisma Client for the whole app.
//
// IMPORTANT: every route file used to do `new PrismaClient()` on its own,
// which meant ~10 separate connection pools hitting the same database at
// once. Against a connection-pooled Postgres (Render/Supabase/Neon style),
// that causes exactly the kind of protocol-level errors we hit
// (prepared-statement conflicts, "incorrect binary data format" 22P03
// errors) especially under polling load. One shared client fixes this.

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function db(fn) {
  try {
    return await fn(prisma);
  } catch (err) {
    const msg = (err && err.message) || '';
    const isConnFluke =
      msg.includes('prepared statement') ||
      (err && err.code === '22P03') ||
      msg.includes('Connection') ||
      msg.includes('connection');
    if (isConnFluke) {
      try { await prisma.$disconnect(); } catch (e) {}
      // Prisma reconnects lazily on the next query - just retry once.
      return await fn(prisma);
    }
    throw err;
  }
}

module.exports = { prisma, db };
