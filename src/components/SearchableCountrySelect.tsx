import React, { useState, useRef, useEffect, useMemo } from "react";
import { Search, ChevronDown, Check, X, Globe } from "lucide-react";
import { COUNTRIES, CountryOption } from "../constants/countries";

export type FieldState = "idle" | "ok" | "err";

interface SearchableCountrySelectProps {
  label?: string;
  required?: boolean;
  value: string;
  onChange: (countryName: string) => void;
  state?: FieldState;
  placeholder?: string;
  className?: string;
}

export const SearchableCountrySelect: React.FC<SearchableCountrySelectProps> = ({
  label = "Country",
  required = false,
  value,
  onChange,
  state = "idle",
  placeholder = "Choose country",
  className = ""
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedCountry = useMemo<CountryOption | undefined>(() => {
    if (!value || value === "Choose Country" || value === "Select Country") return undefined;
    return COUNTRIES.find(
      (c) => c.name.toLowerCase() === value.toLowerCase() || c.code.toLowerCase() === value.toLowerCase()
    );
  }, [value]);

  const filteredCountries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return COUNTRIES;
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.code.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  // Handle clicking outside to close
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isOpen]);

  // Focus search input on open
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus({ preventScroll: true });
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setSearchQuery("");
    }
  }, [isOpen]);

  const handleSelect = (country: CountryOption) => {
    onChange(country.name);
    setIsOpen(false);
    setSearchQuery("");
  };

  const getBorderColor = () => {
    if (isOpen) return "border-orbit-accent ring-1 ring-orbit-accent/40";
    if (state === "ok") return "border-orbit-green/60";
    if (state === "err") return "border-orbit-red/60";
    return "border-orbit-border hover:border-zinc-700";
  };

  return (
    <div className={`space-y-1.5 relative ${className}`} ref={containerRef}>
      {label && (
        <label className="text-[11px] uppercase font-subheading tracking-wider text-orbit-gray-text block">
          {label}
          {required && <span className="text-orbit-accent ml-0.5">*</span>}
        </label>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`w-full flex items-center justify-between rounded-xl bg-orbit-bg border px-4 py-3 text-sm text-left transition-all duration-150 cursor-pointer ${getBorderColor()}`}
      >
        <div className="flex items-center gap-2.5 min-w-0 pr-2">
          {selectedCountry ? (
            <>
              <span className="text-base shrink-0 select-none">{selectedCountry.flag}</span>
              <span className="text-orbit-white font-medium truncate">{selectedCountry.name}</span>
            </>
          ) : (
            <>
              <Globe size={16} className="text-zinc-500 shrink-0" />
              <span className="text-zinc-500 font-sans">{placeholder}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {state === "ok" && !isOpen && (
            <span className="text-orbit-green mr-1">
              <Check size={15} />
            </span>
          )}
          <ChevronDown
            size={15}
            className={`text-zinc-400 transition-transform duration-200 ${isOpen ? "rotate-180 text-orbit-accent" : ""}`}
          />
        </div>
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute left-0 top-[calc(100%+6px)] w-full z-50 rounded-xl bg-orbit-card/95 backdrop-blur-md border border-orbit-border shadow-2xl shadow-black/80 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100">
          {/* Search Header */}
          <div className="p-2.5 border-b border-orbit-border/70 bg-orbit-bg/80 sticky top-0 z-10">
            <div className="relative flex items-center">
              <Search size={14} className="absolute left-3 text-zinc-500 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search country..."
                className="w-full bg-orbit-card border border-orbit-border/80 rounded-lg pl-9 pr-8 py-2 text-xs text-orbit-white placeholder:text-zinc-500 outline-none focus:border-orbit-accent focus:ring-1 focus:ring-orbit-accent/40"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 text-zinc-500 hover:text-orbit-white cursor-pointer p-0.5"
                  aria-label="Clear search"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Countries List */}
          <div
            ref={listRef}
            className="max-h-56 overflow-y-auto divide-y divide-orbit-border/20 py-1 text-xs scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"
            role="listbox"
          >
            {filteredCountries.length > 0 ? (
              filteredCountries.map((c) => {
                const isSelected = selectedCountry?.code === c.code || selectedCountry?.name === c.name;
                return (
                  <button
                    key={c.code}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(c)}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-orbit-accent/15 text-orbit-accent font-medium"
                        : "text-zinc-300 hover:bg-zinc-800/60 hover:text-white"
                    }`}
                  >
                    <span className="flex items-center gap-2.5 truncate">
                      <span className="text-base select-none">{c.flag}</span>
                      <span className="truncate">{c.name}</span>
                    </span>
                    {isSelected && (
                      <Check size={14} className="text-orbit-accent shrink-0 ml-2" />
                    )}
                  </button>
                );
              })
            ) : (
              <div className="py-6 px-4 text-center text-zinc-500 text-xs">
                No countries found matching <span className="text-orbit-white">"{searchQuery}"</span>
              </div>
            )}
          </div>

          {/* Quick info counter */}
          <div className="px-3 py-1.5 bg-orbit-bg/50 border-t border-orbit-border/40 text-[10px] text-zinc-500 flex justify-between items-center">
            <span>{filteredCountries.length} countries</span>
            {selectedCountry && <span className="text-zinc-400 truncate max-w-[150px]">Selected: {selectedCountry.name}</span>}
          </div>
        </div>
      )}
    </div>
  );
};
