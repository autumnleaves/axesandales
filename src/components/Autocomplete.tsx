import React, { useState, useRef, useEffect } from 'react';

interface AutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
}

export const Autocomplete: React.FC<AutocompleteProps> = ({
  value,
  onChange,
  options,
  placeholder = '',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = value.trim()
    ? options.filter(g => g.toLowerCase().includes(value.toLowerCase()))
    : options;

  const exactMatch = options.some(g => g.toLowerCase() === value.trim().toLowerCase());

  useEffect(() => {
    setHighlightIndex(-1);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('li');
      items[highlightIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex]);

  const selectValue = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  const handleBlur = () => {
    // Small delay to allow click events on dropdown items to fire first
    setTimeout(() => {
      setIsOpen(false);
    }, 150);
  };

  const totalItems = filtered.length + (value.trim() && !exactMatch ? 1 : 0);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setIsOpen(true);
      return;
    }
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex(prev => (prev + 1) % totalItems);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex(prev => (prev - 1 + totalItems) % totalItems);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIndex >= 0 && highlightIndex < filtered.length) {
          selectValue(filtered[highlightIndex]);
        } else if (highlightIndex === filtered.length && value.trim() && !exactMatch) {
          // "Create new" option — just close the dropdown, value is already set
          setIsOpen(false);
        } else if (value.trim()) {
          setIsOpen(false);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  const showDropdown = isOpen && (filtered.length > 0 || (value.trim() && !exactMatch));

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          if (disabled) return;
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => {
          if (!disabled) setIsOpen(true);
        }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={`w-full bg-neutral-800 border border-neutral-600 rounded px-3 py-2 text-white focus:ring-1 focus:ring-amber-500 focus:outline-none text-sm ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
        autoComplete="off"
      />
      {showDropdown && (
        <ul
          ref={listRef}
          className="absolute z-50 w-full mt-1 bg-neutral-800 border border-neutral-600 rounded-lg shadow-xl max-h-48 overflow-y-auto"
        >
          {filtered.map((option, i) => (
            <li
              key={option}
              onMouseDown={(e) => {
                e.preventDefault();
                selectValue(option);
              }}
              onMouseEnter={() => setHighlightIndex(i)}
              className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                highlightIndex === i
                  ? 'bg-amber-600 text-white'
                  : 'text-neutral-200 hover:bg-neutral-700'
              }`}
            >
              {option}
            </li>
          ))}
          {value.trim() && !exactMatch && (
            <li
              onMouseDown={(e) => {
                e.preventDefault();
                selectValue(value.trim());
              }}
              onMouseEnter={() => setHighlightIndex(filtered.length)}
              className={`px-3 py-2 text-sm cursor-pointer border-t border-neutral-700 transition-colors ${
                highlightIndex === filtered.length
                  ? 'bg-amber-600 text-white'
                  : 'text-amber-400 hover:bg-neutral-700'
              }`}
            >
              <span className="mr-1">+</span> Create "<span className="font-medium">{value.trim()}</span>"
            </li>
          )}
        </ul>
      )}
    </div>
  );
};
