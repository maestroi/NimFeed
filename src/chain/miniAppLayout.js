export function shellClasses(isNimiqPay) {
  if (isNimiqPay) {
    return {
      outer: 'h-dvh w-full',
      page: 'relative nf-page h-full w-full overflow-hidden',
      nav: 'absolute bottom-0 inset-x-0 z-40',
      navInner: 'border-t border-[var(--nf-border)] bg-white px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]',
      navGrid: 'grid grid-cols-4 items-center gap-1',
    }
  }

  return {
    outer: 'min-h-screen px-3 py-3 sm:flex sm:justify-center sm:px-6 sm:py-6',
    page:
      'relative nf-page w-full max-w-2xl overflow-hidden rounded-2xl border border-[var(--nf-border)] h-[calc(100vh-1.5rem)] sm:h-[calc(100vh-3rem)]',
    nav: 'absolute bottom-3 inset-x-0 z-40 px-3 sm:px-4',
    navInner: 'nf-card px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]',
    navGrid: 'grid grid-cols-4 items-center gap-2',
  }
}
