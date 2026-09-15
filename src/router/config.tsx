import type { RouteObject } from "react-router-dom";
import { Navigate, useLocation } from "react-router-dom";
import NotFound from "../pages/NotFound";
import Landing from "../pages/landing/page";
import Home from "../pages/home/page";
import ResumeOptimizer from "../pages/resume-optimizer/page";
import InterviewPrep from "../pages/interview-prep/page";
import OptimizationHistory from "../pages/optimization-history/page";
import Membership from "../pages/membership/page";
import Credits from "../pages/credits/page";
import Auth from "../pages/auth/page";
import CareerAssets from "../pages/career-assets/page";
import Account from "../pages/account/page";
import LegalPage from "../pages/legal/page";
import { getStoredUser } from "../lib/api";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  if (!getStoredUser()) {
    const redirect = `${location.pathname}${location.search}`;
    return <Navigate to={`/auth?redirect=${encodeURIComponent(redirect)}`} replace />;
  }
  return children;
}

const routes: RouteObject[] = [
  {
    path: "/",
    element: <Landing />,
  },
  {
    path: "/workspace",
    element: <RequireAuth><Home /></RequireAuth>,
  },
  {
    path: "/resume-optimizer",
    element: <RequireAuth><ResumeOptimizer /></RequireAuth>,
  },
  {
    path: "/interview-prep",
    element: <RequireAuth><InterviewPrep /></RequireAuth>,
  },
  {
    path: "/optimization-history",
    element: <RequireAuth><OptimizationHistory /></RequireAuth>,
  },
  {
    path: "/career-assets",
    element: <RequireAuth><CareerAssets /></RequireAuth>,
  },
  {
    path: "/membership",
    element: <RequireAuth><Membership /></RequireAuth>,
  },
  {
    path: "/credits",
    element: <RequireAuth><Credits /></RequireAuth>,
  },
  {
    path: "/account",
    element: <RequireAuth><Account /></RequireAuth>,
  },
  {
    path: "/auth",
    element: <Auth />,
  },
  {
    path: "/terms",
    element: <LegalPage type="terms" />,
  },
  {
    path: "/privacy",
    element: <LegalPage type="privacy" />,
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

export default routes;
