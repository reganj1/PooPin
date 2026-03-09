import { NearbyBathroom } from "@/types";

interface RestroomTagsProps {
  restroom: NearbyBathroom;
}

const accessTypeLabel: Record<NearbyBathroom["access_type"], string> = {
  public: "Public",
  customer_only: "Customer only",
  code_required: "Code required",
  staff_assisted: "Ask staff"
};

const baseTagClass =
  "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium";

export function RestroomTags({ restroom }: RestroomTagsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className={`${baseTagClass} border-slate-300 bg-slate-100 text-slate-700`}>{accessTypeLabel[restroom.access_type]}</span>
      {restroom.is_accessible && (
        <span className={`${baseTagClass} border-emerald-200 bg-emerald-50 text-emerald-700`}>Accessible</span>
      )}
      {restroom.is_gender_neutral && (
        <span className={`${baseTagClass} border-indigo-200 bg-indigo-50 text-indigo-700`}>Gender neutral</span>
      )}
      {restroom.has_baby_station && (
        <span className={`${baseTagClass} border-amber-200 bg-amber-50 text-amber-700`}>Baby station</span>
      )}
      {restroom.requires_purchase && (
        <span className={`${baseTagClass} border-rose-200 bg-rose-50 text-rose-700`}>Purchase required</span>
      )}
    </div>
  );
}
