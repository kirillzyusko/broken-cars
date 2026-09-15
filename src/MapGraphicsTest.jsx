import { useEffect, useRef } from "react";
import { createMapGraphicsScene } from "./map-graphics-runtime.js";
import "./styles.css";

export default function MapGraphicsTest() {
  const canvasRef = useRef(null);
  useEffect(() => {
    let cancelled = false;
    let scene;
    const observer = new ResizeObserver(() => scene?.resize());
    observer.observe(canvasRef.current);
    createMapGraphicsScene(canvasRef.current, () => cancelled).then((loaded) => {
      scene = loaded;
      scene?.resize();
    }).catch((error) => console.error("Corsica graphics test failed to load", error));
    return () => {
      cancelled = true;
      observer.disconnect();
      scene?.destroy();
    };
  }, []);
  return <canvas className="map-graphics-test" ref={canvasRef} aria-label="Four map cameras: whole island, race start, mountain road, and coast" />;
}
