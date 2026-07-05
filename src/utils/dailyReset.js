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
