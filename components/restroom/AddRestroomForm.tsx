"use client";

import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { LocationPickerMap } from "@/components/map/LocationPickerMap";
import { captureAnalyticsEvent } from "@/lib/analytics/posthog";
import { forwardGeocodeAddress } from "@/lib/mapbox/forwardGeocode";
import { reverseGeocodeCoordinates } from "@/lib/mapbox/reverseGeocode";
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
const DEFAULT_COORDINATES = {
  lat: defaultValues.lat,
  lng: defaultValues.lng
};

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
type LocationFeedbackTone = "info" | "loading" | "success" | "warning";

interface LocationFeedback {
  tone: LocationFeedbackTone;
  title: string;
  message: string;
}

interface AddRestroomFormProps {
  viewerDisplayName: string;
}

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

const inputClassName =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const selectClassName =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const secondaryButtonClassName =
  "inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60";
const loadingSpinnerClassName = "h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent";

const getLocationFeedbackStyles = (tone: LocationFeedbackTone) => {
  switch (tone) {
    case "loading":
      return {
        container: "border-brand-200 bg-brand-50 text-brand-900",
        badge: "bg-brand-100 text-brand-700"
      };
    case "success":
      return {
        container: "border-emerald-200 bg-emerald-50 text-emerald-900",
        badge: "bg-emerald-100 text-emerald-700"
      };
    case "warning":
      return {
        container: "border-amber-200 bg-amber-50 text-amber-900",
        badge: "bg-amber-100 text-amber-700"
      };
    default:
      return {
        container: "border-slate-200 bg-slate-50 text-slate-900",
        badge: "bg-white text-slate-600"
      };
  }
};

function Field({ label, htmlFor, error, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs font-medium text-rose-600">{error}</p> : null}
    </div>
  );
}

