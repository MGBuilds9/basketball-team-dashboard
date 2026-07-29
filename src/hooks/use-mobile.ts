import * as React from "react"

const MOBILE_QUERY = "(max-width: 767px)"

function subscribe(callback: () => void) {
  const media = window.matchMedia(MOBILE_QUERY)
  media.addEventListener("change", callback)
  return () => media.removeEventListener("change", callback)
}

function getSnapshot() {
  return window.matchMedia(MOBILE_QUERY).matches
}

function getServerSnapshot() {
  return false
}

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
