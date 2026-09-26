export const MAX_SOURCE_FAILURES = 5;

// Marks failures already counted by the HTTP layer, so the date loop does not
// count the same attempt twice. The budget belongs to one cinema collection.
class CountedSourceFailure extends Error {}

export class SourceAccessBudget {
  private failures = 0;
  stopReason: string | null = null;

  assertAvailable(): void {
    if (this.stopReason) throw new CountedSourceFailure(this.stopReason);
  }

  recordFailure(error: unknown, blocked = false): Error {
    if (error instanceof CountedSourceFailure) return error;
    const message =
      error instanceof Error ? error.message : "Collection failed";
    this.failures += 1;
    if (blocked) {
      this.stopReason = `Collection stopped after access refusal: ${message}`;
    } else if (this.failures >= MAX_SOURCE_FAILURES) {
      this.stopReason = `Collection stopped after ${MAX_SOURCE_FAILURES} failed attempts: ${message}`;
    }
    return new CountedSourceFailure(this.stopReason ?? message);
  }
}
