const allowedHashes = new Set([
  "#schedule",
  "#movies",
  "#cinemas",
  "#viewing-plans",
  "#planner",
  "#profile",
  "#account",
]);
const returnHashInputs = document.querySelectorAll(
  'input[name="returnHash"]',
);
const currentHash = window.location.hash.toLowerCase();

if (
  allowedHashes.has(currentHash)
) {
  for (const input of returnHashInputs) {
    if (input instanceof HTMLInputElement) input.value = currentHash;
  }
}
