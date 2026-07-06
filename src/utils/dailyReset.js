// IST is UTC+5:30 - India doesn't observe DST, so this offset is constant.
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

function toISTDateParts(date) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return { y: ist.getUTCFullYear(), m: ist.getUTCMonth(), d: ist.getUTCDate() };
}

// Returns true if `date` falls on a different IST calendar day than "now".
// Using IST explicitly (not server-local time) matters because the backend
// runs in UTC on Render, while shops operate on India business hours - a
// naive server-local comparison would leave stock stale for the ~5.5 hours
// between UTC midnight and actual IST midnight every day.
function isDifferentDay(date, now = new Date()) {
  const a = toISTDateParts(date);
  const b = toISTDateParts(now);
  return a.y !== b.y || a.m !== b.m || a.d !== b.d;
}

// Call this on any MenuItem before reading/using soldToday or dailyLimit.
// If the stored soldTodayDate is from a previous day, resets soldToday to 0
// (and un-flips an auto-SOLDOUT state back to AVAILABLE for QTY items) and
// persists that change, so the reset only has to happen once per item per day
// no matter which request triggers it.
async function ensureFreshSoldToday(prisma, item) {
  if (!item || !isDifferentDay(new Date(item.soldTodayDate))) return item;

  const data = { soldToday: 0, soldTodayDate: new Date(), preOrderSoldToday: 0 };

  if (item.availMode === 'QTY') {
    // Quantity-tracked items auto-refill to their predefined daily target.
    // dailyLimit is the owner's permanent "shop sells ~100/day" setting and
    // is never touched here - only the live running stock is reset.
    data.currentStock = item.dailyLimit || 0;
    if (item.availabilityState === 'SOLDOUT') data.availabilityState = 'AVAILABLE';
  } else {
    // Non-quantity (TOGGLE) items can't auto-refill - default them to
    // "CHECK" (enquiry) each morning and flag for the owner to confirm
    // today's real availability.
    data.availabilityState = 'CHECK';
    data.needsDailyReview = true;
  }

  const updated = await prisma.menuItem.update({
    where: { id: item.id },
    data,
  });
  return updated;
}

// Batch version for list endpoints (e.g. GET /menu)
async function ensureFreshSoldTodayMany(prisma, items) {
  return Promise.all(items.map(item => ensureFreshSoldToday(prisma, item)));
}

module.exports = { isDifferentDay, ensureFreshSoldToday, ensureFreshSoldTodayMany };
