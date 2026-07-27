const allowedHashes = new Set([
  "#schedule",
  "#movies",
  "#cinemas",
  "#profile",
]);
const returnHashInput = document.querySelector(
  'input[name="returnHash"]',
);
const currentHash = window.location.hash.toLowerCase();

if (
  returnHashInput instanceof HTMLInputElement &&
  allowedHashes.has(currentHash)
) {
  returnHashInput.value = currentHash;
}
