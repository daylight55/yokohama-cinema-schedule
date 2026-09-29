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
  "#member",
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

// Preserve case-sensitive member IDs when returning from authentication.
if (/^#member\?user=[A-Za-z0-9_.~%+-]{1,384}$/i.test(window.location.hash)) {
  const user = new URLSearchParams(window.location.hash.split("?")[1]).get("user");
  if (user && user.length <= 128) for (const input of returnHashInputs) {
    if (input instanceof HTMLInputElement) input.value = `#member?${new URLSearchParams({ user })}`;
  }
}
