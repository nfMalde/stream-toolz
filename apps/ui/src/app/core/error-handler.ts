import { ErrorHandler, inject, Injectable } from '@angular/core';
import { RMC } from './rmc';

/**
 * Errors in the UI (also uncaught ones and rejected promises: provideBrowserGlobalErrorListeners routes them
 * here) go to the console as usual and into the app's technical log, where the main process maps the stack
 * to the TypeScript source.
 */
@Injectable()
export class ReportingErrorHandler extends ErrorHandler {
  private readonly rmc = inject(RMC);

  override handleError(error: unknown): void {
    super.handleError(error);
    const err = error instanceof Error ? error : new Error(String(error));
    try {
      void this.rmc.reportError({ message: err.message, stack: err.stack }).catch(() => undefined);
    } catch {
      // Reporting must never throw from the error handler.
    }
  }
}
