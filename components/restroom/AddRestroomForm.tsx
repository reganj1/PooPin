"use client";

import { type ReactNode, useCallback, useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { LocationPickerMap } from "@/components/map/LocationPickerMap";
import {
  BathroomCreateInput,
  bathroomAccessTypeOptions,
  bathroomCreateSchema,
  bathroomPlaceTypeOptions
} from "@/lib/validations/bathroom";

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
  state: "CA",
  lat: 37.7749,
  lng: -122.4194,
  access_type: "public",
  has_baby_station: false,
  is_gender_neutral: false,
  is_accessible: true,
  requires_purchase: false
};

const SUBMISSION_COOLDOWN_MS = 60_000;
const LAST_SUBMISSION_STORAGE_KEY = "poopin:add-restroom:last-submit-at";

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
}

interface SubmitRestroomResponse {
  success?: boolean;
  bathroomId?: string | null;
  status?: string | null;
  error?: string;
  duplicateBathroomId?: string | null;
  fieldErrors?: Partial<Record<keyof BathroomCreateInput, string[]>>;
}

type ServerFieldErrors = Partial<Record<keyof BathroomCreateInput, string>>;

const toFirstFieldErrors = (
  fieldErrors: Partial<Record<keyof BathroomCreateInput, string[]>> | undefined
): ServerFieldErrors => {
  if (!fieldErrors) {
    return {};
  }

  const nextErrors: ServerFieldErrors = {};
  for (const [key, value] of Object.entries(fieldErrors)) {
    const firstError = value?.[0];
    if (firstError) {
      nextErrors[key as keyof BathroomCreateInput] = firstError;
    }
  }

  return nextErrors;
};

