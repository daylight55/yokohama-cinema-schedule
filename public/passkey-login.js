const button = document.getElementById("passkey-login");
const message = document.getElementById("passkey-message");
const supported =
  window.isSecureContext &&
  "PublicKeyCredential" in window &&
  typeof PublicKeyCredential.parseRequestOptionsFromJSON === "function";

if (button instanceof HTMLButtonElement && supported) {
  button.classList.remove("hidden");
  button.addEventListener("click", async () => {
    button.disabled = true;
    setMessage("");
    try {
      const optionsResponse = await fetch("/auth/passkeys/options", {
        method: "POST",
        headers: { accept: "application/json" },
      });
      if (!optionsResponse.ok) throw new Error("options_failed");
      const payload = await optionsResponse.json();
      const publicKey =
        PublicKeyCredential.parseRequestOptionsFromJSON(payload.options);
      const credential = await navigator.credentials.get({ publicKey });
      if (
        !(credential instanceof PublicKeyCredential) ||
        typeof credential.toJSON !== "function"
      ) {
        throw new Error("unsupported_browser");
      }
      const verifyResponse = await fetch("/auth/passkeys/verify", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          challengeId: payload.challengeId,
          response: credential.toJSON(),
        }),
      });
      if (!verifyResponse.ok) throw new Error("verification_failed");
      window.location.assign(`/${allowedReturnHash()}`);
    } catch (error) {
      if (
        !(error instanceof DOMException) ||
        !["AbortError", "NotAllowedError"].includes(error.name)
      ) {
        setMessage(
          error instanceof Error && error.message === "unsupported_browser"
            ? "このブラウザではパスキーを利用できません。"
            : "パスキーでログインできませんでした。",
        );
      }
    } finally {
      button.disabled = false;
    }
  });
}

function allowedReturnHash() {
  const hashes = new Set([
    "#schedule",
    "#movies",
    "#cinemas",
    "#planner",
    "#profile",
    "#account",
  ]);
  const hash = window.location.hash.toLowerCase();
  return hashes.has(hash) ? hash : "";
}

function setMessage(value) {
  if (!(message instanceof HTMLElement)) return;
  message.textContent = value;
  message.classList.toggle("hidden", value.length === 0);
}
