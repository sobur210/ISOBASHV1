"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Color,
  MeshPhysicalMaterial,
  PMREMGenerator,
  Quaternion,
  Vector3,
  type Group,
  type Mesh,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const CELLS_PER_SIDE = 3;
const GAP = 1.04;
const HALF_PI = Math.PI / 2;
const TURN_DURATION = 0.5;

const AXES = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];
const AXIS_KEYS = ["x", "y", "z"] as const;
const LAYERS = [-(GAP * 1), 0, GAP * 1];

/**
 * Resolves the brand accent from the design tokens instead of a literal, so the
 * blue cells match the palette in either theme.
 */
function brandBlue(): string {
  if (typeof window === "undefined") return "#4d8dff";
  const value = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
  return value || "#4d8dff";
}

function usePrefersMotion(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      query.addEventListener("change", onStoreChange);
      return () => query.removeEventListener("change", onStoreChange);
    },
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => true,
  );
}

/**
 * Reflection environment built from three's procedural room, so the glossy
 * cells have something to mirror without fetching an HDR (which the page CSP
 * would block). Attached to the scene's `environment` slot declaratively.
 */
function StudioEnvironment() {
  const gl = useThree((state) => state.gl);
  const target = useMemo(() => {
    const pmrem = new PMREMGenerator(gl);
    const renderTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    pmrem.dispose();
    return renderTarget;
  }, [gl]);

  useEffect(() => () => target.dispose(), [target]);

  return <primitive object={target.texture} attach="environment" />;
}

type Cell = { base: Vector3; quat: Quaternion; blue: boolean };

/**
 * A Resend-style hero cube: a 3x3x3 Rubik's cube of rounded, glossy cells that
 * spins slowly while random layers turn 90 degrees. Cells alternate blue and
 * white so the sculpture reads in the brand palette.
 */
function Cube({ animate, blue }: { animate: boolean; blue: string }) {
  const group = useRef<Group>(null);
  const meshes = useRef<(Mesh | null)[]>([]);

  const geometry = useMemo(() => new RoundedBoxGeometry(0.96, 0.96, 0.96, 8, 0.12), []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const materials = useMemo(() => {
    const white = new MeshPhysicalMaterial({
      color: "#ffffff",
      metalness: 0.6,
      roughness: 0.12,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.2,
    });
    const accent = new MeshPhysicalMaterial({
      color: blue,
      metalness: 0.55,
      roughness: 0.16,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      emissive: new Color(blue).multiplyScalar(0.08),
      envMapIntensity: 1.25,
    });
    return { white, accent };
  }, [blue]);

  useEffect(
    () => () => {
      materials.white.dispose();
      materials.accent.dispose();
    },
    [materials],
  );

  const cells = useMemo<Cell[]>(() => {
    const list: Cell[] = [];
    const offset = (CELLS_PER_SIDE - 1) / 2;
    for (let i = 0; i < CELLS_PER_SIDE; i += 1) {
      for (let j = 0; j < CELLS_PER_SIDE; j += 1) {
        for (let k = 0; k < CELLS_PER_SIDE; k += 1) {
          list.push({
            base: new Vector3((i - offset) * GAP, (j - offset) * GAP, (k - offset) * GAP),
            quat: new Quaternion(),
            blue: (i + j + k) % 2 === 0,
          });
        }
      }
    }
    return list;
  }, []);

  useEffect(() => {
    cells.forEach((cell, index) => {
      const mesh = meshes.current[index];
      if (!mesh) return;
      mesh.position.copy(cell.base);
      mesh.quaternion.copy(cell.quat);
    });
  }, [cells]);

  const turn = useRef<{ axis: number; layer: number; dir: number; elapsed: number } | null>(null);
  const idle = useRef(0.6);
  const tmpVec = useMemo(() => new Vector3(), []);
  const tmpQuat = useMemo(() => new Quaternion(), []);
  const tmpQuat2 = useMemo(() => new Quaternion(), []);

  const applyTurn = (axis: number, layer: number, angle: number, commit: boolean) => {
    const axisVec = AXES[axis];
    const key = AXIS_KEYS[axis];
    const q = tmpQuat.setFromAxisAngle(axisVec, angle);
    cells.forEach((cell, index) => {
      if (Math.abs(cell.base[key] - layer) > 0.1) return;
      const mesh = meshes.current[index];
      if (!mesh) return;
      const position = tmpVec.copy(cell.base).applyAxisAngle(axisVec, angle);
      const quaternion = tmpQuat2.copy(q).multiply(cell.quat);
      mesh.position.copy(position);
      mesh.quaternion.copy(quaternion);
      if (commit) {
        cell.base.copy(position);
        cell.quat.copy(quaternion);
      }
    });
  };

  useFrame((_, rawDelta) => {
    const node = group.current;
    if (!node) return;
    const delta = Math.min(rawDelta, 0.05);

    if (animate) {
      const time = performance.now();
      node.rotation.y += delta * 0.22;
      node.rotation.x = Math.sin(time * 0.00024) * 0.22;
      node.position.y = Math.sin(time * 0.0006) * 0.08;
    } else {
      return;
    }

    if (turn.current) {
      turn.current.elapsed += delta;
      const progress = Math.min(1, turn.current.elapsed / TURN_DURATION);
      const eased = progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2;
      applyTurn(turn.current.axis, turn.current.layer, turn.current.dir * HALF_PI * eased, false);
      if (progress >= 1) {
        applyTurn(turn.current.axis, turn.current.layer, turn.current.dir * HALF_PI, true);
        turn.current = null;
        idle.current = 0.8 + Math.random() * 1.6;
      }
      return;
    }

    idle.current -= delta;
    if (idle.current <= 0) {
      turn.current = {
        axis: Math.floor(Math.random() * 3),
        layer: LAYERS[Math.floor(Math.random() * 3)],
        dir: Math.random() > 0.5 ? 1 : -1,
        elapsed: 0,
      };
    }
  });

  return (
    <group ref={group} rotation={[0.35, -0.6, 0.08]}>
      {cells.map((cell, index) => (
        <mesh
          key={index}
          ref={(element) => {
            meshes.current[index] = element;
          }}
          geometry={geometry}
          material={cell.blue ? materials.accent : materials.white}
        />
      ))}
    </group>
  );
}

function Scene({ animate }: { animate: boolean }) {
  const blue = useMemo(() => brandBlue(), []);

  return (
    <>
      <StudioEnvironment />
      <ambientLight intensity={0.55} />
      <directionalLight position={[5, 6, 5]} intensity={1.7} color="#ffffff" />
      <pointLight position={[-4, -1, 3]} intensity={26} distance={14} color={blue} />
      <pointLight position={[3, -2, 4]} intensity={14} distance={14} color="#ffffff" />

      <Cube blue={blue} animate={animate} />
    </>
  );
}

export default function HeroCubeCanvas() {
  const animate = usePrefersMotion();

  return (
    <Canvas
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      dpr={[1, 2]}
      camera={{ position: [0, 0.12, 8.6], fov: 36 }}
      style={{ width: "100%", height: "100%" }}
    >
      <group scale={[0.8, 0.8, 0.8]}>
        <Scene animate={animate} />
      </group>
    </Canvas>
  );
}
