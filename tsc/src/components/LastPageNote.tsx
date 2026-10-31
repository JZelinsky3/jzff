'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { noteLastPage } from '@/lib/signupFrom'

/** Notes the page you're on, for signup attribution (see lib/signupFrom). */
export function LastPageNote() {
  const path = usePathname()
  useEffect(() => {
    if (path) noteLastPage(path)
  }, [path])
  return null
}