const getClientCooldownRemainingMs = () => {
  if (typeof window === "undefined") {
    return 0;
  }

  const raw = window.localStorage.getItem(LAST_SUBMISSION_STORAGE_KEY);
  const previousTimestamp = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(previousTimestamp)) {
    return 0;
  }

  const elapsed = Date.now() - previousTimestamp;
  return Math.max(0, SUBMISSION_COOLDOWN_MS - elapsed);
};

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
  const [duplicateBathroomId, setDuplicateBathroomId] = useState<string | null>(null);
  const [showCoordinates, setShowCoordinates] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [serverFieldErrors, setServerFieldErrors] = useState<ServerFieldErrors>({});

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<BathroomCreateInput>({
    resolver: zodResolver(bathroomCreateSchema),
    defaultValues
  });

  const lat = watch("lat");
  const lng = watch("lng");
  const getFieldError = (field: keyof BathroomCreateInput) => errors[field]?.message ?? serverFieldErrors[field];
  const hasAdvancedLocationError = Boolean(getFieldError("lat") || getFieldError("lng"));

  const handleCoordinatesChange = useCallback(
    (coordinates: { lat: number; lng: number }) => {
      setValue("lat", coordinates.lat, { shouldDirty: true, shouldValidate: true });
      setValue("lng", coordinates.lng, { shouldDirty: true, shouldValidate: true });
      setSubmitError(null);
    },
    [setValue]
  );

  const handleUseMyLocation = () => {
    setSubmitError(null);

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setSubmitError("Location access is unavailable in this browser.");
      return;
    }

    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        handleCoordinatesChange({
          lat: Number(position.coords.latitude.toFixed(6)),
          lng: Number(position.coords.longitude.toFixed(6))
        });
        setIsLocating(false);
      },
      () => {
        setSubmitError("Could not get your location. You can still drop a pin on the map or enter an address.");
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  };

  const onSubmit = async (values: BathroomCreateInput) => {
    setSubmitError(null);
    setServerFieldErrors({});
    setSubmitSuccessId(null);
    setDuplicateBathroomId(null);

    const clientCooldownRemainingMs = getClientCooldownRemainingMs();
    if (clientCooldownRemainingMs > 0) {
      setSubmitError(`Please wait ${Math.ceil(clientCooldownRemainingMs / 1000)} seconds before submitting again.`);
      return;
    }

    try {
      const response = await fetch("/api/restrooms/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(values)
      });

      const payload = (await response.json()) as SubmitRestroomResponse;

      console.groupCollapsed("[Poopin] restroom submission");
      console.log("Submitted payload:", values);
      console.log("API response:", payload);
      console.groupEnd();

      if (!response.ok) {
        setServerFieldErrors(toFirstFieldErrors(payload.fieldErrors));
        setSubmitError(payload.error ?? "Could not submit this restroom right now. Please try again.");
        if (payload.duplicateBathroomId) {
          setDuplicateBathroomId(payload.duplicateBathroomId);
        }
        return;
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem(LAST_SUBMISSION_STORAGE_KEY, String(Date.now()));
      }

      setSubmitSuccessId(payload.bathroomId ?? null);
      reset({
        ...defaultValues,
        city: values.city,
        state: values.state
      });
      setShowCoordinates(false);
    } catch {
      setSubmitError("Could not submit this restroom right now. Please check your connection and try again.");
    }
  };

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card sm:p-7">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">Bay Area Beta</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-[2.05rem]">Submit a restroom</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Help people find reliable restrooms faster. Community submissions may be reviewed before appearing publicly.
        </p>
      </div>

      <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        To protect listing quality, submissions are limited to one per minute per device.
      </div>

      {submitError ? (
        <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{submitError}</div>
      ) : null}

      {submitSuccessId ? (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-700">Thanks, your restroom submission was received.</p>
          <p className="mt-1 text-xs text-emerald-700">Our team may review it before it appears in public results.</p>
          <p className="mt-1 text-xs text-emerald-700">
            Submission reference: <span className="font-semibold">{submitSuccessId}</span>
          </p>
          <Link
            href="/"
            className="mt-3 inline-flex rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            Back to map
          </Link>
        </div>
      ) : null}

      {duplicateBathroomId ? (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">A similar restroom already appears nearby.</p>
          <Link
            href={`/restroom/${duplicateBathroomId}`}
            className="mt-2 inline-flex rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
          >
            View existing listing
          </Link>
        </div>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
        <section className="rounded-2xl border border-slate-200 p-4 sm:p-5">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 1</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">Choose location</h2>
            <p className="mt-1 text-sm text-slate-600">Use your location, drop a pin, or add an address as backup context.</p>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleUseMyLocation}
              disabled={isLocating || isSubmitting}
              className="inline-flex rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLocating ? "Locating..." : "Use my current location"}
            </button>
            <p className="text-xs text-slate-500">Then tap the map to place your pin.</p>
          </div>

          <LocationPickerMap
            coordinates={{
              lat: typeof lat === "number" ? lat : defaultValues.lat,
              lng: typeof lng === "number" ? lng : defaultValues.lng
            }}
            onCoordinatesChange={handleCoordinatesChange}
          />

          <p className="mt-2 text-xs text-slate-500">
            Pin location: {typeof lat === "number" ? lat.toFixed(6) : defaultValues.lat.toFixed(6)},{" "}
            {typeof lng === "number" ? lng.toFixed(6) : defaultValues.lng.toFixed(6)}
          </p>

          <div className="mt-4 space-y-4">
            <Field label="Street address (fallback)" htmlFor="address" error={getFieldError("address")}>
              <input
                id="address"
                {...register("address")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                placeholder="123 Market St"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="City" htmlFor="city" error={getFieldError("city")}>
                <input
                  id="city"
                  {...register("city")}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  placeholder="San Francisco"
                />
              </Field>

              <Field label="State" htmlFor="state" error={getFieldError("state")}>
                <input
                  id="state"
                  {...register("state")}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  placeholder="CA"
                  maxLength={30}
                />
              </Field>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <button
              type="button"
              onClick={() => setShowCoordinates((current) => !current)}
              className="inline-flex w-fit rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              {showCoordinates ? "Hide advanced location" : "Fine-tune location (advanced)"}
            </button>

            {showCoordinates ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Latitude" htmlFor="lat" error={getFieldError("lat")}>
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

                <Field label="Longitude" htmlFor="lng" error={getFieldError("lng")}>
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
            ) : hasAdvancedLocationError ? (
              <p className="mt-2 text-xs font-medium text-rose-600">
                Please open advanced location to fix latitude/longitude values.
              </p>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 p-4 sm:p-5">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 2</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">Add restroom details</h2>
          </div>

          <div className="space-y-4">
            <Field label="Listing name" htmlFor="name" error={getFieldError("name")}>
              <input
                id="name"
                {...register("name")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                placeholder="Civic Center Plaza Restroom"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Place type" htmlFor="place_type" error={getFieldError("place_type")}>
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

              <Field label="Access type" htmlFor="access_type" error={getFieldError("access_type")}>
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
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 3</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">Submit for review</h2>
            <p className="mt-1 text-sm text-slate-600">
              Submissions, photos, and reviews may be reviewed before appearing publicly to help keep listings
              trustworthy.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
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
                setServerFieldErrors({});
                setSubmitSuccessId(null);
                setDuplicateBathroomId(null);
                setShowCoordinates(false);
              }}
              disabled={isSubmitting}
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Reset
            </button>
          </div>
        </section>
      </form>
    </section>
  );
}
