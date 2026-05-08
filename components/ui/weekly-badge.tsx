// Small reusable badge shown on orders belonging to weekly-billing customers
export function WeeklyBillingBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium
                     bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
      📅 Weekly billing
    </span>
  );
}