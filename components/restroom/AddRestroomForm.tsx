"use client";

import { type ReactNode, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  BathroomCreateInput,
  bathroomAccessTypeOptions,
  bathroomCreateSchema,
  bathroomPlaceTypeOptions
} from "@/lib/validations/bathroom";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { insertBathroom, toAddRestroomErrorMessage } from "@/lib/supabase/bathrooms";

const placeTypeLabel: Record<(typeof bathroomPlaceTypeOptions)[number], string> = {
  park: "Park",
  restaurant: "Restaurant",
  cafe: "Cafe",
  mall: "Mall",
  transit_station: "Transit station",
  library: "Library",
  gym: "Gym",
  office: "Office",
  other: "Other"
};

const accessTypeLabel: Record<(typeof bathroomAccessTypeOptions)[number], string> = {
  public: "Public",
  customer_only: "Customer only",
  code_required: "Code required",
  staff_assisted: "Staff assisted"
};

const defaultValues: BathroomCreateInput = {
  name: "",
  place_type: "other",
  address: "",
  city: "",
  state: "",
  lat: 37.7749,
  lng: -122.4194,
  access_type: "public",
  has_baby_station: false,
  is_gender_neutral: false,
  is_accessible: true,
  requires_purchase: false
};

interface FieldProps {
  label: string;
  htmlFor: keyof BathroomCreateInput;
  error?: string;
  children: ReactNode;
}

function Field({ label, htmlFor, error, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs font-medium text-rose-600">{error}</p> : null}
    </div>
  );
}

export function AddRestroomForm() {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccessId, setSubmitSuccessId] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const router = useRouter();
  const supabaseClient = useMemo(() => getSupabaseBrowserClient(), []);
  const isSupabaseConfigured = Boolean(supabaseClient);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<BathroomCreateInput>({
    resolver: zodResolver(bathroomCreateSchema),
    defaultValues
  });

  const onSubmit = async (values: BathroomCreateInput) => {
    setSubmitError(null);
    setSubmitSuccessId(null);
    setIsRedirecting(false);

    if (!supabaseClient) {
      setSubmitError("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }

    try {
      const result = await insertBathroom(supabaseClient, values);

      console.groupCollapsed("[Poopin] add-restroom payload (supabase)");
      console.log("Payload inserted:", values);
      console.log("Supabase insert result:", result);
      console.groupEnd();

      if (result.canReadDetail) {
        setSubmitSuccessId(result.bathroomId);
        setIsRedirecting(true);
        router.push(`/restroom/${result.bathroomId}`);
        return;
      }

      setSubmitSuccessId(result.bathroomId);
      reset({ ...defaultValues, city: values.city, state: values.state, lat: values.lat, lng: values.lng });
    } catch (error) {
      console.error("[Poopin] add-restroom insert failed", error);
      setSubmitError(toAddRestroomErrorMessage(error));
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">Submit A Restroom</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Add a restroom</h1>
        <p className="mt-2 text-sm text-slate-600">
          This form inserts directly into Supabase `bathrooms` when configured.
        </p>
      </div>

      {!isSupabaseConfigured ? (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Supabase environment variables are missing, so insert is unavailable until configured.
        </div>
      ) : (
        <div className="mb-5 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">
          Supabase is configured. New restroom submissions will be inserted into the `bathrooms` table.
        </div>
      )}

      {submitError ? (
        <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{submitError}</div>
      ) : null}

      {submitSuccessId ? (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-700">
            {isRedirecting ? "Restroom submitted. Redirecting to detail..." : "Restroom submitted successfully."}
          </p>
          <p className="mt-1 text-xs text-emerald-700">
            Restroom id: <span className="font-semibold">{submitSuccessId}</span>
          </p>

          {!isRedirecting ? (
            <p className="mt-2 text-xs text-emerald-700">
              Insert succeeded, but automatic detail redirect was skipped because read access could not be confirmed.
            </p>
          ) : null}

          <Link
            href={`/restroom/${submitSuccessId}`}
            className="mt-3 inline-flex rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            Open restroom detail
          </Link>
        </div>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Name" htmlFor="name" error={errors.name?.message}>
          <input
            id="name"
            {...register("name")}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            placeholder="Downtown Civic Center Restroom"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Place type" htmlFor="place_type" error={errors.place_type?.message}>
            <select
              id="place_type"
              {...register("place_type")}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              {bathroomPlaceTypeOptions.map((value) => (
                <option key={value} value={value}>
                  {placeTypeLabel[value]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Access type" htmlFor="access_type" error={errors.access_type?.message}>
            <select
              id="access_type"
              {...register("access_type")}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              {bathroomAccessTypeOptions.map((value) => (
                <option key={value} value={value}>
                  {accessTypeLabel[value]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Address" htmlFor="address" error={errors.address?.message}>
          <input
            id="address"
            {...register("address")}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            placeholder="123 Main St"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City" htmlFor="city" error={errors.city?.message}>
            <input
              id="city"
              {...register("city")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              placeholder="San Francisco"
            />
          </Field>

          <Field label="State" htmlFor="state" error={errors.state?.message}>
            <input
              id="state"
              {...register("state")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              placeholder="CA"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Latitude" htmlFor="lat" error={errors.lat?.message}>
            <input
              id="lat"
              type="number"
              step="any"
              {...register("lat", {
                setValueAs: (value) => (value === "" ? undefined : Number(value))
              })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              placeholder="37.7749"
            />
          </Field>

          <Field label="Longitude" htmlFor="lng" error={errors.lng?.message}>
            <input
              id="lng"
              type="number"
              step="any"
              {...register("lng", {
                setValueAs: (value) => (value === "" ? undefined : Number(value))
              })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              placeholder="-122.4194"
            />
          </Field>
        </div>

        <fieldset className="rounded-xl border border-slate-200 p-4">
          <legend className="px-1 text-sm font-semibold text-slate-700">Amenities and access</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" {...register("has_baby_station")} className="h-4 w-4 rounded border-slate-300" />
              Has baby station
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" {...register("is_gender_neutral")} className="h-4 w-4 rounded border-slate-300" />
              Gender neutral
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" {...register("is_accessible")} className="h-4 w-4 rounded border-slate-300" />
              Accessible
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" {...register("requires_purchase")} className="h-4 w-4 rounded border-slate-300" />
              Requires purchase
            </label>
          </div>
        </fieldset>

        <div className="flex flex-col gap-2 pt-1 sm:flex-row">
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Submitting..." : "Submit restroom"}
          </button>
          <button
            type="button"
            onClick={() => {
              reset(defaultValues);
              setSubmitError(null);
              setSubmitSuccessId(null);
              setIsRedirecting(false);
            }}
            disabled={isSubmitting}
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Reset
          </button>
        </div>
      </form>
    </section>
  );
}
