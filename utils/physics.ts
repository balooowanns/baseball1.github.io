
import { Point3D, TrajectoryResult, PitchingParams } from '../types';

// Constants
const GRAVITY = 9.81; // m/s^2
const AIR_DENSITY = 1.225; // kg/m^3
const BALL_MASS = 0.145; // kg
const BALL_RADIUS = 0.037; // m (approx 74mm diameter)
const BALL_AREA = Math.PI * (BALL_RADIUS ** 2);
const DRAG_COEFFICIENT = 0.30; 
const BATTING_LIFT_COEFFICIENT = 0.15; 

// Distance from Pitcher's plate to Home Plate apex (approx)
const MOUND_DISTANCE = 18.44; // m
const CATCHER_DEPTH = 1.5; // m (Behind home plate)

// Physics Constants for Batting
const WALL_HEIGHT = 4.0; // m
const COR_GROUND = 0.45; // Coefficient of Restitution (Bounce) on Grass
const COR_WALL = 0.7; // Bounciness of wall
const STOP_VELOCITY = 0.1; // m/s

// Ground Friction Constants
const FRICTION_BOUNCE = 0.92; 
const MU_ROLLING = 0.25; 

// Define Wall Geometry (Linear Approximation of Stadium.tsx curve)
// x1, z1 to x2, z2
const WALL_SEGMENTS = [
    { x1: -70.71, z1: 70.71, x2: -42.1, z2: 101.6 }, // Left
    { x1: -42.1, z1: 101.6, x2: 0, z2: 122 },        // Left Center
    { x1: 0, z1: 122, x2: 42.1, z2: 101.6 },         // Right Center
    { x1: 42.1, z1: 101.6, x2: 70.71, z2: 70.71 }    // Right
];

/**
 * Batting Trajectory Calculation
 */
export const calculateTrajectory = (
  velocityKmh: number,
  launchAngleDeg: number,
  sprayAngleDeg: number,
  windSpeedMs: number = 0,
  windDirectionDeg: number = 0
): TrajectoryResult => {
  const dt = 0.01; 
  const maxTime = 20; 

  const v0 = velocityKmh * (1000 / 3600); 
  const theta = launchAngleDeg * (Math.PI / 180); 
  // Invert angle: Positive Slider (Right) -> Negative X (Screen Right)
  const phi = -sprayAngleDeg * (Math.PI / 180); 

  let vx = v0 * Math.cos(theta) * Math.sin(phi);
  let vy = v0 * Math.sin(theta);
  let vz = v0 * Math.cos(theta) * Math.cos(phi);

  // Wind Vector Calculation
  // 90 degrees = Right Wind. Coordinate Right is -X.
  // So we want Force to be negative when angle is 90.
  // cos(90) = 0, sin(90) = 1.
  // -1 * sin(90) = -1. Correct.
  const windRad = windDirectionDeg * (Math.PI / 180);
  const wx = -windSpeedMs * Math.sin(windRad);
  const wz = windSpeedMs * Math.cos(windRad);
  const wy = 0; 

  let x = 0;
  let y = 0.5; 
  let z = 0;
  let t = 0;

  const points: Point3D[] = [];
  let maxHeight = y;
  let carryDistance = 0;
  let landingPosition: { x: number, y: number, z: number } | undefined;
  let hasHitGround = false;

  while (t < maxTime) {
    const prevX = x;
    const prevZ = z;

    points.push({ x, y, z, t });
    if (y > maxHeight) maxHeight = y;

    // Relative Velocity (Airspeed)
    const vrx = vx - wx;
    const vry = vy - wy;
    const vrz = vz - wz;
    const vRelTotal = Math.sqrt(vrx*vrx + vry*vry + vrz*vrz);
    
    let ax = 0, ay = -GRAVITY, az = 0;

    if (vRelTotal > 0.1) {
        // Drag
        const Fd = 0.5 * AIR_DENSITY * (vRelTotal ** 2) * DRAG_COEFFICIENT * BALL_AREA;
        const ad = Fd / BALL_MASS;
        const axDrag = -ad * (vrx / vRelTotal);
        const ayDrag = -ad * (vry / vRelTotal);
        const azDrag = -ad * (vrz / vRelTotal);

        // Lift
        let axLift = 0, ayLift = 0;
        if (y > 0.05) { 
             const Fl = 0.5 * AIR_DENSITY * (vRelTotal ** 2) * BATTING_LIFT_COEFFICIENT * BALL_AREA;
             const al = Fl / BALL_MASS;
             const vHorizontal = Math.sqrt(vx*vx + vz*vz);
             const vTotal = Math.sqrt(vHorizontal*vHorizontal + vy*vy);
             if(vTotal > 0) ayLift = al * (vHorizontal / vTotal);
        }

        ax = axDrag + axLift;
        ay = -GRAVITY + ayDrag + ayLift;
        az = azDrag;
    }

    vx += ax * dt;
    vy += ay * dt;
    vz += az * dt;

    x += vx * dt;
    y += vy * dt;
    z += vz * dt;
    t += dt;

    // --- COLLISION DETECTION ---

    // 1. Wall Collision
    if (z > 60 && y >= 0 && y <= WALL_HEIGHT) {
        for (const seg of WALL_SEGMENTS) {
            const intersect = getLineIntersection(prevX, prevZ, x, z, seg.x1, seg.z1, seg.x2, seg.z2);
            if (intersect) {
                const dx = seg.x2 - seg.x1;
                const dz = seg.z2 - seg.z1;
                const len = Math.sqrt(dx*dx + dz*dz);
                const midX = (seg.x1 + seg.x2) / 2;
                const midZ = (seg.z1 + seg.z2) / 2;

                let nx = -dz / len;
                let nz = dx / len;

                if (nx * midX + nz * midZ > 0) {
                    nx = -nx;
                    nz = -nz;
                }

                const vDotN = vx * nx + vz * nz;
                if (vDotN < 0) {
                    vx = (vx - 2 * vDotN * nx) * COR_WALL;
                    vz = (vz - 2 * vDotN * nz) * COR_WALL;
                    vy *= 0.8;
                    x = intersect.x + nx * 0.2;
                    z = intersect.z + nz * 0.2;
                }
                break; 
            }
        }
    }

    // 2. Ground Collision
    if (y <= 0) {
        y = 0; 
        if (!hasHitGround) {
            hasHitGround = true;
            carryDistance = Math.sqrt(x*x + z*z);
            landingPosition = { x, y: 0, z };
        }

        if (Math.abs(vy) < 1.0) {
            vy = 0;
            const speedXZ = Math.sqrt(vx*vx + vz*vz);
            if (speedXZ > 0) {
                const deceleration = MU_ROLLING * GRAVITY;
                const speedLoss = deceleration * dt;
                
                if (speedXZ <= speedLoss + STOP_VELOCITY) {
                    vx = 0;
                    vz = 0;
                    break; 
                } else {
                    const newSpeed = speedXZ - speedLoss;
                    const ratio = newSpeed / speedXZ;
                    vx *= ratio;
                    vz *= ratio;
                }
            } else {
                break; 
            }
        } else {
            vy = -vy * COR_GROUND; 
            vx *= FRICTION_BOUNCE;
            vz *= FRICTION_BOUNCE;
        }
    }
  }

  if (!hasHitGround) {
      carryDistance = Math.sqrt(x*x + z*z);
  }

  return {
    points,
    distance: carryDistance,
    maxHeight,
    hangTime: t,
    landingPosition
  };
};

