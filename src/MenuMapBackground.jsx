import { useEffect, useRef, useState } from "react";

export default function MenuMapBackground() {
  const canvasRef = useRef(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let scene;
    const observer = new ResizeObserver(() => scene?.resize());
    observer.observe(canvasRef.current);
    import("./menu-map-runtime.js").then(({ createMenuMap }) => createMenuMap(canvasRef.current, () => cancelled))
      .then((loaded) => {
        scene = loaded;
        if (!cancelled && scene) { scene.resize(); setReady(true); }
      }).catch((error) => { if (!cancelled) console.warn("Menu map could not load", error); });
    return () => { cancelled = true; observer.disconnect(); scene?.destroy(); };
  }, []);
  return <canvas ref={canvasRef} className={`home__map${ready ? " home__map--ready" : ""}`} aria-hidden="true" />;
}
