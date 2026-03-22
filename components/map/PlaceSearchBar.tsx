"use client";

import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { searchPlaces, type PlaceSearchResult } from "@/lib/mapbox/placeSearch";
import { cn } from "@/lib/utils/cn";

type SearchStatus = "idle" | "loading" | "ready" | "empty" | "error";

interface PlaceSearchBarProps {
  selectedPlace?: PlaceSearchResult | null;
  onPlaceSelect: (place: PlaceSearchResult) => void;
  onClear?: () => void;
  compact?: boolean;
  className?: string;
}

const SEARCH_DEBOUNCE_MS = 240;

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={className}>
      <circle cx="8.5" cy="8.5" r="5.75" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="m12.8 12.8 4.1 4.1" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </svg>
  );
}

function ClearIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={className}>
      <path d="m5.5 5.5 9 9" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
      <path d="m14.5 5.5-9 9" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </svg>
  );
}

function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("animate-spin", className)}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.16" strokeWidth="2.5" />
      <path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" />
    </svg>
  );
}

export function PlaceSearchBar({
  selectedPlace = null,
  onPlaceSelect,
  onClear,
  compact = false,
  className
}: PlaceSearchBarProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const blurTimeoutRef = useRef<number | null>(null);
  const listboxId = useId();
  const [draftQuery, setDraftQuery] = useState(selectedPlace?.fullName ?? "");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [keyboardFocusedIndex, setKeyboardFocusedIndex] = useState(-1);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(selectedPlace?.id ?? null);
  const [isFocused, setIsFocused] = useState(false);

  const trimmedDraftQuery = draftQuery.trim();
  const showDropdown =
    isFocused &&
    (results.length > 0 ||
      (trimmedDraftQuery.length >= 2 &&
        (searchStatus === "loading" || searchStatus === "empty" || searchStatus === "error")));

  useEffect(() => {
    setDraftQuery(selectedPlace?.fullName ?? "");
    setSelectedResultId(selectedPlace?.id ?? null);
  }, [selectedPlace?.fullName, selectedPlace?.id]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (blurTimeoutRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    abortRef.current?.abort();

    if (trimmedDraftQuery.length < 2) {
      setResults([]);
      setSearchStatus("idle");
      setHoveredIndex(null);
      setKeyboardFocusedIndex(-1);
      return;
    }

    let controller: AbortController | null = null;
    const timeoutId = window.setTimeout(() => {
      controller = new AbortController();
      abortRef.current = controller;
      setSearchStatus("loading");
      setResults([]);
      setHoveredIndex(null);
      setKeyboardFocusedIndex(-1);

      void searchPlaces(trimmedDraftQuery, controller.signal)
        .then((nextResults) => {
          if (controller?.signal.aborted) {
            return;
          }

          setResults(nextResults);
          setSearchStatus(nextResults.length > 0 ? "ready" : "empty");
          setHoveredIndex(null);
          setKeyboardFocusedIndex(-1);
        })
        .catch((error) => {
          if (controller?.signal.aborted) {
            return;
          }

          console.warn("[Poopin] Place search failed.", error);
          setResults([]);
          setSearchStatus("error");
          setHoveredIndex(null);
          setKeyboardFocusedIndex(-1);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
      controller?.abort();
    };
  }, [isFocused, trimmedDraftQuery]);

  const cancelScheduledClose = () => {
    if (blurTimeoutRef.current === null || typeof window === "undefined") {
      return;
    }

    window.clearTimeout(blurTimeoutRef.current);
    blurTimeoutRef.current = null;
  };

  const scheduleClose = () => {
    if (typeof window === "undefined") {
      setIsFocused(false);
      return;
    }

    cancelScheduledClose();
    blurTimeoutRef.current = window.setTimeout(() => {
      blurTimeoutRef.current = null;
      setIsFocused(false);
    }, 110);
  };

  const handleSelect = (result: PlaceSearchResult) => {
    cancelScheduledClose();
    abortRef.current?.abort();
    setDraftQuery(result.fullName);
    setResults([]);
    setSearchStatus("idle");
    setHoveredIndex(null);
    setKeyboardFocusedIndex(-1);
    setSelectedResultId(result.id);
    onPlaceSelect(result);
    setIsFocused(false);
    inputRef.current?.blur();
  };

  const handleClear = () => {
    cancelScheduledClose();
    abortRef.current?.abort();
    setDraftQuery("");
    setResults([]);
    setSearchStatus("idle");
    setHoveredIndex(null);
    setKeyboardFocusedIndex(-1);
    setSelectedResultId(null);
    onClear?.();
    setIsFocused(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      if (results.length === 0) {
        return;
      }

      event.preventDefault();
      setHoveredIndex(null);
      setKeyboardFocusedIndex((current) => (current < 0 || current >= results.length - 1 ? 0 : current + 1));
      return;
    }

    if (event.key === "ArrowUp") {
      if (results.length === 0) {
        return;
      }

      event.preventDefault();
      setHoveredIndex(null);
      setKeyboardFocusedIndex((current) => (current <= 0 ? results.length - 1 : current - 1));
      return;
    }

    if (event.key === "Enter") {
      const activeIndex = hoveredIndex ?? keyboardFocusedIndex;
      const highlightedResult = activeIndex >= 0 ? results[activeIndex] : null;
      if (!highlightedResult) {
        return;
      }

      event.preventDefault();
      handleSelect(highlightedResult);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelScheduledClose();
      setIsFocused(false);
      inputRef.current?.blur();
    }
  };

  const activeDescendantId = keyboardFocusedIndex >= 0 ? `${listboxId}-option-${keyboardFocusedIndex}` : undefined;

  return (
    <div className={cn("relative min-w-0", className)}>
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border border-slate-200/90 bg-white/95 shadow-[0_10px_28px_rgba(15,23,42,0.08)] transition focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-100/70",
          compact ? "min-h-[44px] px-3 py-2" : "min-h-[50px] px-3.5 py-2.5 sm:min-h-[48px]"
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-lg bg-slate-100/90 text-slate-400",
            compact ? "h-[30px] w-[30px]" : "h-9 w-9"
          )}
        >
          <SearchIcon className={cn(compact ? "h-4 w-4" : "h-[18px] w-[18px]")} />
        </div>

        <div className="min-w-0 flex-1">
          <label htmlFor={listboxId} className="sr-only">
            Search a city, neighborhood, or address
          </label>
          <input
            id={listboxId}
            ref={inputRef}
            type="search"
            role="combobox"
            inputMode="search"
            enterKeyHint="search"
            value={draftQuery}
            autoComplete="off"
            spellCheck={false}
            placeholder="Search a city, neighborhood, or address"
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-controls={showDropdown ? `${listboxId}-listbox` : undefined}
            aria-activedescendant={showDropdown ? activeDescendantId : undefined}
            aria-expanded={showDropdown}
            onChange={(event) => {
              setDraftQuery(event.target.value);
              setResults([]);
              setSearchStatus("idle");
              setHoveredIndex(null);
              setKeyboardFocusedIndex(-1);
            }}
            onFocus={() => {
              cancelScheduledClose();
              setIsFocused(true);
            }}
            onBlur={scheduleClose}
            onKeyDown={handleKeyDown}
            className={cn(
              "w-full border-0 bg-transparent p-0 text-slate-900 outline-none placeholder:text-slate-400",
              compact ? "text-base sm:text-sm" : "text-base sm:text-[15px]"
            )}
          />
        </div>

        {searchStatus === "loading" ? <LoadingSpinner className="h-4 w-4 shrink-0 text-slate-400" /> : null}

        {draftQuery ? (
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 sm:h-9 sm:w-9"
            aria-label="Clear search"
          >
            <ClearIcon className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {showDropdown ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-[90] overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_20px_48px_rgba(15,23,42,0.18)]">
          {results.length > 0 ? (
            <ul id={`${listboxId}-listbox`} role="listbox" className="max-h-[min(280px,36svh)] space-y-1 overflow-y-auto overscroll-contain">
              {results.map((result, index) => {
                const isHovered = index === hoveredIndex;
                const isKeyboardFocused = index === keyboardFocusedIndex;
                const isHighlighted = isHovered || isKeyboardFocused;
                return (
                  <li key={result.id} id={`${listboxId}-option-${index}`} role="option" aria-selected={isHighlighted}>
                    <button
                      type="button"
                      onMouseEnter={() => setHoveredIndex(index)}
                      onMouseLeave={() => setHoveredIndex((current) => (current === index ? null : current))}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        handleSelect(result);
                      }}
                      className={cn(
                        "flex min-h-[46px] w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition",
                        isHighlighted ? "bg-slate-900 text-white" : "text-slate-900 hover:bg-slate-50"
                      )}
                      data-selected-result={selectedResultId === result.id ? "true" : "false"}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{result.name}</p>
                        {result.secondaryName ? (
                          <p className={cn("mt-0.5 truncate text-xs", isHighlighted ? "text-slate-200" : "text-slate-500")}>{result.secondaryName}</p>
                        ) : null}
                      </div>
                      <span className={cn("shrink-0 text-[11px] font-medium", isHighlighted ? "text-slate-200" : "text-slate-400")}>
                        {result.placeType === "unknown" ? "Place" : result.placeType.replaceAll("_", " ")}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : searchStatus === "loading" ? (
            <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-slate-500">
              <LoadingSpinner className="h-3.5 w-3.5 text-slate-400" />
              <span>Searching…</span>
            </div>
          ) : searchStatus === "error" ? (
            <div className="px-3 py-2.5 text-xs text-slate-500">Search is temporarily unavailable.</div>
          ) : (
            <div className="px-3 py-2.5 text-xs text-slate-500">No matches found.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