function getLineIntersection(p0_x: number, p0_y: number, p1_x: number, p1_y: number, p2_x: number, p2_y: number, p3_x: number, p3_y: number) {
    const s1_x = p1_x - p0_x;
    const s1_y = p1_y - p0_y;
    const s2_x = p3_x - p2_x;
    const s2_y = p3_y - p2_y;

    const s = (-s1_y * (p0_x - p2_x) + s1_x * (p0_y - p2_y)) / (-s2_x * s1_y + s1_x * s2_y);
    const t = ( s2_x * (p0_y - p2_y) - s2_y * (p0_x - p2_x)) / (-s2_x * s1_y + s1_x * s2_y);

    if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
        return { x: p0_x + (t * s1_x), z: p0_y + (t * s1_y) };
    }
    return null;
}

/**
 * Pitching Trajectory Calculation with Induced Break
 */
export const calculatePitchTrajectory = (params: PitchingParams): TrajectoryResult => {
  if (params.velocity <= 0.1) {
      return {
          points: [{x: params.releaseSide/100, y: params.releaseHeight, z: MOUND_DISTANCE - params.extension/100, t: 0, breakX: 0, breakY: 0}],
          distance: 0,
          maxHeight: params.releaseHeight,
          hangTime: 0,
          finalPosition: { x: params.releaseSide/100, y: params.releaseHeight },
          plateCrossing: { x: params.releaseSide/100, y: params.releaseHeight }
      };
  }

  const dt = 0.002; 
  const MAX_SIMULATION_TIME = 5.0; 
  
  const v0 = params.velocity * (1000 / 3600); 
  const extensionM = params.extension / 100; 
  const sideM = params.releaseSide / 100; 
  const heightM = params.releaseHeight; 

  let startZ = MOUND_DISTANCE - extensionM;
  let x = sideM;
  let y = heightM;
  let z = startZ;
  let t = 0;

  const hRad = params.hAngle * (Math.PI / 180);
  const vRad = params.vAngle * (Math.PI / 180);

  let vx = v0 * Math.sin(hRad) * Math.cos(vRad);
  let vy = v0 * Math.sin(vRad);
  let vz = -v0 * Math.cos(hRad) * Math.cos(vRad);

  const trueSpin = params.spinRate * (params.spinEfficiency / 100);
  const omega = (trueSpin * 2 * Math.PI) / 60;

  const points: Point3D[] = [];
  let maxHeight = y;
  let plateCrossing: { x: number, y: number } | undefined;

  // --- Variables for calculating Induced Break ---
  // Break is the deviation from a gravity/drag-only path caused by Magnus force.
  // We integrate the Magnus acceleration to track this deviation.
  let vBreakX = 0;
  let vBreakY = 0;
  let currentBreakX = 0; // meters
  let currentBreakY = 0; // meters

  while (z > -CATCHER_DEPTH) {
    const prevX = x;
    const prevY = y;
    const prevZ = z;

    // Store break in cm for UI
    points.push({ x, y, z, t, breakX: currentBreakX * 100, breakY: currentBreakY * 100 });
    
    if (y > maxHeight) maxHeight = y;
    if (t > MAX_SIMULATION_TIME) break;
    if (y <= 0) break;

    const vTotal = Math.sqrt(vx*vx + vy*vy + vz*vz);
    
    // 1. Drag Force
    const Fd = 0.5 * AIR_DENSITY * (vTotal ** 2) * DRAG_COEFFICIENT * BALL_AREA;
    const ad = Fd / BALL_MASS;
    const axDrag = -ad * (vx / vTotal);
    const ayDrag = -ad * (vy / vTotal);
    const azDrag = -ad * (vz / vTotal);

    // 2. Magnus Force
    const S = (BALL_RADIUS * omega) / vTotal;
    const Cl = S; 
    const liftForceMag = 0.5 * AIR_DENSITY * (vTotal ** 2) * BALL_AREA * Cl;
    const radAxis = params.spinDirection * (Math.PI / 180);
    
    const fMagX = liftForceMag * Math.sin(radAxis);
    const fMagY = liftForceMag * Math.cos(radAxis);
    
    const axMag = fMagX / BALL_MASS;
    const ayMag = fMagY / BALL_MASS;
    
    // Total Acceleration
    const ax = axDrag + axMag;
    const ay = -GRAVITY + ayDrag + ayMag;
    const az = azDrag;

    // --- Break Calculation (Integrate Magnus Accel) ---
    vBreakX += axMag * dt;
    vBreakY += ayMag * dt;
    currentBreakX += vBreakX * dt;
    currentBreakY += vBreakY * dt;

    // Physics Update
    vx += ax * dt;
    vy += ay * dt;
    vz += az * dt;

    x += vx * dt;
    y += vy * dt;
    z += vz * dt;
    t += dt;

    if (prevZ >= 0 && z < 0) {
        const fraction = (0 - prevZ) / (z - prevZ);
        plateCrossing = {
            x: prevX + (x - prevX) * fraction,
            y: prevY + (y - prevY) * fraction
        };
    }
  }

  points.push({ x, y, z, t, breakX: currentBreakX * 100, breakY: currentBreakY * 100 });

  return {
    points,
    distance: MOUND_DISTANCE - z, 
    maxHeight,
    hangTime: t,
    finalPosition: { x, y },
    plateCrossing: plateCrossing || { x, y } 
  };
};

