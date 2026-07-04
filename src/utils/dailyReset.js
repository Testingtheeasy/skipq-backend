// Returns true if `date` falls on a different calendar day than "now"
// (server local time — adjust to a fixed timezone below if your shops
// span multiple timezones).
function isDifferentDay(date, now = new Date()) {
  return (
    date.getFullYear() !== now.getFullYear() ||
    date.getMonth() !== now.getMonth() ||
    date.getDate() !== now.getDate()
  );
}

// Call this on any MenuItem before reading/using soldToday or dailyLimit.
// If the stored soldTodayDate is from a previous day, resets soldToday to 0
// (and un-flips an auto-SOLDOUT state back to AVAILABLE for QTY items) and
// persists that change, so the reset only has to happen once per item per day
// no matter which request triggers it.
async function ensureFreshSoldToday(prisma, item) {
  if (!item || !isDifferentDay(new Date(item.soldTodayDate))) return item;

  const data = { soldToday: 0, soldTodayDate: new Date() };
  // Only clear an auto-SOLDOUT flag for qty-tracked items; owner-toggled
  // TOGGLE items should keep whatever state the owner set manually.
  if (item.availMode === 'QTY' && item.availabilityState === 'SOLDOUT') {
    data.availabilityState = 'AVAILABLE';
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
