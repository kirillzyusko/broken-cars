import { Suspense, lazy } from "react";
import HostLoadingScreen from "./HostLoadingScreen.jsx";
import { Home } from "./Home.jsx";
import { HostScreen } from "./host/HostScreen.jsx";
import { PlayerScreen } from "./player/PlayerScreen.jsx";

// Map inspection pages from the track work; they keep their own styling.
const KartDriveTest = lazy(() => import("./KartDriveTest.jsx"));
const MapGraphicsTest = lazy(() => import("./MapGraphicsTest.jsx"));
const MapPreview = lazy(() => import("./MapPreview.jsx"));
const LoadingScreenTest = lazy(() => import("./LoadingScreenTest.jsx"));
const PlayerRaceTest = lazy(() => import("./PlayerRaceTest.jsx"));

function routeFromPath() {
  const [, page, roomId] = window.location.pathname.split("/");
  if ((page === "host" || page === "play") && roomId) {
    return { page, roomId: roomId.toUpperCase() };
  }
  return { page: "home", roomId: null };
}

export default function App() {
  const { pathname } = window.location;
  if (pathname === "/test/player") return <Suspense fallback={null}><PlayerRaceTest /></Suspense>;
  if (pathname === "/test/loading") return <Suspense fallback={null}><LoadingScreenTest /></Suspense>;
  if (pathname === "/map/drive") return <Suspense fallback={null}><KartDriveTest /></Suspense>;
  if (pathname === "/map/graphics") return <Suspense fallback={null}><MapGraphicsTest /></Suspense>;
  if (pathname === "/map") return <Suspense fallback={null}><MapPreview /></Suspense>;

  const route = routeFromPath();
  if (route.page === "host") return <HostLoadingScreen><HostScreen roomId={route.roomId} /></HostLoadingScreen>;
  if (route.page === "play") return <PlayerScreen roomId={route.roomId} />;
  return <HostLoadingScreen><Home /></HostLoadingScreen>;
}
