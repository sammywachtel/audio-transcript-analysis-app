import { useEffect, useState } from 'react';

/**
 * useDebounce - Debounces a value by delaying updates
 *
 * Classic debounce pattern: delays updating the value until the input
 * has stopped changing for the specified delay period. Perfect for
 * search inputs where you don't want to fire queries on every keystroke.
 *
 * @param value - The value to debounce (e.g., search query string)
 * @param delay - Delay in milliseconds before updating (default 300ms)
 * @returns The debounced value
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Set up timeout to update debounced value after delay
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Clean up timeout if value changes before delay expires
    // This is the key to debouncing: cancel and restart on every change
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
