'use client'

import { createContext, useContext, useEffect } from 'react'

interface ThemeContextValue {
  theme: 'light'
  toggle: () => void
  isDark: false
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  toggle: () => {},
  isDark: false,
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Force light mode
    document.documentElement.classList.remove('dark')
    document.documentElement.classList.add('light')
  }, [])

  return (
    <ThemeContext.Provider value={{ theme: 'light', toggle: () => {}, isDark: false }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