export const solvePitchAngles = (params: PitchingParams, targetX: number, targetY: number): { hAngle: number, vAngle: number } => {
  if (params.velocity <= 0.1) {
      return { hAngle: params.hAngle, vAngle: params.vAngle };
  }

  let currentParams = { ...params };
  const distZ = 18.44 - (params.extension / 100);
  const relX = params.releaseSide / 100;
  const relY = params.releaseHeight;
  
  let hAngle = Math.atan2(targetX - relX, distZ) * (180 / Math.PI);
  let vAngle = Math.atan2(targetY - relY, distZ) * (180 / Math.PI);

  for (let i = 0; i < 10; i++) {
    currentParams.hAngle = hAngle;
    currentParams.vAngle = vAngle;
    
    const result = calculatePitchTrajectory(currentParams);
    const crossing = result.plateCrossing || result.finalPosition;
    if (!crossing) break;
    
    const actualX = crossing.x;
    const actualY = crossing.y;
    const errorX = targetX - actualX;
    const errorY = targetY - actualY;
    
    if (Math.abs(errorX) < 0.0005 && Math.abs(errorY) < 0.0005) {
        break;
    }
    
    const gain = 2.5;
    hAngle += errorX * gain;
    vAngle += errorY * gain;
  }
  
  return { hAngle, vAngle };
};
