import { z } from "zod";

// Zod 4 probes `new Function()` to compile faster validators. The CSP forbids eval, so the probe
// only produces a violation report before falling back; jitless skips the probe altogether.
// Imported for its side effect by every module that declares Zod schemas.
z.config({ jitless: true });
