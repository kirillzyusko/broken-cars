import { Suspense, lazy, useEffect, useState } from "react";
import MenuMapBackground from "./MenuMapBackground.jsx";
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
  const [pathname, setPathname] = useState(window.location.pathname);
  const [hostPhase, setHostPhase] = useState(null);
  useEffect(() => {
    const changed = () => { setHostPhase(null); setPathname(window.location.pathname); };
    window.addEventListener("popstate", changed);
    return () => window.removeEventListener("popstate", changed);
  }, []);
  const openRoom = (roomId) => {
    const path = `/host/${roomId}`;
    window.history.pushState(null, "", path);
    setHostPhase(null);
    setPathname(path);
  };
  if (pathname === "/test/player") return <Suspense fallback={null}><PlayerRaceTest /></Suspense>;
  if (pathname === "/test/loading") return <Suspense fallback={null}><LoadingScreenTest /></Suspense>;
  if (pathname === "/map/drive") return <Suspense fallback={null}><KartDriveTest /></Suspense>;
  if (pathname === "/map/graphics") return <Suspense fallback={null}><MapGraphicsTest /></Suspense>;
  if (pathname === "/map") return <Suspense fallback={null}><MapPreview /></Suspense>;

  const route = routeFromPath();
  if (route.page === "play") return <PlayerScreen roomId={route.roomId} />;
  const lobby = route.page === "host";
  const showMap = !lobby || hostPhase === null || hostPhase === "waiting";
  return <HostLoadingScreen>
    {showMap && <div className="menu-map-layer"><MenuMapBackground /></div>}
    {lobby ? <HostScreen key={route.roomId} roomId={route.roomId} onPhaseChange={setHostPhase} /> : <Home onOpenRoom={openRoom} />}
  </HostLoadingScreen>;
}
