const allowedHashes = new Set([
  "#schedule",
  "#movies",
  "#cinemas",
  "#viewing-plans",
  "#shared",
  "#groups",
  "#notifications",
  "#planner",
  "#profile",
  "#account",
]);
const returnHashInputs = document.querySelectorAll(
  'input[name="returnHash"]',
);
const currentHash = window.location.hash.toLowerCase();

if (
  allowedHashes.has(currentHash) || /^#collection-status(?:\?date=\d{4}-\d{2}-\d{2})?$/.test(currentHash)
) {
  for (const input of returnHashInputs) {
    if (input instanceof HTMLInputElement) input.value = currentHash;
  }
}
