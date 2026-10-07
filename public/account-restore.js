const dialog = document.getElementById("restore-dialog");
const form = document.getElementById("restore-actions");
// Revalidate the proof after history navigation; it may have been cancelled,
// consumed, or expired while this document was in the back/forward cache.
window.addEventListener("pageshow", event => {
  if (event.persisted) window.location.reload();
});
if (dialog instanceof HTMLDialogElement && form instanceof HTMLFormElement) {
  // The open attribute keeps the confirmation usable without JavaScript.
  dialog.close();
  dialog.showModal();
  let submitting = false;
  dialog.addEventListener("cancel", event => {
    event.preventDefault();
    if (!submitting) form.requestSubmit(form.querySelector('[value="cancel"]'));
  });
  form.addEventListener("submit", event => {
    if (submitting) { event.preventDefault(); return; }
    submitting = true;
    // Keep the chosen action in the form data before disabling the buttons.
    const action = document.createElement("input");
    action.type = "hidden";
    action.name = "action";
    action.value = event.submitter.value;
    form.append(action);
    for (const button of form.querySelectorAll("button")) button.disabled = true;
  });
}
