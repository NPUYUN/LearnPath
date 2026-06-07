import { useEffect, useState } from "react";
import { getSupportedUploadFormats } from "@/lib/api";

export function useSupportedUploadFormats(enabled = true) {
  const [extensions, setExtensions] = useState<string[]>([]);

  useEffect(() => {
    if (!enabled) return;
    void getSupportedUploadFormats()
      .then((r) => setExtensions(r.extensions))
      .catch(() => {});
  }, [enabled]);

  return extensions;
}