export function AddRestroomForm({ viewerDisplayName }: AddRestroomFormProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccessId, setSubmitSuccessId] = useState<string | null>(null);
  const [duplicateBathroomId, setDuplicateBathroomId] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isResolvingFromAddress, setIsResolvingFromAddress] = useState(false);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [locationFeedback, setLocationFeedback] = useState<LocationFeedback | null>(null);
  const [selectedCoordinates, setSelectedCoordinates] = useState(DEFAULT_COORDINATES);
  const [serverFieldErrors, setServerFieldErrors] = useState<ServerFieldErrors>({});
  const reverseGeocodeAbortRef = useRef<AbortController | null>(null);
  const forwardGeocodeAbortRef = useRef<AbortController | null>(null);
  const lastResolvedCoordinateKeyRef = useRef<string>("");
  const hasTrackedAddRestroomStartedRef = useRef(false);

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    setValue,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<BathroomCreateInput>({
    resolver: zodResolver(bathroomCreateSchema),
    defaultValues
  });

  const getFieldError = (field: keyof BathroomCreateInput) => errors[field]?.message ?? serverFieldErrors[field];
  const addressValue = watch("address");
  const cityValue = watch("city");
  const stateValue = watch("state");
  const hasTypedLocation = [addressValue, cityValue, stateValue].some((value) => value.trim().length > 0);
  const locationFeedbackState =
    locationFeedback ??
    ({
      tone: "info",
      title: "Move the pin or type a location",
      message: "The map and address fields stay in sync as you refine the spot."
    } satisfies LocationFeedback);
  const locationFeedbackStyles = getLocationFeedbackStyles(locationFeedbackState.tone);
  const addressLookupButtonLabel =
    isResolvingFromAddress ? "Finding..." : hasTypedLocation ? "Find on map" : "Enter a location first";

  const trackAddRestroomStarted = useCallback(() => {
    if (hasTrackedAddRestroomStartedRef.current) {
      return;
    }

    hasTrackedAddRestroomStartedRef.current = true;
    captureAnalyticsEvent("add_restroom_started", {
      source_surface: "add_restroom_form"
    });
  }, []);

  const resolveAddressFromCoordinates = useCallback(
    async (coordinates: { lat: number; lng: number }) => {
      const coordinateKey = `${coordinates.lat.toFixed(6)}:${coordinates.lng.toFixed(6)}`;
      if (lastResolvedCoordinateKeyRef.current === coordinateKey) {
        return;
      }
      lastResolvedCoordinateKeyRef.current = coordinateKey;

      reverseGeocodeAbortRef.current?.abort();
      const controller = new AbortController();
      reverseGeocodeAbortRef.current = controller;

      setIsResolvingAddress(true);
      setLocationFeedback({
        tone: "loading",
        title: "Updating address",
        message: "Finding the closest street and area for this pin."
      });

      try {
        const geocodeResult = await reverseGeocodeCoordinates(coordinates, controller.signal);
        if (controller.signal.aborted) {
          return;
        }

        if (!geocodeResult) {
          setLocationFeedback({
            tone: "warning",
            title: "Add the details manually",
            message: "We could not fill the address from this pin, but you can still submit it."
          });
          return;
        }

        if (geocodeResult.address) {
          setValue("address", geocodeResult.address, { shouldDirty: true, shouldValidate: true });
        }

        if (geocodeResult.city) {
          setValue("city", geocodeResult.city, { shouldDirty: true, shouldValidate: true });
        }

        if (geocodeResult.state) {
          setValue("state", geocodeResult.state, { shouldDirty: true, shouldValidate: true });
        }

        setLocationFeedback(
          geocodeResult.resolution === "exact_address" || geocodeResult.resolution === "street"
            ? {
                tone: "success",
                title: "Address updated",
                message: "We filled in the nearby address from your pin. Edit anything if needed."
              }
            : {
                tone: "success",
                title: "Area details updated",
                message: "We found the nearby area. Fine-tune anything if needed."
              }
        );
      } catch {
        if (!controller.signal.aborted) {
          setLocationFeedback({
            tone: "warning",
            title: "Could not update the address",
            message: "You can still enter the address details manually and submit the listing."
          });
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsResolvingAddress(false);
        }
      }
    },
    [setValue]
  );

  useEffect(() => {
    return () => {
      reverseGeocodeAbortRef.current?.abort();
      forwardGeocodeAbortRef.current?.abort();
    };
  }, []);

  const applySelectedCoordinates = useCallback(
    (coordinates: { lat: number; lng: number }, options?: { skipReverseGeocode?: boolean }) => {
      setSelectedCoordinates(coordinates);
      setValue("lat", coordinates.lat, { shouldDirty: true, shouldValidate: true });
      setValue("lng", coordinates.lng, { shouldDirty: true, shouldValidate: true });
      setSubmitError(null);
      if (!options?.skipReverseGeocode) {
        void resolveAddressFromCoordinates(coordinates);
      }
    },
    [resolveAddressFromCoordinates, setValue]
  );

  const handleCoordinatesChange = useCallback(
    (coordinates: { lat: number; lng: number }) => {
      trackAddRestroomStarted();
      applySelectedCoordinates(coordinates);
    },
    [applySelectedCoordinates, trackAddRestroomStarted]
  );

  const handleUseMyLocation = () => {
    trackAddRestroomStarted();
    captureAnalyticsEvent("locate_clicked", {
      source_surface: "add_restroom_form",
      status: "requested"
    });
    setSubmitError(null);
    setLocationFeedback({
      tone: "loading",
      title: "Finding your location",
      message: "Dropping the pin where you are now."
    });

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationFeedback({
        tone: "warning",
        title: "Location is unavailable",
        message: "Use the map pin or type an address instead."
      });
      return;
    }

    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        applySelectedCoordinates({
          lat: Number(position.coords.latitude.toFixed(6)),
          lng: Number(position.coords.longitude.toFixed(6))
        });
        setIsLocating(false);
      },
      () => {
        setLocationFeedback({
          tone: "warning",
          title: "Could not find your location",
          message: "Move the pin on the map or type an address instead."
        });
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  };

  const handleAddressLookup = useCallback(async () => {
    trackAddRestroomStarted();
    const address = getValues("address").trim();
    const city = getValues("city").trim();
    const state = getValues("state").trim();
    if (!address && !city && !state) {
      setLocationFeedback({
        tone: "warning",
        title: "Enter a location first",
        message: "Add an address or area, then place the pin from the form."
      });
      return;
    }

    reverseGeocodeAbortRef.current?.abort();
    setIsResolvingAddress(false);
    forwardGeocodeAbortRef.current?.abort();
    const controller = new AbortController();
    forwardGeocodeAbortRef.current = controller;

    setSubmitError(null);
    setIsResolvingFromAddress(true);
    setLocationFeedback({
      tone: "loading",
      title: "Placing the pin",
      message: "Matching your typed location on the map."
    });

    try {
      const lookupResult = await forwardGeocodeAddress(
        {
          address,
          city,
          state
        },
        controller.signal
      );

      if (controller.signal.aborted) {
        return;
      }

      if (!lookupResult) {
        setLocationFeedback({
          tone: "warning",
          title: "Could not place the pin",
          message: "Try a clearer address, or move the pin on the map instead."
        });
        return;
      }

      if (lookupResult.address) {
        setValue("address", lookupResult.address, { shouldDirty: true, shouldValidate: true });
      }
      if (lookupResult.city) {
        setValue("city", lookupResult.city, { shouldDirty: true, shouldValidate: true });
      }
      if (lookupResult.state) {
        setValue("state", lookupResult.state, { shouldDirty: true, shouldValidate: true });
      }

      applySelectedCoordinates(
        {
          lat: lookupResult.lat,
          lng: lookupResult.lng
        },
        { skipReverseGeocode: true }
      );

      setLocationFeedback(
        lookupResult.resolution === "exact_address" || lookupResult.resolution === "street"
          ? {
              tone: "success",
              title: "Pin updated",
              message: "We moved the pin to your address. Drag it if you want to fine-tune the spot."
            }
          : {
              tone: "success",
              title: "Pin updated",
              message: "We found a close match. Move the pin if you want to refine it."
            }
      );
    } catch {
      if (!controller.signal.aborted) {
        setLocationFeedback({
          tone: "warning",
          title: "Could not place the pin",
          message: "Try again, or move the pin on the map to set the location manually."
        });
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsResolvingFromAddress(false);
      }
    }
  }, [applySelectedCoordinates, getValues, setValue, trackAddRestroomStarted]);

  const handleAddressLookupKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter") {
        return;
      }

      event.preventDefault();
      if (isSubmitting || isResolvingFromAddress) {
        return;
      }
      void handleAddressLookup();
    },
    [handleAddressLookup, isResolvingFromAddress, isSubmitting]
  );

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

      if (payload.bathroomId && payload.status) {
        captureAnalyticsEvent("restroom_submitted", {
          bathroom_id: payload.bathroomId,
          status: payload.status,
          source_surface: "add_restroom_form"
        });
      }

      setSubmitSuccessId(payload.bathroomId ?? null);
      reset({
        ...defaultValues,
        city: values.city,
        state: values.state
      });
      reverseGeocodeAbortRef.current?.abort();
      forwardGeocodeAbortRef.current?.abort();
      setIsResolvingAddress(false);
      setIsResolvingFromAddress(false);
      setSelectedCoordinates(DEFAULT_COORDINATES);
      setLocationFeedback(null);
      lastResolvedCoordinateKeyRef.current = "";
    } catch {
      setSubmitError("Could not submit this restroom right now. Please check your connection and try again.");
    }
  };

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card sm:p-7">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">California beta</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-[2.05rem]">Submit a restroom</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Drop a pin, fill in a few details, and send it in. We review submissions before they appear publicly.
        </p>
        <p className="mt-2 text-sm font-medium text-slate-500">Submitting as {viewerDisplayName}.</p>
      </div>

      <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
        Submissions are reviewed so the map stays accurate. Each device can send one restroom per minute.
      </div>

      {submitError ? (
        <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{submitError}</div>
      ) : null}

      {submitSuccessId ? (
        <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5">
          <p className="text-sm font-semibold text-emerald-700">Thanks. Your restroom was submitted for review.</p>
          <p className="mt-1 text-sm text-emerald-700">If everything looks right, it should show up on the map soon.</p>
          <p className="mt-1 text-xs text-emerald-700">
            Submission reference: <span className="font-semibold">{submitSuccessId}</span>
          </p>
          <Link
            href="/"
            className="mt-3 inline-flex rounded-xl border border-emerald-300 bg-white px-3.5 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            Back to map
          </Link>
        </div>
      ) : null}

      {duplicateBathroomId ? (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
          <p className="text-sm font-semibold text-amber-800">This spot may already be on the map.</p>
          <p className="mt-1 text-sm text-amber-800">Check the nearby listing before sending a duplicate.</p>
          <Link
            href={`/restroom/${duplicateBathroomId}`}
            className="mt-3 inline-flex rounded-xl border border-amber-300 bg-white px-3.5 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100"
          >
            View existing listing
          </Link>
        </div>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} onFocusCapture={trackAddRestroomStarted} className="space-y-5 sm:space-y-6" noValidate>
        <section className="rounded-2xl border border-slate-200 p-4 sm:p-5 lg:p-6">
          <div className="mb-4 sm:mb-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 1</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">Choose location</h2>
            <p className="mt-1 text-sm text-slate-600">Move the pin or enter a location. The map and address fields stay in sync.</p>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.12fr)_minmax(320px,0.88fr)]">
            <div className="space-y-3">
              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Pin location</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Tap the map or drag the pin to the right spot.</p>
                </div>
                <button
                  type="button"
                  onClick={handleUseMyLocation}
                  disabled={isLocating || isSubmitting || isResolvingFromAddress}
                  className={`${secondaryButtonClassName} min-h-[44px] w-full sm:w-auto`}
                >
                  {isLocating ? (
                    <span className="inline-flex items-center gap-2">
                      <span className={loadingSpinnerClassName} />
                      Finding you
                    </span>
                  ) : (
                    "Use my location"
                  )}
                </button>
              </div>

              <LocationPickerMap
                coordinates={selectedCoordinates}
                onCoordinatesChange={handleCoordinatesChange}
                className="shadow-sm"
              />

              <div
                aria-live="polite"
                className={`rounded-2xl border px-4 py-3 ${locationFeedbackStyles.container}`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${locationFeedbackStyles.badge}`}
                  >
                    {locationFeedbackState.tone === "loading"
                      ? "Updating"
                      : locationFeedbackState.tone === "success"
                        ? "Ready"
                        : locationFeedbackState.tone === "warning"
                          ? "Check"
                          : "Tip"}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{locationFeedbackState.title}</p>
                    <p className="mt-1 text-xs leading-5 opacity-90">{locationFeedbackState.message}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <div className="mb-4">
                <p className="text-sm font-semibold text-slate-900">Type a location</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">Enter an address or area and we will move the pin for you.</p>
              </div>

              <div className="space-y-3">
                <Field label="Address" htmlFor="address" error={getFieldError("address")}>
                  <input
                    id="address"
                    {...register("address")}
                    onKeyDown={handleAddressLookupKeyDown}
                    className={inputClassName}
                    placeholder="123 Market St"
                  />
                </Field>

                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_112px]">
                  <Field label="City" htmlFor="city" error={getFieldError("city")}>
                    <input
                      id="city"
                      {...register("city")}
                      onKeyDown={handleAddressLookupKeyDown}
                      className={inputClassName}
                      placeholder="San Francisco"
                    />
                  </Field>

                  <Field label="State" htmlFor="state" error={getFieldError("state")}>
                    <input
                      id="state"
                      {...register("state")}
                      onKeyDown={handleAddressLookupKeyDown}
                      className={`${inputClassName} uppercase`}
                      placeholder="CA"
                      maxLength={30}
                    />
                  </Field>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void handleAddressLookup();
                  }}
                  disabled={!hasTypedLocation || isSubmitting || isResolvingAddress || isResolvingFromAddress}
                  className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {addressLookupButtonLabel}
                </button>
                <p className="text-xs leading-5 text-slate-500">Press Enter or tap the button to update the pin.</p>
              </div>
            </div>
          </div>

          <input type="hidden" {...register("lat", { valueAsNumber: true })} />
          <input type="hidden" {...register("lng", { valueAsNumber: true })} />
        </section>

        <section className="rounded-2xl border border-slate-200 p-4 sm:p-5 lg:p-6">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 2</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">Add restroom details</h2>
            <p className="mt-1 text-sm text-slate-600">Add the basics so people can recognize the spot quickly.</p>
          </div>

          <div className="space-y-4">
            <Field label="Restroom name" htmlFor="name" error={getFieldError("name")}>
              <input
                id="name"
                {...register("name")}
                className={inputClassName}
                placeholder="Civic Center Plaza Restroom"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Place type" htmlFor="place_type" error={getFieldError("place_type")}>
                <select
                  id="place_type"
                  {...register("place_type")}
                  className={selectClassName}
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
                  className={selectClassName}
                >
                  {bathroomAccessTypeOptions.map((value) => (
                    <option key={value} value={value}>
                      {accessTypeLabel[value]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <fieldset className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
              <legend className="px-1 text-sm font-semibold text-slate-700">Amenities and access</legend>
              <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
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

        <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5 lg:p-6">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 3</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">Submit for review</h2>
            <p className="mt-1 text-sm text-slate-600">
              We review new listings before they go live so the map stays useful and trustworthy.
            </p>
          </div>

          <div className="mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs leading-5 text-slate-600">
            After you submit, we review the listing before it appears publicly. Photos added later may be reviewed too.
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Submitting..." : "Submit restroom"}
            </button>
            <button
              type="button"
              onClick={() => {
                reverseGeocodeAbortRef.current?.abort();
                forwardGeocodeAbortRef.current?.abort();
                reset(defaultValues);
                setSubmitError(null);
                setServerFieldErrors({});
                setSubmitSuccessId(null);
                setDuplicateBathroomId(null);
                setIsResolvingAddress(false);
                setIsResolvingFromAddress(false);
                setSelectedCoordinates(DEFAULT_COORDINATES);
                setLocationFeedback(null);
                lastResolvedCoordinateKeyRef.current = "";
              }}
              disabled={isSubmitting}
              className={`${secondaryButtonClassName} min-h-[44px]`}
            >
              Reset
            </button>
          </div>
        </section>
      </form>
    </section>
  );
}
