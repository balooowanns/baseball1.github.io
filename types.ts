import React from 'react';

export type AppMode = 'batting' | 'pitching';

export interface SimulationParams {
  velocity: number; // km/h
  angle: number;    // degrees
  direction: number; // degrees (0 = center, negative = left, positive = right)
  windSpeed: number; // m/s
  windDirection: number; // degrees (0 = Tailwind/Center, 90 = Crosswind Right, 180 = Headwind)
}

export interface PitchingParams {
  velocity: number; // km/h
  spinRate: number; // rpm
  spinDirection: number; // degrees (0=12:00/Top, 90=3:00/Right)
  spinEfficiency: number; // %
  hAngle: number; // degrees (Horizontal Release Angle)
  vAngle: number; // degrees (Vertical Release Angle)
  releaseHeight: number; // m
  releaseSide: number; // cm (positive = right of rubber)
  extension: number; // cm (distance from rubber)
  targetX: number; // m (0 = center of plate)
  targetY: number; // m (height at plate)
  gyroDegree: number; // degrees
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
  t: number;
}

export interface TrajectoryResult {
  points: Point3D[];
  distance: number; // For batting: carry. For pitching: distance to plate (const)
  maxHeight: number;
  hangTime: number;
  finalPosition?: { x: number, y: number }; // End of simulation (ground or catcher)
  plateCrossing?: { x: number, y: number }; // Exact position at z=0 (Home Plate)
}

export const STRIKE_ZONE_CONFIG = {
  TOP: 1.05,       // m (Top of strike zone)
  BOTTOM: 0.40,    // m (Bottom of strike zone)
  WIDTH: 0.432,    // m (17 inches)
  SIDE_HEIGHT: 0.216, // m (Length of the straight side edge)
  DIAGONAL: 0.305  // m (12 inches approx for back edges)
};

// Augment JSX namespace to include Three.js elements for @react-three/fiber
declare global {
  namespace JSX {
    interface IntrinsicElements {
      ambientLight: any;
      directionalLight: any;
      group: any;
      mesh: any;
      planeGeometry: any;
      circleGeometry: any;
      boxGeometry: any;
      cylinderGeometry: any;
      sphereGeometry: any;
      shapeGeometry: any;
      extrudeGeometry: any;
      meshStandardMaterial: any;
      meshBasicMaterial: any;
    }
  }
}

// Also augment React.JSX for newer TS/React versions where JSX is scoped to React
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      ambientLight: any;
      directionalLight: any;
      group: any;
      mesh: any;
      planeGeometry: any;
      circleGeometry: any;
      boxGeometry: any;
      cylinderGeometry: any;
      sphereGeometry: any;
      shapeGeometry: any;
      extrudeGeometry: any;
      meshStandardMaterial: any;
      meshBasicMaterial: any;
    }
  }
}
