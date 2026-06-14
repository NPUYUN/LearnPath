const REPLAN_LIBRARY_KEY = "lp_replan_library_id";

export function getReplanLibraryId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REPLAN_LIBRARY_KEY);
}

export function setReplanLibraryId(libraryId: string | null): void {
  if (typeof window === "undefined") return;
  if (libraryId) {
    localStorage.setItem(REPLAN_LIBRARY_KEY, libraryId);
  } else {
    localStorage.removeItem(REPLAN_LIBRARY_KEY);
  }
}
