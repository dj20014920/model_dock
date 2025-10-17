export function usePremium() {
  // Premium is disabled in this fork – treat as always activated
  return { activated: true, isLoading: false as const, error: undefined as string | undefined }
}
