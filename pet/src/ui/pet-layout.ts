export const PET_SPEECH_CLEARANCE = 20;

export function calculatePetStageTop(
  speechAreaTop: number,
  speechAreaHeight: number,
  clearance = PET_SPEECH_CLEARANCE,
): number {
  return Math.max(
    0,
    Math.ceil(speechAreaTop + speechAreaHeight + clearance),
  );
}
