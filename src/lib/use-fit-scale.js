import { useEffect, useState } from "react";

function compute(width, height) {
  if (typeof window === "undefined") return 1;
  return Math.min(window.innerWidth / width, window.innerHeight / height);
}

export function useFitScale(width, height) {
  const [scale, setScale] = useState(() => compute(width, height));
  useEffect(() => {
    const update = () => setScale(compute(width, height));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [width, height]);
  return scale;
}
