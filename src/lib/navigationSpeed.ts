// These are end-to-end limits: the API validates them, the Robot Agent sets
// the matching Nav2 profile before a goal, and the physical base is capped at
// roughly 0.30 m/s by its 90 RPM firmware limit.
export const NAVIGATION_LINEAR_SPEED_MIN = 0.08;
export const NAVIGATION_LINEAR_SPEED_MAX = 0.30;
export const NAVIGATION_TURN_SPEED_MIN = 0.40;
export const NAVIGATION_TURN_SPEED_MAX = 1.00;

export const DEFAULT_NAVIGATION_SPEED = 0.15;
export const DEFAULT_NAVIGATION_TURN_SPEED = 0.60;
