"use client";

import type { PcoServiceTypeRef, PlanScope, UpcomingPlanOption } from "@/lib/pco/service-plan-selection";

export type PcoServicePlanPickerProps = {
  planId: string;
  serviceTypeId: string;
  setServiceTypeId: (value: string) => void;
  upcomingPlans: UpcomingPlanOption[];
  serviceTypeOptions: PcoServiceTypeRef[];
  planScope: PlanScope | null;
  selectedPlan: UpcomingPlanOption | null;
  busy: boolean;
  error: string | null;
  onSelectPlan: (planId: string) => void;
  onLoadOptions: (serviceTypeId?: string) => void | Promise<void>;
  serviceTypeLabel?: string;
  serviceTypeHint?: string;
  showAdvancedServiceType?: boolean;
};

export function PcoServicePlanPicker({
  planId,
  serviceTypeId,
  setServiceTypeId,
  upcomingPlans,
  serviceTypeOptions,
  planScope,
  selectedPlan,
  busy,
  error,
  onSelectPlan,
  onLoadOptions,
  serviceTypeLabel = "Plan type (advanced)",
  serviceTypeHint = "Leave this as resolved unless you need another plan type.",
  showAdvancedServiceType = true,
}: PcoServicePlanPickerProps) {
  return (
    <>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">Plan</span>
        <select
          value={planId}
          onChange={(e) => onSelectPlan(e.target.value)}
          disabled={busy}
          className="h-11 rounded-xl border border-zinc-200 px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
          <option value="">
            {busy ? "Loading upcoming plans..." : "Select an upcoming plan"}
          </option>
          {upcomingPlans.map((plan) => (
            <option key={plan.planId} value={String(plan.planId)}>
              {plan.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Upcoming plans are sorted from closest to farthest. Same-day plans include the service
          time.
        </span>
        {planScope ? (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Scope: {planScope.name} (
            {planScope.source === "profile" ? "from your PCO profile" : "from env config"})
          </span>
        ) : null}
        {selectedPlan ? (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">
            Selected: {selectedPlan.label}
          </span>
        ) : null}
        {error ? (
          <span className="text-xs text-amber-700 dark:text-amber-300">{error}</span>
        ) : null}
      </label>
      {showAdvancedServiceType ? (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">{serviceTypeLabel}</span>
          <div className="flex flex-wrap gap-2">
            {serviceTypeOptions.length > 0 ? (
              <select
                value={serviceTypeId}
                onChange={(e) => {
                  setServiceTypeId(e.target.value);
                  void onLoadOptions(e.target.value);
                }}
                className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-200 px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <option value="">Select service type</option>
                {serviceTypeOptions.map((option) => (
                  <option key={option.serviceTypeId} value={String(option.serviceTypeId)}>
                    {option.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={serviceTypeId}
                onChange={(e) => setServiceTypeId(e.target.value)}
                className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-200 px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              />
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => void onLoadOptions(serviceTypeId)}
              className="h-11 rounded-xl border border-zinc-200 px-3 text-sm disabled:opacity-50 dark:border-zinc-800"
            >
              {busy ? "Refreshing..." : "Refresh plans"}
            </button>
          </div>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{serviceTypeHint}</span>
        </label>
      ) : null}
    </>
  );
}
