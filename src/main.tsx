import { lazy, Suspense, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemberProfileProvider } from "./MemberProfile";
import { NotificationProvider } from "./Notifications";
import { App } from "./App";
import "./styles.css";

const PerformancePanel = new URLSearchParams(location.search).get("perf") === "1"
  ? lazy(() => import("./PerformancePanel")) : null;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MemberProfileProvider>
      <NotificationProvider><App /></NotificationProvider>
      {PerformancePanel && <Suspense fallback={null}><PerformancePanel /></Suspense>}
    </MemberProfileProvider>
  </StrictMode>,
);
