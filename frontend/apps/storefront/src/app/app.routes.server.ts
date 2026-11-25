import { RenderMode, ServerRoute } from '@angular/ssr';

/** Every page depends on the requesting host (store), so nothing can be prerendered. */
export const serverRoutes: ServerRoute[] = [{ path: '**', renderMode: RenderMode.Server }];
