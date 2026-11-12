import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

function makeBox(
  parent: THREE.Group,
  size: [number, number, number],
  position: [number, number, number],
  color: string,
  roughness = 0.72,
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.12 }),
  );
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export default function TerminalScene({ variant = "overview" }: { variant?: "overview" | "auth" }) {
  const canvasHost = useRef<HTMLDivElement>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const host = canvasHost.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    } catch {
      setUnavailable(true);
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#14231f");
    scene.fog = new THREE.Fog("#14231f", 18, 45);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(10, 7.5, 13);
    const world = new THREE.Group();
    scene.add(world);

    scene.add(new THREE.HemisphereLight("#d9e7d6", "#314038", 2.2));
    const sun = new THREE.DirectionalLight("#fff0c7", 3.2);
    sun.position.set(-5, 12, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -15;
    sun.shadow.camera.right = 15;
    sun.shadow.camera.top = 15;
    sun.shadow.camera.bottom = -15;
    scene.add(sun);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.MeshStandardMaterial({ color: "#263b34", roughness: 0.94, metalness: 0.05 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    floor.receiveShadow = true;
    world.add(floor);
    const grid = new THREE.GridHelper(55, 42, "#6e8976", "#3f5b4b");
    grid.position.y = 0.005;
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMaterials.forEach((material) => {
      material.transparent = true;
      material.opacity = 0.25;
    });
    world.add(grid);

    const terminal = new THREE.Group();
    world.add(terminal);
    const container = new THREE.Group();
    container.position.set(0.7, 1.42, 0);
    terminal.add(container);
    makeBox(container, [5.4, 2.55, 2.8], [0, 0, 0], "#bd6b40");
    for (let index = 0; index < 19; index += 1) {
      const x = -2.52 + index * 0.28;
      makeBox(container, [0.045, 2.48, 0.055], [x, 0, 1.425], index % 4 === 0 ? "#d28a55" : "#a95836");
    }
    makeBox(container, [0.08, 2.47, 2.83], [-2.68, 0, 0], "#e2a066");
    makeBox(container, [0.08, 2.47, 2.83], [2.68, 0, 0], "#e2a066");
    makeBox(container, [5.35, 0.09, 2.84], [0, 1.25, 0], "#e2a066");
    makeBox(container, [5.35, 0.09, 2.84], [0, -1.25, 0], "#e2a066");

    const containerMark = document.createElement("canvas");
    containerMark.width = 512;
    containerMark.height = 160;
    const markContext = containerMark.getContext("2d");
    if (markContext) {
      markContext.fillStyle = "#f2dfb6";
      markContext.fillRect(0, 0, 512, 160);
      markContext.fillStyle = "#24372c";
      markContext.font = "700 74px Arial";
      markContext.fillText("FC / 04", 28, 91);
      markContext.font = "600 24px Arial";
      markContext.fillText("FREIGHT COPILOT", 31, 130);
      const markTexture = new THREE.CanvasTexture(containerMark);
      markTexture.colorSpace = THREE.SRGBColorSpace;
      const mark = new THREE.Mesh(
        new THREE.PlaneGeometry(1.34, 0.42),
        new THREE.MeshBasicMaterial({ map: markTexture, toneMapped: false }),
      );
      mark.position.set(-1.5, 0.75, 1.46);
      container.add(mark);
    }

    for (const [x, z, color] of [[-6.2, -4.7, "#395b52"], [-8.7, -4.7, "#ad6545"], [7, -5.8, "#526e59"]] as const) {
      const stack = new THREE.Group();
      stack.position.set(x, 1.02, z);
      terminal.add(stack);
      makeBox(stack, [3.8, 1.9, 2.25], [0, 0, 0], color);
      for (let rib = 0; rib < 13; rib += 1) {
        makeBox(stack, [0.035, 1.82, 0.04], [-1.76 + rib * 0.293, 0, 1.14], "#d2b88a");
      }
    }

    for (const [x, z] of [[-7.5, 1], [7.6, -1]] as const) {
      makeBox(world, [0.12, 4.2, 0.12], [x, 2.1, z], "#61796c", 0.5);
      makeBox(world, [1.1, 0.09, 0.09], [x, 4.18, z], "#b8c5a9", 0.4);
      const yardLight = new THREE.PointLight("#f4d28e", 26, 13, 1.8);
      yardLight.position.set(x, 4.05, z);
      world.add(yardLight);
    }

    for (let stripe = -3; stripe <= 3; stripe += 1) {
      makeBox(world, [0.08, 0.015, 1.1], [stripe * 0.48 + 5.2, 0.025, 5.2], "#d5bb78", 0.8);
    }

    const crane = new THREE.Group();
    terminal.add(crane);
    makeBox(crane, [12, 0.3, 0.38], [0, 5.2, -2.2], "#d5a84f", 0.46);
    makeBox(crane, [0.34, 5.2, 0.38], [-5.7, 2.65, -2.2], "#d5a84f", 0.46);
    makeBox(crane, [0.34, 5.2, 0.38], [5.7, 2.65, -2.2], "#d5a84f", 0.46);
    makeBox(crane, [11.4, 0.16, 0.2], [0, 4.77, -2.2], "#f1d390", 0.4);
    makeBox(crane, [0.17, 0.9, 0.2], [0.6, 4.6, -1.5], "#ecbd5d", 0.38);
    makeBox(crane, [0.5, 0.12, 0.58], [0.6, 4.13, -1.5], "#263e32");

    const trailer = new THREE.Group();
    trailer.position.set(0.7, 0, 2.05);
    terminal.add(trailer);
    makeBox(trailer, [6.9, 0.24, 1.15], [0.45, 0.83, 0], "#667e70");
    makeBox(trailer, [1.3, 1.55, 1.25], [-3.45, 1.05, 0], "#537262");
    makeBox(trailer, [0.95, 0.7, 1.28], [-3.55, 2.15, 0], "#6f8e78");
    makeBox(trailer, [0.14, 0.38, 0.12], [-3.02, 2.07, 0.67], "#d6e0cb", 0.28);
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: "#16231f", roughness: 0.68 });
    for (const x of [-2.6, 2.55, 3.25]) {
      for (const z of [-0.62, 0.62]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.2, 24), wheelMaterial);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(x, 0.43, z);
        wheel.castShadow = true;
        trailer.add(wheel);
        const hub = new THREE.MeshStandardMaterial({ color: "#92a38f", metalness: 0.62, roughness: 0.34 });
        const center = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.21, 20), hub);
        center.rotation.x = Math.PI / 2;
        center.position.set(x, 0.43, z * 1.03);
        trailer.add(center);
      }
    }

    const beaconLight = new THREE.PointLight("#f3c96b", 22, 8, 2);
    beaconLight.position.set(0.6, 5.25, -1.4);
    terminal.add(beaconLight);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    host.appendChild(renderer.domElement);

    const pointer = { x: 0, y: 0 };
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const handlePointer = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      pointer.y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    const clearPointer = () => {
      pointer.x = 0;
      pointer.y = 0;
    };
    host.addEventListener("pointermove", handlePointer);
    host.addEventListener("pointerleave", clearPointer);

    const resizeObserver = new ResizeObserver(() => {
      const { width, height } = host.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
    resizeObserver.observe(host);

    let animationFrame = 0;
    const startedAt = performance.now();
    const renderFrame = () => {
      const elapsed = (performance.now() - startedAt) / 1000;
      camera.position.x = (variant === "auth" ? 9.5 : 10) + pointer.x * 1.05;
      camera.position.y = (variant === "auth" ? 7.1 : 7.5) - pointer.y * 0.45;
      camera.lookAt(0, 2.2, 0);
      terminal.rotation.y = Math.sin(elapsed * 0.16) * 0.025;
      beaconLight.intensity = reducedMotion ? 18 : 17 + Math.sin(elapsed * 2.2) * 3;
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(renderFrame);
    };
    renderFrame();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      host.removeEventListener("pointermove", handlePointer);
      host.removeEventListener("pointerleave", clearPointer);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [variant]);

  return (
    <div className={`terminal-scene terminal-scene-${variant}${unavailable ? " terminal-scene-fallback" : ""}`} ref={canvasHost} role="img" aria-label="Three-dimensional view of a freight container at a lit cargo terminal">
      {unavailable && <div className="scene-fallback-mark">FC / 01</div>}
      <div className="scene-coordinate">TERMINAL 01 <span>·</span> WEST DOCK</div>
      <div className="scene-caption">FREIGHT / IN MOTION</div>
    </div>
  );
}