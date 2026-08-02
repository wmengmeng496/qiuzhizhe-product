import { BrowserRouter } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { AppRoutes } from "./router";
import ProductShell from "./components/layout/ProductShell";

function AppShell() {
  const location = useLocation();
  const isStandalone = ["/", "/auth", "/terms", "/privacy"].includes(location.pathname);

  return (
    <>
      {isStandalone ? (
        <AppRoutes />
      ) : (
        <ProductShell>
          <AppRoutes />
        </ProductShell>
      )}
    </>
  );
}

function App() {
  return (
    <BrowserRouter basename="/">
      <AppShell />
    </BrowserRouter>
  );
}

export default App;
