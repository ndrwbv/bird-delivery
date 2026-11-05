// The same shoulder and rounded peak are sampled for the city mesh and
// the contact field. A smooth taper at the edge keeps distant silhouettes
// from looking like polygonal blocks.
export const bankProfile = radius => Math.pow(Math.max(0, 1 - radius * radius * radius), 1.5);
