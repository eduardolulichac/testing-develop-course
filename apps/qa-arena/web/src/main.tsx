import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { AuthProvider } from "./auth";
import { ScenarioProvider } from "./scenario/ScenarioProvider";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ScenarioProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ScenarioProvider>
    </BrowserRouter>
  </StrictMode>,
);
